import os
import asyncio
from typing import List, Dict, Any, Optional, Set, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor
from pgvector.psycopg2 import register_vector
import numpy as np
from collections import Counter
import json
from datetime import datetime
import re
import math
import httpx

class VectorInsightsService:
    """
    A service for analyzing journal entries to extract insights, themes, and trends.
    This service uses Claude AI for intelligent analysis while maintaining fast
    TF-IDF similarity matching for finding related entries.
    """

    # Common English stopwords for keyword extraction (kept small and local)
    STOPWORDS: Set[str] = {
        'the','a','an','and','or','but','if','then','than','that','this','those','these','to','of','in','on','for','from','by','with','as','at','it','its','be','is','are','was','were','am','i','you','he','she','they','we','me','him','her','them','my','your','our','their','mine','yours','ours','theirs','not','no','so','too','very','just','about','into','over','under','again','once','than','also','been','being','do','does','did','doing','have','has','had','having','can','could','should','would','may','might','must','will','shall','up','down','out','off','more','most','some','such','other','only','own','same','both','each','few','how','why','when','where','what','who','whom','which'
    }


    def __init__(self):
        """Initializes the VectorInsightsService."""
        self.database_url = os.getenv("DATABASE_URL", "postgresql://localhost/journaling_app_development")
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1/messages"
        print("✓ VectorInsightsService initialized (Claude AI Analysis)")
        # Simple in-memory cache for per-entry insights to reduce recomputation
        # Keyed by (entry_id, updated_at_iso)
        self._insights_cache: Dict[Tuple[int, str], Tuple[float, Dict[str, Any]]] = {}
        # TTL in seconds (default 1 hour); set INSIGHTS_CACHE_TTL_SECONDS to override
        try:
            self._insights_cache_ttl = int(os.getenv("INSIGHTS_CACHE_TTL_SECONDS", "3600"))
        except Exception:
            self._insights_cache_ttl = 3600

    def _connect(self):
        """
        Creates and returns a new database connection.
        Registers the pgvector adapter safely.
        """
        conn = psycopg2.connect(self.database_url)
        try:
            register_vector(conn)
        except Exception as e:
            # This might happen if the extension isn't installed, but we can proceed
            # since fast analysis doesn't rely on vector operations in the DB.
            print(f"Warning: Could not register pgvector adapter. {e}")
        return conn

    async def analyze_journal_entry_fast(self, content: str, entry_id: int, user_id: str) -> Dict[str, Any]:
        """
        Performs a comprehensive analysis of a journal entry using Claude AI.
        This is the primary entry point for single-entry analysis.

        Args:
            content: The text content of the journal entry.
            entry_id: The unique ID of the current entry to exclude from similarity search.
            user_id: The ID of the user who owns the entry.

        Returns:
            A dictionary containing a full analysis of the entry.
        """
        if not content or not content.strip():
            return self._create_fallback_analysis("Empty entry.")

        try:
            # 1. Find lexically similar entries from the user's history
            similar_entries = await self._find_similar_entries_textual(content, user_id, entry_id)

            # 2. Use Claude to analyze the entry
            analysis = await self._analyze_entry_with_claude(content, similar_entries)
            return analysis

        except Exception as e:
            print(f"Error in Claude analysis for entry_id {entry_id}: {e}")
            return self._create_fallback_analysis(content)

    async def _find_similar_entries_textual(self, content: str, user_id: str, exclude_id: int, limit: int = 5, candidate_pool: int = 100) -> List[Dict]:
        """
        Finds similar entries using TF-IDF cosine similarity on recent entries.
        This provides better lexical matching than simple bag-of-words.
        """
        try:
            with self._connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT id, content, created_at
                    FROM journal_entries WHERE clerk_user_id = %s AND id != %s
                    ORDER BY created_at DESC LIMIT %s
                    """,
                    (user_id, exclude_id, candidate_pool),
                )
                docs = cursor.fetchall() or []

            if not docs:
                return []

            # --- Simple TF-IDF Implementation ---
            def tokenize(text: str) -> List[str]:
                return re.findall(r'\b\w+\b', text.lower())

            query_tokens = tokenize(content)
            doc_tokens_list = [tokenize(doc.get("content", "")) for doc in docs]
            
            all_tokens = set(query_tokens)
            for tokens in doc_tokens_list:
                all_tokens.update(tokens)
            
            vocab = {word: i for i, word in enumerate(all_tokens)}
            vocab_size = len(vocab)
            
            # IDF calculation
            doc_freq = np.zeros(vocab_size)
            for tokens in doc_tokens_list:
                for word in set(tokens):
                    if word in vocab:
                        doc_freq[vocab[word]] += 1
            
            total_docs = len(docs)
            idf = np.log(total_docs / (doc_freq + 1))

            def to_tfidf_vector(tokens: List[str]) -> np.ndarray:
                tf = np.zeros(vocab_size)
                for word in tokens:
                    if word in vocab:
                        tf[vocab[word]] += 1
                tf = tf / len(tokens) if tokens else tf
                
                tfidf = tf * idf
                norm = np.linalg.norm(tfidf)
                return tfidf / norm if norm > 0 else tfidf

            query_vec = to_tfidf_vector(query_tokens)
            doc_vectors = [to_tfidf_vector(tokens) for tokens in doc_tokens_list]
            
            # Calculate cosine similarity
            scores = [float(np.dot(query_vec, doc_vec)) for doc_vec in doc_vectors]
            
            scored_docs = [{
                "content": doc.get("content", ""),
                "date": doc.get("created_at"),
                "similarity": score
            } for doc, score in zip(docs, scores)]

            scored_docs.sort(key=lambda x: x["similarity"], reverse=True)
            return [d for d in scored_docs if d['similarity'] > 0.1][:limit]

        except Exception as e:
            print(f"Error finding similar entries (textual TF-IDF): {e}")
            return []

    async def _analyze_entry_with_claude(self, content: str, similar_entries: List[Dict]) -> Dict[str, Any]:
        """
        Uses Claude AI to analyze a journal entry and extract insights.
        """
        # Prepare context from similar entries
        context = ""
        if similar_entries:
            context = "\n\nSimilar past entries for context:\n"
            for i, entry in enumerate(similar_entries[:3], 1):
                context += f"Entry {i}: {entry.get('content', '')[:200]}...\n"
        
        prompt = f"""Analyze this journal entry and provide insights in JSON format. Consider the user's writing patterns and any context from similar entries.

Journal Entry:
{content}
{context}

Please respond with a JSON object containing:
{{
  "summary": "A brief 1-2 sentence summary of the entry",
  "emotions": [
    {{
      "emotion": "primary emotion name",
      "intensity": 0.8,
      "description": "Why this emotion was detected"
    }}
  ],
  "themes": [
    {{
      "theme": "main theme name",
      "relevance": 0.9,
      "description": "Why this theme is relevant"
    }}
  ],
  "sentiment_score": 0.7,
  "sentiment_trend": "positive/negative/neutral",
  "key_insights": ["meaningful insight 1", "meaningful insight 2"],
  "growth_areas": ["potential area for growth"],
  "support_suggestions": ["helpful suggestion based on the content"]
}}

Focus on being empathetic, non-judgmental, and helpful. Identify 1-3 emotions max, 2-3 themes max. Sentiment score should be 0.0 (very negative) to 1.0 (very positive)."""

        try:
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                "model": "claude-3-5-sonnet-20240620",
                "max_tokens": 1500,
                "temperature": 0.3,
                "system": "You are an expert at analyzing journal entries with empathy and psychological insight. Always respond with valid JSON only.",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.base_url,
                    headers=headers,
                    json=data,
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    claude_response = result["content"][0]["text"]
                    
                    # Parse the JSON response
                    try:
                        analysis = json.loads(claude_response)
                        # Validate required fields and provide defaults
                        return {
                            "summary": analysis.get("summary", "Journal entry analyzed."),
                            "emotions": analysis.get("emotions", [{"emotion": "reflective", "intensity": 0.7, "description": "General reflection detected."}]),
                            "themes": analysis.get("themes", [{"theme": "Personal Reflection", "relevance": 0.8, "description": "General life reflection."}]),
                            "sentiment_score": float(analysis.get("sentiment_score", 0.5)),
                            "sentiment_trend": analysis.get("sentiment_trend", "neutral"),
                            "key_insights": analysis.get("key_insights", ["You engaged in meaningful self-reflection."]),
                            "growth_areas": analysis.get("growth_areas", ["Continue journaling for self-awareness."]),
                            "support_suggestions": analysis.get("support_suggestions", ["Keep exploring your thoughts and feelings."])
                        }
                    except json.JSONDecodeError:
                        print(f"Failed to parse Claude JSON response: {claude_response}")
                        return self._create_fallback_analysis(content)
                        
                else:
                    print(f"Claude API Error: {response.status_code} - {response.text}")
                    return self._create_fallback_analysis(content)
                    
        except Exception as e:
            print(f"Error calling Claude API: {e}")
            return self._create_fallback_analysis(content)








    # --- Cached single-entry analysis ---
    async def analyze_journal_entry_fast_cached(self, content: str, entry_id: int, user_id: str, updated_at: Any) -> Dict[str, Any]:
        """Wrapper that caches analyze_journal_entry_fast by (entry_id, updated_at_iso)."""
        try:
            # Normalize updated_at to iso string for the cache key
            if hasattr(updated_at, 'isoformat'):
                updated_iso = updated_at.isoformat()
            else:
                updated_iso = str(updated_at)
            key: Tuple[int, str] = (int(entry_id), updated_iso)
        except Exception:
            # Fallback key without updated_at; reduces cache usefulness but stays safe
            key = (int(entry_id), "")

        # Check cache
        now_ts = datetime.now().timestamp()
        cached = self._insights_cache.get(key)
        if cached:
            ts, data = cached
            if now_ts - ts <= self._insights_cache_ttl:
                return data

        # Compute and store
        data = await self.analyze_journal_entry_fast(content, entry_id, user_id)
        self._insights_cache[key] = (now_ts, data)
        return data

    async def analyze_trends_fast(self, entries: List[Dict]) -> Dict[str, Any]:
        """Analyzes trends over a series of entries using Claude AI."""
        if not entries or len(entries) < 3:
            return self._create_empty_trends()
        
        try:
            return await self._analyze_trends_with_claude(entries)
        except Exception as e:
            print(f"Error in trends analysis: {e}")
            return self._create_empty_trends()
    
    async def _analyze_trends_with_claude(self, entries: List[Dict]) -> Dict[str, Any]:
        """Uses Claude AI to analyze trends across multiple journal entries."""
        
        # Prepare entry data for Claude
        entry_summaries = []
        for i, entry in enumerate(entries[-10:], 1):  # Limit to last 10 entries for context
            content = entry.get('content', '')[:300]  # Limit content length
            timestamp = entry.get('timestamp', entry.get('date', 'Unknown date'))
            entry_summaries.append(f"Entry {i} ({timestamp}): {content}...")
        
        entries_text = "\n\n".join(entry_summaries)
        
        prompt = f"""Analyze these journal entries to identify trends, patterns, and insights. Look for emotional trends, recurring themes, growth patterns, and areas of concern.

Journal Entries:
{entries_text}

Please respond with a JSON object containing:
{{
  "overall_sentiment_trend": "improving/declining/stable",
  "dominant_themes": [
    {{
      "theme": "theme name",
      "frequency": 0.8,
      "description": "Why this theme is significant"
    }}
  ],
  "emotional_patterns": [
    {{
      "emotion": "emotion name",
      "frequency": 0.6,
      "trend": "increasing/decreasing/stable"
    }}
  ],
  "growth_indicators": ["positive pattern or growth area"],
  "areas_of_concern": ["area that might need attention"],
  "recommendations": ["actionable suggestion based on patterns"],
  "insights_summary": "A comprehensive 2-3 sentence summary of the key insights"
}}

Focus on being supportive and constructive. Identify meaningful patterns without being overly clinical. Keep themes and emotions to 3-4 max each."""

        try:
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                "model": "claude-3-5-sonnet-20240620",
                "max_tokens": 2000,
                "temperature": 0.3,
                "system": "You are an expert at analyzing journal patterns and trends with psychological insight. Always respond with valid JSON only. Be empathetic and constructive.",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.base_url,
                    headers=headers,
                    json=data,
                    timeout=45.0  # Longer timeout for trend analysis
                )
                
                if response.status_code == 200:
                    result = response.json()
                    claude_response = result["content"][0]["text"]
                    
                    try:
                        trends = json.loads(claude_response)
                        # Validate and provide defaults
                        return {
                            "overall_sentiment_trend": trends.get("overall_sentiment_trend", "stable"),
                            "dominant_themes": trends.get("dominant_themes", []),
                            "emotional_patterns": trends.get("emotional_patterns", []),
                            "growth_indicators": trends.get("growth_indicators", ["Consistent journaling shows self-awareness."]),
                            "areas_of_concern": trends.get("areas_of_concern", []),
                            "recommendations": trends.get("recommendations", ["Continue exploring your thoughts and feelings."]),
                            "insights_summary": trends.get("insights_summary", "Your journaling practice shows thoughtful self-reflection.")
                        }
                    except json.JSONDecodeError:
                        print(f"Failed to parse Claude trends JSON: {claude_response}")
                        return self._create_empty_trends()
                        
                else:
                    print(f"Claude API Error for trends: {response.status_code} - {response.text}")
                    return self._create_empty_trends()
                    
        except Exception as e:
            print(f"Error calling Claude API for trends: {e}")
            return self._create_empty_trends()

    def _create_fallback_analysis(self, content: str) -> Dict[str, Any]:
        """Creates a safe, generic analysis object in case of errors."""
        def quick_summary(text: str) -> str:
            t = (text or "").strip().replace("\n", " ")
            return (t[:140] + "…") if len(t) > 140 else (t or "Journal entry analyzed.")
        return {
            "summary": quick_summary(content),
            "emotions": [{"emotion": "reflective", "intensity": 0.7, "description": "Engaging in self-reflection."}],
            "themes": [{"theme": "Personal Reflection", "relevance": 0.8, "description": "General life reflection."}],
            "sentiment_score": 0.5,
            "sentiment_trend": "neutral",
            "key_insights": ["You took time for valuable self-reflection."],
            "growth_areas": ["Maintaining a consistent reflective practice."],
            "support_suggestions": ["Continue exploring your thoughts and feelings in this space."],
        }

    def _create_empty_trends(self) -> Dict[str, Any]:
        """Creates a generic response for when trend analysis isn't possible."""
        return {
            "overall_sentiment_trend": "not_enough_data",
            "dominant_themes": [],
            "emotional_patterns": [],
            "growth_indicators": [],
            "areas_of_concern": [],
            "recommendations": ["Continue journaling regularly to unlock trends and deeper insights over time."],
            "insights_summary": "Not enough data for a trend analysis. Keep journaling to see your patterns emerge!",
        }
