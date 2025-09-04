from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Dict, Any
import os
import json
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

# Configure CORS: allow localhost in dev plus any origins from FRONTEND_ORIGINS (comma-separated)
frontend_origins_env = os.getenv("FRONTEND_ORIGINS") or os.getenv("FRONTEND_ORIGIN") or ""
extra_origins = [o.strip() for o in frontend_origins_env.split(",") if o.strip()]
allow_origins = ["http://localhost:5173", "http://127.0.0.1:5173"] + extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
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
        # Fetch user goals to steer responses
        user_goals = memory_service.get_user_goals(clerk_user_id)
        # Fetch user privacy settings
        # Generate AI response (PII is sanitized inside AI service)
        ai_response = await ai_service.generate_response(user_message, relevant_memories, user_goals)

        # Store the conversation in memory
        await memory_service.store_conversation(clerk_user_id, user_message, ai_response)

        return ChatResponse(response=ai_response, timestamp=datetime.now())

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, clerk_user_id: str = Depends(get_current_user_id)):
    try:
        user_message = request.message
        # ensure user exists in DB
        memory_service.ensure_user(clerk_user_id)

        # Get relevant memories for context
        relevant_memories = await memory_service.get_relevant_memories(clerk_user_id, user_message)
        # Fetch user goals to steer responses
        user_goals = memory_service.get_user_goals(clerk_user_id)
        
        async def generate():
            full_response = ""
            async for chunk in ai_service.generate_response_stream(user_message, relevant_memories, user_goals):
                full_response += chunk
                # Use proper JSON encoding for the chunk
                chunk_data = {"content": chunk}
                # Send each chunk as a Server-Sent Event
                yield f"data: {json.dumps(chunk_data)}\n\n"
            
            # Store the complete conversation in memory after streaming is done
            await memory_service.store_conversation(clerk_user_id, user_message, full_response)
            
            # Send completion signal
            yield f"data: [DONE]\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

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
async def list_journal(clerk_user_id: str = Depends(get_current_user_id), limit: int = 10, offset: int = 0):
    memory_service.ensure_user(clerk_user_id)
    # Clamp values for safety
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    items = memory_service.list_journal_entries(clerk_user_id, limit=limit, offset=offset)
    return items

@app.get("/journal/count")
async def count_journal(clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    try:
        # Lightweight count
        conn = memory_service._connect()  # internal use
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM journal_entries WHERE clerk_user_id = %s", (clerk_user_id,))
        row = cur.fetchone()
        n = int(row[0]) if row else 0
        cur.close()
        conn.close()
        return {"count": n}
    except Exception:
        return {"count": 0}


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
        journal_content = [entry.get("content", "") for entry in recent_entries if entry.get("content")]

        # Include user goals in prompt generation
        user_goals = memory_service.get_user_goals(clerk_user_id)
        # Include user goals in prompt generation
        user_goals = memory_service.get_user_goals(clerk_user_id)

        # Generate opening prompt (PII is sanitized inside AI service)
        opening_message = await ai_service.generate_opening_prompt(journal_content, user_goals)

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
        
        # Analyze the entry for insights (cached by entry id + updated_at)
        insights = await vector_insights_service.analyze_journal_entry_fast_cached(
            entry.get("content", ""),
            entry_id,
            clerk_user_id,
            entry.get("updated_at")
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


class SparklinePoint(BaseModel):
    date: str
    score: float

class SparklineResponse(BaseModel):
    points: list[SparklinePoint]
    window_days: int
    entries: int

@app.get("/insights/sparkline", response_model=SparklineResponse)
async def get_sentiment_sparkline(clerk_user_id: str = Depends(get_current_user_id), days: int = 30):
    """Return a simple daily sentiment sparkline for the last N days."""
    try:
        memory_service.ensure_user(clerk_user_id)
        entries = memory_service.list_journal_entries(clerk_user_id, limit=200)
        cutoff = datetime.now() - timedelta(days=days)
        # Use vector insights service to get per-entry quick sentiment (reuse analyze_journal_entry_fast)
        points_raw = []
        for e in entries:
            created = e.get("created_at")
            dt = created if hasattr(created, 'year') else None
            if isinstance(created, str):
                try:
                    dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                except:
                    dt = datetime.now()
            if not dt or dt < cutoff:
                continue
            try:
                eid_val = e.get("id")
                if eid_val is None:
                    continue
                eid = int(eid_val)
                insight = await vector_insights_service.analyze_journal_entry_fast_cached(e.get("content", ""), eid, clerk_user_id, e.get("updated_at"))
                score = float(insight.get("sentiment_score", 0.5))
                points_raw.append((dt.date().isoformat(), score))
            except Exception:
                continue
        # Aggregate by day (average)
        daily: Dict[str, list[float]] = {}
        for d, s in points_raw:
            daily.setdefault(d, []).append(s)
        points = [SparklinePoint(date=k, score=sum(v)/len(v)) for k, v in sorted(daily.items())]
        return SparklineResponse(points=points, window_days=days, entries=len(entries))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sparkline error: {str(e)}")


# --- P3: Engagement streaks & keyword cloud ---
class StreaksResponse(BaseModel):
    current_streak: int
    best_streak: int
    active_days_last_30: int

@app.get("/engagement/streaks", response_model=StreaksResponse)
async def get_streaks(clerk_user_id: str = Depends(get_current_user_id)):
    """Compute journaling streaks from journal entries created_at dates."""
    try:
        memory_service.ensure_user(clerk_user_id)
        entries = memory_service.list_journal_entries(clerk_user_id, limit=365)

        # Collect unique active dates (date strings in ISO)
        dates: set[str] = set()
        for e in entries:
            dt = e.get('created_at')
            if isinstance(dt, str):
                try:
                    d = datetime.fromisoformat(dt.replace('Z','+00:00')).date()
                except Exception:
                    continue
            elif dt is not None and hasattr(dt, 'date'):
                try:
                    d = dt.date()  # type: ignore[assignment]
                except Exception:
                    continue
            else:
                continue
            dates.add(d.isoformat())

        if not dates:
            return StreaksResponse(current_streak=0, best_streak=0, active_days_last_30=0)

        # Compute current and best streaks
        sorted_days = sorted(dates)
        # Convert back to date objects for math
        from datetime import date as _date
        date_objs = [datetime.fromisoformat(d).date() for d in sorted_days]
        best = 1
        curr = 1
        for i in range(1, len(date_objs)):
            if (date_objs[i] - date_objs[i-1]).days == 1:
                curr += 1
                best = max(best, curr)
            elif date_objs[i] == date_objs[i-1]:
                continue
            else:
                curr = 1

        # Current streak up to today
        today = datetime.now().date()
        current_streak = 0
        if date_objs[-1] == today:
            # walk backwards while consecutive
            current_streak = 1
            i = len(date_objs) - 1
            while i > 0 and (date_objs[i] - date_objs[i-1]).days == 1:
                current_streak += 1
                i -= 1
        elif (today - date_objs[-1]).days == 1:
            # streak ended yesterday
            current_streak = 0
        else:
            current_streak = 0

        # Active days in last 30
        cutoff = today - timedelta(days=29)
        active_last_30 = sum(1 for d in date_objs if d >= cutoff)

        return StreaksResponse(current_streak=current_streak, best_streak=best, active_days_last_30=active_last_30)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaks error: {str(e)}")


class KeywordItem(BaseModel):
    word: str
    count: int
    weight: float

class KeywordCloudResponse(BaseModel):
    keywords: list[KeywordItem]

@app.get("/insights/keywords", response_model=KeywordCloudResponse)
async def get_keyword_cloud(clerk_user_id: str = Depends(get_current_user_id), days: int = 60, top_n: int = 30):
    """Return top keywords across recent entries for a simple word cloud."""
    try:
        memory_service.ensure_user(clerk_user_id)
        entries = memory_service.list_journal_entries(clerk_user_id, limit=200)

        def safe_datetime_parse(dt_value):
            if isinstance(dt_value, str):
                try:
                    return datetime.fromisoformat(dt_value.replace('Z', '+00:00'))
                except:
                    return datetime.now()
            elif dt_value is not None and hasattr(dt_value, 'year'):
                return dt_value
            else:
                return datetime.now()

        if days > 0:
            cutoff_date = datetime.now() - timedelta(days=days)
            recent_entries = [e for e in entries if safe_datetime_parse(e.get('created_at')) >= cutoff_date]
        else:
            recent_entries = entries

        extractor = getattr(vector_insights_service, "fast_extract_keywords", None)
        keywords_data = extractor([dict(e) for e in recent_entries], top_n=top_n) if callable(extractor) else []
        if not isinstance(keywords_data, list):
            keywords_data = []
        cleaned = []
        for item in keywords_data:
            if isinstance(item, dict) and 'word' in item:
                cleaned.append(item)
        return KeywordCloudResponse(keywords=[KeywordItem(**k) for k in cleaned])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Keyword error: {str(e)}")


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
        trends = await vector_insights_service.analyze_trends_fast([dict(e) for e in recent_entries])

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
            trends = await vector_insights_service.analyze_trends_fast([dict(e) for e in entries[:10]])
        except (ValueError, RuntimeError) as e:
            raise HTTPException(status_code=400, detail=f"Trend analysis failed: {str(e)}")
        
        # Get insights for most recent entries
        recent_insights = []
        analysis_errors = []
        
        if len(entries) > 0:
            for entry in entries[:5]:  # Last 5 entries
                try:
                    eid_val = entry.get("id")
                    if eid_val is None:
                        continue
                    insights = await vector_insights_service.analyze_journal_entry_fast_cached(
                        entry.get("content", ""),
                        eid_val,
                        clerk_user_id,
                        entry.get("updated_at")
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

# --- New: Journal edit/delete endpoints ---
from typing import Optional

class JournalUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

@app.patch("/journal/{entry_id}")
async def update_journal(entry_id: int, payload: JournalUpdate, clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    ok = memory_service.update_journal_entry(clerk_user_id, entry_id, title=payload.title, content=payload.content)
    if not ok:
        raise HTTPException(status_code=404, detail="Journal entry not found or not updated")
    # Return updated item
    items = memory_service.list_journal_entries(clerk_user_id, limit=100)
    entry = next((e for e in items if e["id"] == entry_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found after update")
    return entry

@app.delete("/journal/{entry_id}")
async def delete_journal(entry_id: int, clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    ok = memory_service.delete_journal_entry(clerk_user_id, entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return {"success": True}

# --- New: User goals endpoints ---
class GoalsPayload(BaseModel):
    goals: list[str]

@app.get("/user/goals")
async def get_goals(clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    return {"goals": memory_service.get_user_goals(clerk_user_id)}

@app.put("/user/goals")
async def put_goals(payload: GoalsPayload, clerk_user_id: str = Depends(get_current_user_id)):
    memory_service.ensure_user(clerk_user_id)
    ok = memory_service.set_user_goals(clerk_user_id, payload.goals or [])
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to save goals")
    return {"success": True}

# (Removed) User settings endpoints; local-only mode deprecated in favor of PII sanitization

# --- New: Weekly/Monthly summary endpoint ---
class Period(str):
    pass

class SummaryResponse(BaseModel):
    period: str
    summary: Dict[str, Any]
    generated_at: datetime

@app.get("/insights/summary", response_model=SummaryResponse)
async def get_period_summary(period: str = "week", clerk_user_id: str = Depends(get_current_user_id)):
    """Generate a concise weekly/monthly reflection summary."""
    try:
        memory_service.ensure_user(clerk_user_id)
        # Use existing entries and trends to craft a summary
        entries = memory_service.list_journal_entries(clerk_user_id, limit=60)
        # Select period window
        now = datetime.now()
        window = 7 if period == "week" else 30

        def safe_dt(v):
            if isinstance(v, str):
                try:
                    return datetime.fromisoformat(v.replace('Z', '+00:00'))
                except:
                    return now
            if hasattr(v, 'year'):
                return v
            return now

        recent = []
        for e in entries:
            dt_val = e.get("created_at")
            created = safe_dt(dt_val) if dt_val is not None else now
            if (now - created) <= timedelta(days=window):
                recent.append(e)
        trends = await vector_insights_service.analyze_trends_fast([dict(e) for e in recent])
        # Build summary object
        top_themes = ", ".join([t.get("theme", "").replace('_', ' ') for t in trends.get("dominant_themes", [])[:3]]) or "varied topics"
        top_emotions = ", ".join([e.get("emotion", "") for e in trends.get("emotional_patterns", [])[:3]]) or "mixed feelings"
        sentiment = trends.get("overall_sentiment_trend", "stable")
        recs = trends.get("recommendations", [])[:2]
        summary = {
            "n_entries": len(recent),
            "sentiment_trend": sentiment,
            "top_themes": top_themes,
            "top_emotions": top_emotions,
            "highlights": [trends.get("insights_summary", "")],
            "suggestions": recs,
        }
        return SummaryResponse(period=period, summary=summary, generated_at=datetime.now())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary error: {str(e)}")

# --- New: User data export endpoint ---
@app.get("/export")
async def export_user_data(download: bool = False, clerk_user_id: str = Depends(get_current_user_id)):
    """Export the user's data (journals, conversations, and goals) as JSON.

    - Set download=true to suggest a file download in browsers.
    """
    try:
        memory_service.ensure_user(clerk_user_id)
        data = memory_service.export_user_data(clerk_user_id)
        headers = {}
        if download:
            filename = f"keo-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            headers["Content-Disposition"] = f"attachment; filename={filename}"
        return JSONResponse(content=data, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")