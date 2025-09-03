from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Dict, Any
import os
from dotenv import load_dotenv
from pathlib import Path

from services.ai_service import AIService
from services.memory_service import MemoryService
from services.vector_insights_service import VectorInsightsService
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
vector_insights_service = VectorInsightsService()

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


class OpeningPromptResponse(BaseModel):
    message: str
    timestamp: datetime


@app.get("/opening-prompt", response_model=OpeningPromptResponse)
async def get_opening_prompt(clerk_user_id: str = Depends(get_current_user_id)):
    """Generate a contextual opening prompt based on user's recent journal entries."""
    try:
        memory_service.ensure_user(clerk_user_id)
        
        # Get recent journal entries for context
        recent_entries = memory_service.list_journal_entries(clerk_user_id, limit=3)
        journal_content = [entry["content"] for entry in recent_entries if entry["content"]]
        
        # Generate opening prompt
        opening_message = await ai_service.generate_opening_prompt(journal_content)
        
        return OpeningPromptResponse(message=opening_message, timestamp=datetime.now())
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class JournalInsightsResponse(BaseModel):
    entry_id: int
    insights: Dict[str, Any]
    generated_at: datetime


class TrendsAnalysisResponse(BaseModel):
    analysis: Dict[str, Any]
    generated_at: datetime
    entries_analyzed: int


@app.get("/journal/{entry_id}/insights", response_model=JournalInsightsResponse)
async def get_journal_insights(entry_id: int, clerk_user_id: str = Depends(get_current_user_id)):
    """Get AI-powered insights for a specific journal entry."""
    try:
        memory_service.ensure_user(clerk_user_id)
        
        # Get the specific journal entry
        entries = memory_service.list_journal_entries(clerk_user_id, limit=100)
        entry = next((e for e in entries if e["id"] == entry_id), None)
        
        if not entry:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        
        # Analyze the entry for insights using fast vector-based analysis
        insights = await vector_insights_service.analyze_journal_entry_fast(
            entry["content"], 
            entry["id"], 
            clerk_user_id
        )
        
        return JournalInsightsResponse(
            entry_id=entry_id,
            insights=insights,
            generated_at=datetime.now()
        )
        
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Analysis error: {str(ve)}")
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=f"Technical error: {str(re)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/insights/trends", response_model=TrendsAnalysisResponse)
async def get_emotional_trends(clerk_user_id: str = Depends(get_current_user_id), days: int = 30):
    """Get emotional trends and patterns analysis across journal entries."""
    try:
        memory_service.ensure_user(clerk_user_id)
        
        # Get recent journal entries for trend analysis
        all_entries = memory_service.list_journal_entries(clerk_user_id, limit=50)
        
        # Helper function to safely parse datetime
        def safe_datetime_parse(dt_value):
            if isinstance(dt_value, str):
                try:
                    return datetime.fromisoformat(dt_value.replace('Z', '+00:00'))
                except:
                    return datetime.now()
            elif hasattr(dt_value, 'year'):  # datetime object
                return dt_value
            else:
                return datetime.now()
        
        # Filter entries by date range if needed
        if days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            recent_entries = [
                entry for entry in all_entries 
                if safe_datetime_parse(entry["created_at"]) >= cutoff_date
            ]
        else:
            recent_entries = all_entries
        
        # Analyze trends using fast vector-based analysis
        trends = await vector_insights_service.analyze_trends_fast(recent_entries)
        
        return TrendsAnalysisResponse(
            analysis=trends,
            generated_at=datetime.now(),
            entries_analyzed=len(recent_entries)
        )
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Analysis error: {str(ve)}")
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=f"Technical error: {str(re)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/insights/dashboard")
async def get_insights_dashboard(clerk_user_id: str = Depends(get_current_user_id)):
    """Get comprehensive dashboard data including trends, recent insights, and statistics."""
    try:
        memory_service.ensure_user(clerk_user_id)
        
        # Get journal entries
        entries = memory_service.list_journal_entries(clerk_user_id, limit=30)
        conversations = memory_service.list_conversations(clerk_user_id, limit=30)
        
        # Helper function to safely parse datetime
        def safe_datetime_parse(dt_value):
            if isinstance(dt_value, str):
                try:
                    return datetime.fromisoformat(dt_value.replace('Z', '+00:00'))
                except:
                    return datetime.now()
            elif hasattr(dt_value, 'year'):  # datetime object
                return dt_value
            else:
                return datetime.now()
        
        # Basic statistics
        cutoff_week = datetime.now() - timedelta(days=7)
        cutoff_month = datetime.now() - timedelta(days=30)
        
        stats = {
            "total_entries": len(entries),
            "total_conversations": len(conversations),
            "entries_this_week": len([
                e for e in entries 
                if safe_datetime_parse(e["created_at"]) >= cutoff_week
            ]),
            "entries_this_month": len([
                e for e in entries 
                if safe_datetime_parse(e["created_at"]) >= cutoff_month
            ])
        }
        
        # Get recent trends using fast vector-based analysis
        try:
            trends = await vector_insights_service.analyze_trends_fast(entries[:10])
        except (ValueError, RuntimeError) as e:
            raise HTTPException(status_code=400, detail=f"Trend analysis failed: {str(e)}")
        
        # Get insights for most recent entries
        recent_insights = []
        analysis_errors = []
        
        if len(entries) > 0:
            for entry in entries[:5]:  # Last 5 entries
                try:
                    insights = await vector_insights_service.analyze_journal_entry_fast(
                        entry["content"], 
                        entry["id"], 
                        clerk_user_id
                    )
                    recent_insights.append({
                        "entry_id": entry["id"],
                        "date": entry["created_at"].isoformat() if hasattr(entry["created_at"], 'isoformat') else str(entry["created_at"]),
                        "title": entry.get("title", "Untitled Entry"),
                        "sentiment_score": insights.get("sentiment_score", 0.5),
                        "dominant_emotion": insights["emotions"][0]["emotion"] if insights.get("emotions") and len(insights["emotions"]) > 0 else "neutral",
                        "main_theme": insights["themes"][0]["theme"] if insights.get("themes") and len(insights["themes"]) > 0 else "reflection"
                    })
                except (ValueError, RuntimeError) as e:
                    print(f"Error analyzing entry {entry['id']}: {e}")
                    analysis_errors.append(f"Entry '{entry.get('title', 'Untitled')}': {str(e)}")
                    # Skip entries that can't be analyzed instead of adding fake data
        
        # If all entries failed analysis, return error
        if len(entries) > 0 and len(recent_insights) == 0:
            error_details = "; ".join(analysis_errors[:3])  # Show first 3 errors
            raise HTTPException(
                status_code=400, 
                detail=f"Unable to analyze any journal entries. Issues: {error_details}"
            )
        
        return {
            "statistics": stats,
            "trends": trends,
            "recent_insights": recent_insights,
            "generated_at": datetime.now()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)