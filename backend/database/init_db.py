import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from urllib.parse import urlparse
from dotenv import load_dotenv

def create_database_and_extension():
    """Initialize PostgreSQL database with pgvector extension"""
    
    # Load environment variables from .env file
    load_dotenv()
    
    db_url = os.getenv("DATABASE_URL", "postgresql://localhost/journaling_app")
    
    # Parse database URL using urlparse to handle query parameters
    parsed = urlparse(db_url)
    
    host = parsed.hostname or "localhost"
    port = str(parsed.port) if parsed.port else "5432"
    username = parsed.username or "postgres"
    password = parsed.password or ""
    db_name = parsed.path.lstrip('/') or "journaling_app"
    
    try:
        # Connect to default postgres database first
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=username,
            password=password,
            database="postgres",
            sslmode="require"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        
        cursor = conn.cursor()
        
        # Create database if it doesn't exist
        cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{db_name}'")
        exists = cursor.fetchone()
        if not exists:
            cursor.execute(f'CREATE DATABASE "{db_name}"')
            print(f"Created database: {db_name}")
        else:
            print(f"Database {db_name} already exists")
        
        cursor.close()
        conn.close()
        
        # Connect to the actual database and create extension
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=username,
            password=password,
            database=db_name,
            sslmode="require"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        
        cursor = conn.cursor()
        
        # Create pgvector extension
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
        print("pgvector extension enabled")
        
        cursor.close()
        conn.close()
        
        print("Database initialization complete!")
        
    except Exception as e:
        print(f"Error initializing database: {e}")
        print("Make sure PostgreSQL is running and pgvector is installed")
        raise

if __name__ == "__main__":
    create_database_and_extension()