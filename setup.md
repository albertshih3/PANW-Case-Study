# AI Journaling Companion Setup Guide

This guide will help you get the AI journaling companion up and running locally.

## Prerequisites

1. **Node.js** (v18 or later) for the frontend
2. **Python** (3.9 or later) for the backend
3. **PostgreSQL** (v12 or later) with pgvector extension
4. **API Keys**:
   - Anthropic API key (for Claude)
   - OpenAI API key (for embeddings)

## Installation Steps

### 1. Install PostgreSQL with pgvector

**macOS (using Homebrew):**
```bash
brew install postgresql
brew install pgvector
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo apt-get install postgresql-14-pgvector
sudo systemctl start postgresql
```

### 2. Clone and Setup the Project

```bash
git clone <your-repo-url>
cd PANW-Case-Study
```

### 3. Frontend Setup

```bash
# Install frontend dependencies
npm install

# Start development server (will run on http://localhost:5173)
npm run dev
```

### 4. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Edit .env and add your API keys and database URL
```

### 5. Environment Configuration

Edit `backend/.env` with your configuration:

```env
# AI Service API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration  
DATABASE_URL=postgresql://username:password@localhost:5432/journaling_app
```

### 6. Start the Application

**Backend:**
```bash
cd backend
python start.py
```
This will:
- Check all dependencies
- Initialize the database and pgvector extension
- Start the FastAPI server on http://localhost:8000

**Frontend:**
```bash
# In a separate terminal
npm run dev
```

## Usage

1. Open your browser to http://localhost:5173
2. Start journaling by typing in the chat interface
3. The AI will respond with empathetic, context-aware messages
4. Your conversation history is stored with vector embeddings for pattern recognition

## API Documentation

Once the backend is running, visit http://localhost:8000/docs for interactive API documentation.

## Architecture Overview

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI + LangChain
- **AI**: Claude 4 Sonnet (via Anthropic API)  
- **Memory**: pgvector for semantic search of conversation history
- **Embeddings**: OpenAI embeddings for vector storage

## Troubleshooting

### Database Issues
- Ensure PostgreSQL is running: `pg_ctl status`
- Check pgvector installation: `SELECT * FROM pg_available_extensions WHERE name = 'vector';`

### API Key Issues
- Verify your API keys are valid and have sufficient credits
- Check the .env file is in the backend directory

### Port Conflicts
- Frontend default: 5173
- Backend default: 8000
- Change ports in package.json (frontend) or start.py (backend) if needed