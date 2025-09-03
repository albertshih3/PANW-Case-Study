import os
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from pgvector.psycopg2 import register_vector
import numpy as np

class MemoryService:
    def __init__(self):
        # Use Supabase database URL directly
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        # Claude-first app: remove OpenAI usage; memory retrieval will use lexical similarity
        print("✓ MemoryService initialized (Claude-first, no OpenAI)")
        self._initialize_database()

    def _connect(self):
        """Create a DB connection and register pgvector adapter."""
        conn = psycopg2.connect(self.database_url)
        try:
            register_vector(conn)
        except Exception:
            # If extension not installed yet or already registered, ignore
            pass
        return conn
    
    def _initialize_database(self):
        try:
            conn = self._connect()
            cursor = conn.cursor()
            
            # Create table for storing conversations with embeddings
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    clerk_user_id TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id SERIAL PRIMARY KEY,
                    clerk_user_id TEXT NOT NULL,
                    user_message TEXT NOT NULL,
                    ai_response TEXT NOT NULL,
                    embedding VECTOR(1536),
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id SERIAL PRIMARY KEY,
                    clerk_user_id TEXT NOT NULL,
                    title TEXT,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            conn.commit()
            # Lightweight schema migration for existing DBs where conversations may lack clerk_user_id
            try:
                cursor.execute(
                    """
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'conversations' AND column_name = 'clerk_user_id'
                    """
                )
                has_clerk_column = cursor.fetchone() is not None
                if not has_clerk_column:
                    cursor.execute("ALTER TABLE conversations ADD COLUMN clerk_user_id TEXT")
                    print("✓ Added missing column conversations.clerk_user_id")
                    conn.commit()
            except Exception as mig_e:
                # Non-fatal; storage can still proceed without clerk_user_id, but features will be limited
                print(f"Warning: Schema migration check failed: {mig_e}")
            cursor.close()
            conn.close()
            print("✓ Memory database initialized")
            
        except Exception as e:
            print(f"Warning: Could not initialize memory database: {e}")
            print("Memory features will be disabled")
    
    async def store_conversation(self, clerk_user_id: str, user_message: str, ai_response: str):
        try:
            # No embeddings; store message and response only (embedding remains NULL)
            embedding = None
            
            # Store in database
            conn = self._connect()
            cursor = conn.cursor()
            
            cursor.execute(
                """
                INSERT INTO conversations (clerk_user_id, user_message, ai_response, embedding)
                VALUES (%s, %s, %s, %s)
                """,
                (clerk_user_id, user_message, ai_response, embedding),
            )
            
            conn.commit()
            cursor.close()
            conn.close()
            
        except Exception as e:
            print(f"Error storing conversation: {e}")
    
    async def get_relevant_memories(self, clerk_user_id: str, query: str, limit: int = 3) -> List[str]:
        try:
            # Lexical similarity (cosine on bag-of-words) over recent conversations
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, user_message, ai_response, timestamp
                FROM conversations
                WHERE clerk_user_id = %s
                ORDER BY timestamp DESC
                LIMIT 200
                """,
                (clerk_user_id,),
            )
            rows = cursor.fetchall() or []
            cursor.close()
            conn.close()

            def tokenize(t: str) -> List[str]:
                return [w for w in ''.join([c.lower() if c.isalnum() else ' ' for c in t]).split() if w]

            q_tokens = tokenize(query or "")
            if not q_tokens:
                return []

            vocab: Dict[str, int] = {}
            for w in q_tokens:
                if w not in vocab:
                    vocab[w] = len(vocab)

            def vec(tokens: List[str]) -> np.ndarray:
                v = np.zeros(len(vocab), dtype=float)
                for w in tokens:
                    idx = vocab.get(w)
                    if idx is not None:
                        v[idx] += 1.0
                n = np.linalg.norm(v)
                return v / n if n > 0 else v

            q_vec = vec(q_tokens)

            scored: List[Dict[str, Any]] = []
            for row in rows:
                d_tokens = tokenize(row.get("user_message") or "")
                d_vec = vec(d_tokens)
                sim = float(np.dot(q_vec, d_vec)) if q_vec.size and d_vec.size else 0.0
                if sim > 0:
                    scored.append({"row": row, "sim": sim})

            scored.sort(key=lambda x: x["sim"], reverse=True)
            top = scored[:limit]
            return [f"Previous entry: {it['row']['user_message']}" for it in top]
            
        except Exception as e:
            print(f"Error retrieving memories: {e}")
            return []

    def ensure_user(self, clerk_user_id: str):
        try:
            conn = self._connect()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (clerk_user_id)
                VALUES (%s)
                ON CONFLICT (clerk_user_id) DO NOTHING
                """,
                (clerk_user_id,),
            )
            conn.commit()
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"Error ensuring user: {e}")

    def create_journal_entry(self, clerk_user_id: str, title: Optional[str], content: str):
        try:
            conn = self._connect()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO journal_entries (clerk_user_id, title, content)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (clerk_user_id, title, content),
            )
            row = cursor.fetchone()
            conn.commit()
            cursor.close()
            conn.close()
            return row[0] if row else None
        except Exception as e:
            print(f"Error creating journal entry: {e}")
            return None

    def list_journal_entries(self, clerk_user_id: str, limit: int = 20):
        try:
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, title, content, created_at, updated_at
                FROM journal_entries
                WHERE clerk_user_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (clerk_user_id, limit),
            )
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return rows
        except Exception as e:
            print(f"Error listing journal entries: {e}")
            return []

    def list_conversations(self, clerk_user_id: str, limit: int = 20):
        try:
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, user_message, ai_response, timestamp
                FROM conversations
                WHERE clerk_user_id = %s
                ORDER BY timestamp DESC
                LIMIT %s
                """,
                (clerk_user_id, limit),
            )
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return rows
        except Exception as e:
            print(f"Error listing conversations: {e}")
            return []