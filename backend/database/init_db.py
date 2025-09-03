import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def create_database_and_extension():
    """Initialize PostgreSQL database with pgvector extension"""
    
    db_url = os.getenv("DATABASE_URL", "postgresql://localhost/journaling_app")
    
    # Parse database URL
    if db_url.startswith("postgresql://"):
        parts = db_url.replace("postgresql://", "").split("/")
        if len(parts) == 2:
            host_info, db_name = parts
            if "@" in host_info:
                user_pass, host_port = host_info.split("@")
                if ":" in user_pass:
                    username, password = user_pass.split(":")
                else:
                    username = user_pass
                    password = ""
            else:
                host_port = host_info
                username = "postgres"
                password = ""
            
            if ":" in host_port:
                host, port = host_port.split(":")
            else:
                host = host_port
                port = "5432"
        else:
            host = "localhost"
            port = "5432"
            username = "postgres"
            password = ""
            db_name = "journaling_app"
    else:
        host = "localhost"
        port = "5432"
        username = "postgres"
        password = ""
        db_name = "journaling_app"
    
    try:
        # Connect to default postgres database first
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=username,
            password=password,
            database="postgres"
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
            database=db_name
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