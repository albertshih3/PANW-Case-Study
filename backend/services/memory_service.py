import os
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from pgvector.psycopg2 import register_vector
import openai
import numpy as np

class MemoryService:
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL", "postgresql://localhost/journaling_app")
        # Initialize OpenAI client only if API key is present
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            self.openai_client = openai.OpenAI(api_key=api_key)
        else:
            self.openai_client = None
            print("⚠ OPENAI_API_KEY not set - disabling memory embeddings")
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
            embedding = None
            # Generate embedding for the user message (if OpenAI is configured)
            client = getattr(self, "openai_client", None)
            if client is not None:
                embedding_response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.embeddings.create(
                        input=user_message,
                        model="text-embedding-ada-002"
                    )
                )
                embedding = embedding_response.data[0].embedding
            
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
            # If no embeddings capability, skip retrieval and return empty context
            client = getattr(self, "openai_client", None)
            if client is None:
                return []

            # Generate embedding for the query
            embedding_response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.embeddings.create(
                    input=query,
                    model="text-embedding-ada-002"
                )
            )
            
            query_embedding = embedding_response.data[0].embedding
            
            # Search for similar conversations
            conn = self._connect()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute(
                """
                SELECT user_message, ai_response, timestamp,
                       embedding <=> %s as distance
                FROM conversations
                WHERE embedding IS NOT NULL AND clerk_user_id = %s
                ORDER BY distance
                LIMIT %s
                """,
                (query_embedding, clerk_user_id, limit),
            )
            
            results = cursor.fetchall()
            cursor.close()
            conn.close()
            
            memories = []
            for row in results:
                memory = f"Previous entry: {row['user_message']}"
                memories.append(memory)
            
            return memories
            
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