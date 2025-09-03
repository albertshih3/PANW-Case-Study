#!/usr/bin/env python3

import os
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv

def check_requirements():
    """Check if required dependencies are installed"""
    try:
        import fastapi
        import uvicorn
        import langchain
        import psycopg2
        print("✓ All Python dependencies found")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("Please run: pip install -r requirements.txt")
        return False

def check_environment():
    """Check if required environment variables are set"""
    required_vars = ["ANTHROPIC_API_KEY", "DATABASE_URL"]
    missing_vars = []
    
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"✗ Missing environment variables: {', '.join(missing_vars)}")
        print("Please create a .env file based on .env.example")
        return False
    
    # Check optional but recommended vars
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠ OPENAI_API_KEY not set - memory features will be limited")
    
    print("✓ Environment variables configured")
    return True

def check_database():
    """Check if PostgreSQL is available and pgvector is installed"""
    try:
        import psycopg2
        db_url = os.getenv("DATABASE_URL", "postgresql://localhost/journaling_app")
        
        # Try to connect to database
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        # Check if pgvector extension is available
        cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        has_vector = cursor.fetchone() is not None
        
        cursor.close()
        conn.close()
        
        if has_vector:
            print("✓ Database connected and pgvector extension found")
            return True
        else:
            print("✗ pgvector extension not found")
            print("Run: python database/init_db.py to initialize")
            return False
            
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        print("Make sure PostgreSQL is running and accessible")
        return False

def initialize_database():
    """Initialize database and pgvector extension"""
    try:
        from database.init_db import create_database_and_extension
        print("Initializing database...")
        create_database_and_extension()
        return True
    except Exception as e:
        print(f"Database initialization failed: {e}")
        return False

def start_server():
    """Start the FastAPI server"""
    print("Starting AI Journaling Companion API server...")
    print("Server will be available at: http://localhost:8000")
    print("API docs available at: http://localhost:8000/docs")
    print("\nPress Ctrl+C to stop the server")
    
    try:
        import uvicorn
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except Exception as e:
        print(f"Error starting server: {e}")

def main():
    print("🤖 AI Journaling Companion - Backend Setup")
    print("=" * 50)
    
    # Change to backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    # Load environment variables from backend/.env then project root .env
    load_dotenv(backend_dir / ".env")
    load_dotenv(backend_dir.parent / ".env")
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    # Check environment
    if not check_environment():
        sys.exit(1)
    
    # Check/initialize database
    if not check_database():
        print("\nAttempting to initialize database...")
        if not initialize_database():
            sys.exit(1)
    
    print("\n✅ All checks passed! Starting server...\n")
    start_server()

if __name__ == "__main__":
    main()