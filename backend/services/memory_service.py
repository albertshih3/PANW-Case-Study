import os
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from pgvector.psycopg2 import register_vector
import numpy as np
from .crypto_utils import encrypt_text_for_user, decrypt_text_for_user

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
            
            # Create table for users
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    clerk_user_id TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            # User goals table: one row per user (JSON text payload)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_goals (
                    clerk_user_id TEXT PRIMARY KEY,
                    goals_json TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            
            conn.commit()
            cursor.close()
            conn.close()
            print("✓ Memory database initialized")
            
        except Exception as e:
            print(f"Warning: Could not initialize memory database: {e}")
            print("Memory features will be disabled")
    
    async def get_relevant_memories(self, clerk_user_id: str, query: str, limit: int = 3) -> List[str]:
        try:
            # Lexical similarity (cosine on bag-of-words) over recent journal entries
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, content, created_at
                FROM journal_entries
                WHERE clerk_user_id = %s
                ORDER BY created_at DESC
                LIMIT 200
                """,
                (clerk_user_id,),
            )
            rows = cursor.fetchall() or []
            # Decrypt content for similarity
            for row in rows:
                row["content"] = decrypt_text_for_user(clerk_user_id, row.get("content"))
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
                d_tokens = tokenize(row.get("content") or "")
                d_vec = vec(d_tokens)
                sim = float(np.dot(q_vec, d_vec)) if q_vec.size and d_vec.size else 0.0
                if sim > 0:
                    scored.append({"row": row, "sim": sim})

            scored.sort(key=lambda x: x["sim"], reverse=True)
            top = scored[:limit]
            return [f"Previous entry: {it['row']['content']}" for it in top]
            
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
                (
                    clerk_user_id,
                    encrypt_text_for_user(clerk_user_id, title) if title is not None else None,
                    encrypt_text_for_user(clerk_user_id, content),
                ),
            )
            row = cursor.fetchone()
            conn.commit()
            cursor.close()
            conn.close()
            return row[0] if row else None
        except Exception as e:
            print(f"Error creating journal entry: {e}")
            return None

    def list_journal_entries(self, clerk_user_id: str, limit: int = 20, offset: int = 0):
        try:
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, title, content, created_at, updated_at
                FROM journal_entries
                WHERE clerk_user_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (clerk_user_id, limit, offset),
            )
            rows = cursor.fetchall()
            # Decrypt fields
            for r in rows:
                r["title"] = decrypt_text_for_user(clerk_user_id, r.get("title")) if r.get("title") is not None else None
                r["content"] = decrypt_text_for_user(clerk_user_id, r.get("content"))
            cursor.close()
            conn.close()
            return rows
        except Exception as e:
            print(f"Error listing journal entries: {e}")
            return []

    def update_journal_entry(self, clerk_user_id: str, entry_id: int, title: Optional[str] = None, content: Optional[str] = None) -> bool:
        """Update title and/or content for a journal entry owned by the user."""
        if title is None and content is None:
            return False
        try:
            conn = self._connect()
            cursor = conn.cursor()
            # Build dynamic query
            fields = []
            params = []
            if title is not None:
                fields.append("title = %s")
                params.append(encrypt_text_for_user(clerk_user_id, title))
            if content is not None:
                fields.append("content = %s")
                params.append(encrypt_text_for_user(clerk_user_id, content))
            fields.append("updated_at = CURRENT_TIMESTAMP")
            params.extend([clerk_user_id, entry_id])
            query = f"UPDATE journal_entries SET {', '.join(fields)} WHERE clerk_user_id = %s AND id = %s"
            cursor.execute(query, tuple(params))
            updated = cursor.rowcount > 0
            conn.commit()
            cursor.close()
            conn.close()
            return updated
        except Exception as e:
            print(f"Error updating journal entry: {e}")
            return False

    def delete_journal_entry(self, clerk_user_id: str, entry_id: int) -> bool:
        try:
            conn = self._connect()
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM journal_entries
                WHERE clerk_user_id = %s AND id = %s
                """,
                (clerk_user_id, entry_id)
            )
            deleted = cursor.rowcount > 0
            conn.commit()
            cursor.close()
            conn.close()
            return deleted
        except Exception as e:
            print(f"Error deleting journal entry: {e}")
            return False

    # Conversations are not stored; nothing to delete.

    # Conversations storage removed for privacy; no conversation listing retained.


    # --- User goals CRUD ---
    def get_user_goals(self, clerk_user_id: str) -> List[str]:
        try:
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT goals_json FROM user_goals WHERE clerk_user_id = %s
                """,
                (clerk_user_id,)
            )
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if not row or not row.get("goals_json"):
                return []
            try:
                import json
                decrypted = decrypt_text_for_user(clerk_user_id, row["goals_json"]) if row.get("goals_json") else None
                goals = json.loads(decrypted) if decrypted else []
                if isinstance(goals, list):
                    return [str(g) for g in goals]
                if isinstance(goals, dict) and "goals" in goals:
                    return [str(g) for g in goals.get("goals") or []]
                return []
            except Exception:
                return []
        except Exception as e:
            print(f"Error fetching user goals: {e}")
            return []

    def set_user_goals(self, clerk_user_id: str, goals: List[str]) -> bool:
        try:
            import json
            goals_json = json.dumps(goals)
            enc = encrypt_text_for_user(clerk_user_id, goals_json)
            conn = self._connect()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO user_goals (clerk_user_id, goals_json, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (clerk_user_id)
                DO UPDATE SET goals_json = EXCLUDED.goals_json, updated_at = CURRENT_TIMESTAMP
                """,
                (clerk_user_id, enc)
            )
            conn.commit()
            cursor.close()
            conn.close()
            return True
        except Exception as e:
            print(f"Error setting user goals: {e}")
            return False

    # --- Export helpers ---
    def export_user_data(self, clerk_user_id: str) -> Dict[str, Any]:
        try:
            data: Dict[str, Any] = {}
            data["journal_entries"] = self.list_journal_entries(clerk_user_id, limit=10000)
            # Conversations are not retained by design
            data["conversations"] = []
            data["goals"] = self.get_user_goals(clerk_user_id)
            # Settings removed; export remains backward compatible without settings
            return data
        except Exception as e:
            print(f"Error exporting data: {e}")
            return {"journal_entries": [], "conversations": [], "goals": []}