from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import os
from dotenv import load_dotenv
from pathlib import Path

from services.ai_service import AIService
from services.memory_service import MemoryService
from services.auth import get_current_user_id

base_dir = Path(__file__).resolve().parent
# Load env from backend/.env then project root .env
load_dotenv(base_dir / ".env")
load_dotenv(base_dir.parent / ".env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_service = AIService()
memory_service = MemoryService()

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    timestamp: datetime

@app.get("/")
async def root():
    return {"message": "AI Journaling Companion API"}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        user_message = request.message
        # ensure user exists in DB
        memory_service.ensure_user(clerk_user_id)

        # Get relevant memories for context
        relevant_memories = await memory_service.get_relevant_memories(clerk_user_id, user_message)

        # Generate AI response
        ai_response = await ai_service.generate_response(user_message, relevant_memories)

        # Store the conversation in memory
        await memory_service.store_conversation(clerk_user_id, user_message, ai_response)

        return ChatResponse(response=ai_response, timestamp=datetime.now())

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


from typing import Optional, List


class JournalCreate(BaseModel):
    title: Optional[str] = None  # Optional title
    content: str

class JournalItem(BaseModel):
    id: int
    title: Optional[str] = None
    content: str
    created_at: datetime
    updated_at: datetime


@app.get("/journal")
async def list_journal(clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    items = memory_service.list_journal_entries(clerk_user_id)
    return items


@app.post("/journal")
async def create_journal(payload: JournalCreate, clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    new_id = memory_service.create_journal_entry(clerk_user_id, payload.title, payload.content)
    if not new_id:
        raise HTTPException(status_code=500, detail="Failed to create journal entry")
    # Return the new item by listing and finding it; for simplicity
    items = memory_service.list_journal_entries(clerk_user_id, limit=1)
    if items:
        return items[0]
    raise HTTPException(status_code=500, detail="Failed to load created journal entry")


@app.get("/conversations")
async def list_conversations(clerk_user_id: str = Depends(get_current_user_id), limit: int = 50):
    memory_service.ensure_user(clerk_user_id)
    items = memory_service.list_conversations(clerk_user_id, limit=limit)
    return items

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)