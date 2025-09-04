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

class VectorInsightsService:
    """
    A service for analyzing journal entries to extract insights, themes, and trends.
    This service is designed to be "Claude-first," meaning it avoids dependencies on
    OpenAI and relies on fast, lexical, and pattern-based analysis methods.
    """

    # --- Constants for Analysis ---

    POSITIVE_WORDS: Set[str] = {
        'accomplished', 'admire', 'adorable', 'adored', 'advanced', 'advantage',
        'amazing', 'amused', 'appealing', 'approve', 'astonishing', 'attractive',
        'awesome', 'beaming', 'beautiful', 'believe', 'beloved', 'beneficial',
        'best', 'blessed', 'blissful', 'breathtaking', 'bright', 'brilliant',
        'calm', 'celebrate', 'charming', 'cheerful', 'cherish', 'classic',
        'clean', 'comfortable', 'confident', 'content', 'cool', 'courageous',
        'creative', 'cute', 'dazzling', 'delighted', 'delightful', 'distinguished',
        'divine', 'eager', 'easy', 'ecstatic', 'effective', 'efficient', 'effortless',
        'elated', 'elegant', 'enchanted', 'energetic', 'engaging', 'enjoy',
        'enthusiastic', 'excellent', 'excited', 'exciting', 'exquisite',
        'extraordinary', 'exuberant', 'fabulous', 'fair', 'familiar', 'famous',
        'fantastic', 'fascinating', 'favorite', 'fearless', 'fine', 'flourishing',
        'fortunate', 'free', 'fresh', 'friendly', 'fun', 'funny', 'generous',
        'genius', 'genuine', 'giving', 'glamorous', 'glorious', 'good', 'gorgeous',
        'graceful', 'grand', 'grateful', 'great', 'handsome', 'happy', 'harmonious',
        'healing', 'healthy', 'heartwarming', 'heavenly', 'helpful', 'holy',
        'honest', 'honorable', 'honored', 'hopeful', 'hospitable', 'humbled',
        'humorous', 'ideal', 'imaginative', 'impressive', 'incredible', 'influential',
        'innovative', 'insightful', 'inspired', 'inspiring', 'intelligent', 'intuitive',
        'inventive', 'jolly', 'joy', 'joyful', 'joyous', 'jubilant', 'just', 'keen',
        'kind', 'laugh', 'legendary', 'light', 'lively', 'love', 'lovely', 'loving',
        'loyal', 'lucky', 'luxurious', 'magical', 'magnificent', 'majestic',
        'marvelous', 'masterful', 'meaningful', 'merit', 'miraculous', 'motivating',
        'moving', 'natural', 'nice', 'noble', 'nurturing', 'optimistic', 'outstanding',
        'passionate', 'patient', 'peaceful', 'perfect', 'phenomenal', 'picturesque',
        'playful', 'pleasant', 'pleased', 'pleasurable', 'plentiful', 'poised',
        'polished', 'popular', 'positive', 'powerful', 'precious', 'prestigious',
        'pretty', 'priceless', 'principled', 'privileged', 'prize', 'proactive',
        'productive', 'prominent', 'proud', 'pure', 'radiant', 'reassuring',
        'refined', 'refreshing', 'rejoice', 'reliable', 'remarkable', 'renewed',
        'respected', 'resplendent', 'revered', 'revitalized', 'revolutionary',
        'rewarding', 'rich', 'robust', 'romantic', 'safe', 'satisfied', 'scenic',
        'secure', 'serene', 'sharp', 'shining', 'sincere', 'skillful', 'smart',
        'smile', 'soulful', 'sparkling', 'special', 'spectacular', 'spirited',
        'spiritual', 'splendid', 'spotless', 'stable', 'steady', 'striking',
        'strong', 'stunning', 'stupendous', 'stylish', 'sublime', 'successful',
        'sunny', 'superb', 'superior', 'supportive', 'surprising', 'sweet',
        'talented', 'terrific', 'thankful', 'thorough', 'thrilled', 'thriving',
        'timely', 'top', 'tranquil', 'triumphant', 'true', 'trustworthy',
        'truthful', 'unbiased', 'uncommon', 'unforgettable', 'unique', 'unwavering',
        'upbeat', 'valiant', 'valuable', 'vibrant', 'victorious', 'virtuous',
        'visionary', 'vivacious', 'warm', 'wealthy', 'welcome', 'well', 'whole',
        'wholesome', 'willing', 'wise', 'wonderful', 'wondrous', 'worthy', 'wow',
        'youthful', 'zestful'
    }

    NEGATIVE_WORDS: Set[str] = {
        'abysmal', 'adverse', 'afraid', 'aggressive', 'agitated', 'agonizing',
        'alarmed', 'angry', 'annoyed', 'anxious', 'apathetic', 'appalled',
        'arrogant', 'ashamed', 'atrocious', 'awful', 'bad', 'banal', 'barbed',
        'belligerent', 'bewildered', 'bitter', 'bizarre', 'bleak', 'bloody',
        'bored', 'boring', 'broken', 'brutal', 'burdensome', 'callous', 'careless',
        'chaotic', 'cheap', 'cheated', 'clumsy', 'coarse', 'cold', 'cold-hearted',
        'collapse', 'complicated', 'conceited', 'condemned', 'confused',
        'contagious', 'contaminated', 'contemptuous', 'corrupt', 'costly',
        'cowardly', 'crazy', 'creepy', 'criminal', 'critical', 'cruel', 'crushing',
        'cry', 'cynical', 'damaged', 'damaging', 'dangerous', 'dark', 'daunting',
        'dazed', 'dead', 'deadly', 'deceitful', 'deceived', 'defective',
        'defenseless', 'deficient', 'dejected', 'delinquent', 'delirious',
        'demonic', 'deplorable', 'depraved', 'depressed', 'deprived', 'desperate',
        'despicable', 'destructive', 'devastated', 'devilish', 'difficult',
        'dirt', 'dirty', 'disadvantaged', 'disappointed', 'disappointing',
        'disaster', 'disastrous', 'discontented', 'discouraged', 'discredited',
        'disdained', 'disgraceful', 'disgusted', 'disgusting', 'disheartened',
        'dishonest', 'disillusioned', 'dismal', 'dismayed', 'disorderly',
        'displeased', 'disrespectful', 'disruptive', 'dissatisfied', 'distressed',
        'disturbed', 'dreadful', 'dreary', 'dull', 'dumb', 'dumped', 'duped',
        'enraged', 'envious', 'erroneous', 'error', 'evil', 'exasperated',
        'exhausted', 'expensive', 'exploited', 'fail', 'faithless', 'fake',
        'false', 'fanatical', 'fatal', 'fatigued', 'faulty', 'fear', 'fearful',
        'feeble', 'fight', 'filthy', 'finicky', 'foolish', 'forgotten', 'fragile',
        'frantic', 'fraudulent', 'frazzled', 'frightened', 'frightening',
        'frustrated', 'furious', 'futile', 'ghastly', 'grave', 'greed', 'greedy',
        'grief', 'grieving', 'grim', 'gross', 'grotesque', 'gruesome', 'grumpy',
        'guilty', 'hard', 'hard-hearted', 'harmful', 'hate', 'hateful', 'haunted',
        'heartbroken', 'heavyhearted', 'helpless', 'hesitant', 'hideous',
        'horrible', 'horrified', 'hostile', 'hurt', 'hurtful', 'hysterical',
        'idiotic', 'ignorant', 'ill', 'immature', 'imperfect', 'impossible',
        'impotent', 'imprudent', 'impure', 'inability', 'inadequate', 'incapable',
        'incompetent', 'inconsiderate', 'inconvenient', 'ineffective', 'inefficient',
        'inferior', 'inflamed', 'infuriated', 'inhibited', 'insecure', 'insidious',
        'insignificant', 'insincere', 'insipid', 'insolent', 'insulting',
        'intense', 'intimidated', 'irrational', 'irresponsible', 'irritated',
        'isolating', 'jealous', 'jittery', 'jobless', 'junky', 'lame', 'lazy',
        'lethargic', 'liar', 'livid', 'lonely', 'lost', 'lousy', 'low', 'ludicrous',
        'lying', 'mad', 'malevolent', 'malicious', 'manipulated', 'meaningless',
        'melancholy', 'menacing', 'messy', 'miserable', 'misleading', 'miss',
        'mistake', 'misunderstood', 'moan', 'mocked', 'monstrous', 'moody',
        'morbid', 'moronic', 'mournful', 'muddy', 'murderous', 'murky', 'nasty',
        'naughty', 'nauseous', 'needy', 'negative', 'neglected', 'nervous',
        'neurotic', 'noisy', 'nonexistent', 'nonsense', 'obnoxious', 'obscene',
        'odd', 'offensive', 'ominous', 'oppressive', 'outraged', 'overwhelmed',
        'pain', 'pained', 'panicked', 'panicky', 'pathetic', 'pessimistic',
        'petty', 'phony', 'pitiful', 'plagued', 'pointless', 'poisoned', 'poor',
        'powerless', 'prejudiced', 'pressured', 'pretentious', 'problem',
        'problematic', 'provoked', 'punished', 'pushy', 'puzzled', 'questionable',
        'quirky', 'quit', 'rage', 'raging', 'rainy', 'rattled', 'rebellious',
        'regret', 'regretful', 'rejected', 'remorseful', 'repellent', 'reprehensible',
        'repulsive', 'resentful', 'restless', 'restricted', 'revengeful',
        'revolting', 'rigid', 'risk', 'risky', 'rotten', 'rude', 'ruined', 'ruthless',
        'sad', 'sarcastic', 'savage', 'scared', 'scarred', 'scream', 'screwed up',
        'selfish', 'severe', 'shaky', 'shame', 'shameful', 'shocked', 'shoddy',
        'sick', 'sickening', 'sinful', 'skeptical', 'sloppy', 'slow', 'sluggish',
        'smelly', 'smoggy', 'snobby', 'sore', 'sorrowful', 'sour', 'spiteful',
        'stiff', 'stolen', 'stormy', 'strange', 'stressed', 'stressful',
        'strict', 'strife', 'stubborn', 'stuck', 'stunned', 'stupid', 'substandard',
        'suffer', 'suspicious', 'tense', 'terrible', 'terrified', 'threatening',
        'timid', 'tired', 'tiresome', 'tormented', 'torn', 'torture', 'toxic',
        'tragic', 'trapped', 'traumatic', 'treacherous', 'trembling', 'tricky',
        'trouble', 'troubled', 'ugly', 'unacceptable', 'unappreciated',
        'unattractive', 'unaware', 'unbearable', 'unbelievable', 'uncertain',
        'unclear', 'uncomfortable', 'uncontrolled', 'uncreative', 'undecided',
        'underestimated', 'undesirable', 'uneasy', 'unemployed', 'unethical',
        'unexpected', 'unfair', 'unfocused', 'unforgivable', 'unforgiving',
        'unfortunate', 'unfriendly', 'unfulfilled', 'ungrateful', 'unhappy',
        'unhealthy', 'unhelpful', 'unimportant', 'uninspired', 'unintelligent',
        'unjust', 'unlovable', 'unloved', 'unmotivated', 'unpleasant',
        'unprofessional', 'unprotected', 'unprepared', 'unproductive',
        'unqualified', 'unreliable', 'unresolved', 'unsafe', 'unsatisfied',
        'unstable', 'unsuccessful', 'unsupported', 'unsure', 'untoward',
        'unwanted', 'unwelcome', 'unwell', 'unwilling', 'unwise', 'upset',
        'useless', 'vague', 'vain', 'vengeful', 'vicious', 'vile', 'vindictive',
        'violated', 'violent', 'volatile', 'vulnerable', 'wary', 'weak', 'weary',
        'wicked', 'woeful', 'worthless', 'worried', 'worry', 'worse', 'worst',
        'wounded', 'wrong', 'yell'
    }

    EMOTION_KEYWORDS: Dict[str, List[str]] = {
        'happy': ['happy', 'joy', 'joyful', 'cheerful', 'delighted', 'pleased', 'elated', 'gleeful', 'jolly', 'merry', 'jubilant', 'content', 'blissful', 'ecstatic', 'beaming', 'radiant'],
        'excited': ['excited', 'thrilled', 'enthusiastic', 'eager', 'pumped', 'exuberant', 'animated', 'electrified', 'invigorated', 'giddy', 'fired up'],
        'grateful': ['grateful', 'thankful', 'appreciative', 'blessed', 'indebted', 'obliged', 'humbled'],
        'peaceful': ['peaceful', 'calm', 'serene', 'tranquil', 'relaxed', 'at ease', 'composed', 'placid', 'untroubled', 'content'],
        'proud': ['proud', 'accomplished', 'achieved', 'successful', 'triumphant', 'satisfied', 'honored', 'dignified'],
        'love': ['love', 'loving', 'adored', 'cherished', 'affectionate', 'devoted', 'infatuated', 'enamored', 'smitten'],
        'optimistic': ['optimistic', 'hopeful', 'positive', 'confident', 'encouraged', 'buoyant'],
        'sad': ['sad', 'down', 'blue', 'melancholy', 'sorrowful', 'dejected', 'unhappy', 'miserable', 'heartbroken', 'grieving', 'somber', 'glum', 'crestfallen'],
        'angry': ['angry', 'mad', 'furious', 'irritated', 'annoyed', 'frustrated', 'enraged', 'livid', 'irate', 'indignant', 'exasperated', 'outraged'],
        'anxious': ['anxious', 'worried', 'nervous', 'stressed', 'tense', 'uneasy', 'apprehensive', 'fretful', 'agitated', 'on edge', 'troubled'],
        'lonely': ['lonely', 'isolated', 'alone', 'disconnected', 'abandoned', 'lonesome', 'forsaken', 'alienated', 'ostracized'],
        'fearful': ['fearful', 'afraid', 'scared', 'terrified', 'horrified', 'petrified', 'panicked', 'frightened', 'intimidated'],
        'hurt': ['hurt', 'pained', 'wounded', 'aching', 'offended', 'distressed', 'devastated', 'crushed'],
        'guilty': ['guilty', 'ashamed', 'regretful', 'remorseful', 'culpable', 'sorry'],
        'exhausted': ['exhausted', 'tired', 'fatigued', 'drained', 'worn out', 'burnt out', 'lethargic', 'weary'],
        'confused': ['confused', 'puzzled', 'uncertain', 'unclear', 'mixed', 'bewildered', 'baffled', 'perplexed', 'disoriented'],
        'surprised': ['surprised', 'astonished', 'amazed', 'shocked', 'startled', 'stunned', 'taken aback'],
        'overwhelmed': ['overwhelmed', 'overloaded', 'swamped', 'inundated', 'burdened', 'snowed under']
    }

    THEME_KEYWORDS: Dict[str, List[str]] = {
        'work': ['work', 'job', 'career', 'office', 'boss', 'colleague', 'project', 'deadline', 'meeting', 'promotion', 'corporate', 'startup', 'coworker'],
        'relationships': ['relationship', 'friend', 'family', 'partner', 'love', 'date', 'marriage', 'social', 'mom', 'dad', 'spouse', 'child', 'sibling', 'argument', 'connection'],
        'health': ['health', 'exercise', 'diet', 'sleep', 'medical', 'doctor', 'wellness', 'fitness', 'sick', 'gym', 'workout', 'mental health', 'therapy'],
        'personal_growth': ['growth', 'learn', 'develop', 'improve', 'goal', 'progress', 'achievement', 'habit', 'skill', 'self-improvement', 'challenge'],
        'creativity': ['creative', 'art', 'music', 'write', 'create', 'design', 'inspiration', 'hobby', 'paint', 'draw', 'perform'],
        'travel': ['travel', 'trip', 'vacation', 'journey', 'explore', 'adventure', 'holiday', 'destination', 'tourist'],
        'finances': ['money', 'financial', 'budget', 'savings', 'investment', 'expense', 'income', 'debt', 'salary', 'bill'],
        'spirituality': ['spiritual', 'meditation', 'prayer', 'faith', 'mindfulness', 'purpose', 'universe', 'soul', 'belief'],
        'education': ['study', 'school', 'university', 'course', 'exam', 'homework', 'research', 'learn', 'degree', 'student']
    }

    NEGATIONS: Set[str] = {"not", "no", "never", "isnt", "arent", "wasnt", "werent", "dont", "doesnt", "didnt", "cant", "couldnt", "wont", "wouldnt"}
    INTENSIFIERS: Dict[str, float] = {"very": 1.5, "extremely": 2.0, "incredibly": 2.0, "so": 1.5, "really": 1.5, "quite": 1.2, "somewhat": 0.8, "slightly": 0.7, "abit": 0.7}

    # Common English stopwords for keyword extraction (kept small and local)
    STOPWORDS: Set[str] = {
        'the','a','an','and','or','but','if','then','than','that','this','those','these','to','of','in','on','for','from','by','with','as','at','it','its','be','is','are','was','were','am','i','you','he','she','they','we','me','him','her','them','my','your','our','their','mine','yours','ours','theirs','not','no','so','too','very','just','about','into','over','under','again','once','than','also','been','being','do','does','did','doing','have','has','had','having','can','could','should','would','may','might','must','will','shall','up','down','out','off','more','most','some','such','other','only','own','same','both','each','few','how','why','when','where','what','who','whom','which'
    }


    def __init__(self):
        """Initializes the VectorInsightsService."""
        self.database_url = os.getenv("DATABASE_URL", "postgresql://localhost/journaling_app_development")
        print("✓ VectorInsightsService initialized (Fast, Lexical Analysis)")
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
        Performs a fast, comprehensive analysis of a journal entry using lexical methods.
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

            # 2. Analyze sentiment with more nuance (negations, intensifiers)
            sentiment_score = self._analyze_sentiment_fast(content)
            sentiment_label = "positive" if sentiment_score > 0.6 else "negative" if sentiment_score < 0.4 else "neutral"

            # 3. Extract emotions and themes
            emotions = self._extract_emotions_fast(content)
            themes = self._extract_themes_from_similar(similar_entries, content)
            
            # 4. Detect connections between emotions and themes
            cooccurrences = self._detect_cooccurrences(content, emotions, themes)

            # 5. Generate qualitative insights
            insights = self._generate_insights_from_patterns(content, similar_entries, themes, emotions, cooccurrences)
            growth_areas = self._identify_growth_areas(content, similar_entries, sentiment_score)
            suggestions = self._generate_suggestions(sentiment_score, themes, emotions)

            return {
                "summary": self._generate_summary(content, emotions, themes),
                "emotions": emotions,
                "themes": themes,
                "sentiment_score": sentiment_score,
                "sentiment_trend": sentiment_label,
                "key_insights": insights,
                "growth_areas": growth_areas,
                "support_suggestions": suggestions,
            }
        except Exception as e:
            print(f"Error in fast analysis for entry_id {entry_id}: {e}")
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
                    SELECT id, user_message, ai_response, timestamp
                    FROM conversations WHERE clerk_user_id = %s AND id != %s
                    ORDER BY timestamp DESC LIMIT %s
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
            doc_tokens_list = [tokenize(doc.get("user_message", "")) for doc in docs]
            
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
                "content": doc.get("user_message", ""),
                "response": doc.get("ai_response", ""),
                "date": doc.get("timestamp"),
                "similarity": score
            } for doc, score in zip(docs, scores)]

            scored_docs.sort(key=lambda x: x["similarity"], reverse=True)
            return [d for d in scored_docs if d['similarity'] > 0.1][:limit]

        except Exception as e:
            print(f"Error finding similar entries (textual TF-IDF): {e}")
            return []

    def _analyze_sentiment_fast(self, content: str) -> float:
        """
        Analyzes sentiment using keyword patterns, including negation and intensifiers.
        Returns a score from 0.0 (very negative) to 1.0 (very positive).
        """
        words = re.findall(r'\b\w+\b', content.lower())
        score = 0.0
        
        for i, word in enumerate(words):
            current_score = 0
            if word in self.POSITIVE_WORDS:
                current_score = 1
            elif word in self.NEGATIVE_WORDS:
                current_score = -1
            
            if current_score != 0:
                # Check for negation
                if i > 0 and words[i-1] in self.NEGATIONS:
                    current_score *= -1
                
                # Check for intensifiers
                if i > 0 and words[i-1] in self.INTENSIFIERS:
                    current_score *= self.INTENSIFIERS[words[i-1]]
                
                score += current_score

        # Normalize score to a 0-1 range
        if not words: return 0.5
        normalized_score = score / len(words) * 5  # Heuristic scaling factor
        return max(0.0, min(1.0, (normalized_score + 1) / 2))

    def _extract_emotions_fast(self, content: str) -> List[Dict]:
        """Extracts up to 3 dominant emotions using keyword matching and intensity."""
        content_lower = content.lower()
        detected_emotions = []
        
        for emotion, keywords in self.EMOTION_KEYWORDS.items():
            matches = sum(1 for keyword in keywords if keyword in content_lower)
            if matches > 0:
                # Intensity based on frequency, capped for realism
                intensity = min(1.0, math.sqrt(matches) / 2.0)
                detected_emotions.append({
                    "emotion": emotion,
                    "intensity": round(intensity, 2),
                    "description": f"Detected based on language patterns like '{keywords[0]}'."
                })
        
        detected_emotions.sort(key=lambda x: x["intensity"], reverse=True)
        return detected_emotions[:3] if detected_emotions else [
            {"emotion": "reflective", "intensity": 0.7, "description": "No strong emotion keywords detected."}
        ]

    def _extract_themes_from_similar(self, similar_entries: List[Dict], current_content: str) -> List[Dict]:
        """Extracts up to 5 dominant themes from current and similar entries."""
        all_content = current_content.lower()
        for entry in similar_entries:
            all_content += " " + entry.get("content", "").lower()
        
        theme_counts = Counter()
        for theme, keywords in self.THEME_KEYWORDS.items():
            for keyword in keywords:
                theme_counts[theme] += all_content.count(keyword)
        
        if not theme_counts:
            return [{"theme": "personal_reflection", "relevance": 0.8, "description": "General life reflection."}]
        
        total_matches = sum(theme_counts.values())
        detected_themes = [{
            "theme": theme,
            "relevance": round(count / total_matches, 2),
            "description": f"Appears frequently in your reflections."
        } for theme, count in theme_counts.most_common(5) if count > 0]
        
        return detected_themes

    def _detect_cooccurrences(self, content: str, emotions: List[Dict], themes: List[Dict]) -> List[str]:
        """Detects connections between prominent emotions and themes in the text."""
        cooccurrences = []
        sentences = re.split(r'[.!?]', content.lower())
        top_emotion_names = {e['emotion'] for e in emotions[:2]}
        top_theme_names = {t['theme'] for t in themes[:2]}

        for sentence in sentences:
            # Use safe lookups: fallback emotions like 'reflective' or themes like 'personal_reflection'
            found_emotions = {e for e in top_emotion_names if any(k in sentence for k in self.EMOTION_KEYWORDS.get(e, []))}
            found_themes = {t for t in top_theme_names if any(k in sentence for k in self.THEME_KEYWORDS.get(t, []))}
            
            for emotion in found_emotions:
                for theme in found_themes:
                    cooccurrences.append(f"A connection between {emotion} and {theme} was noted.")
        
        return list(set(cooccurrences))[:2] # Return unique connections

    def _generate_summary(self, content: str, emotions: List[Dict], themes: List[Dict]) -> str:
        """Generates a brief, context-aware summary of the entry."""
        primary_emotion = emotions[0]['emotion'] if emotions else "reflective"
        primary_theme = themes[0]['theme'] if themes else "personal matters"
        
        summary = f"This entry reflects on {primary_theme.replace('_', ' ')} with a tone of {primary_emotion}. "
        
        # Add a key sentence
        sentences = content.split('.')
        key_sentence = sentences[0].strip() if sentences else ""
        if len(key_sentence.split()) > 4:
            summary += f"You started by mentioning: \"{key_sentence}.\""
        
        return summary

    def _generate_insights_from_patterns(self, content: str, similar_entries: List[Dict], themes: List[Dict], emotions: List[Dict], cooccurrences: List[str]) -> List[str]:
        """Generates more nuanced insights based on detected patterns."""
        insights = cooccurrences
        
        if len(similar_entries) > 1 and themes:
            insights.append(f"The theme of '{themes[0]['theme'].replace('_', ' ')}' seems to be a recurring topic for you, similar to past entries.")
        
        if any(t["theme"] == "personal_growth" for t in themes) and any(e["emotion"] == "proud" for e in emotions):
            insights.append("You seem to be feeling proud of your progress in personal growth.")
            
        if len(content.split()) > 150:
            insights.append("Your detailed writing suggests you're dedicating significant time to deep self-reflection.")
        
        return insights if insights else ["You are maintaining a consistent and thoughtful journaling practice."]

    def _identify_growth_areas(self, content: str, similar_entries: List[Dict], sentiment_score: float) -> List[str]:
        """Identifies potential areas for personal growth."""
        growth_areas = []
        growth_words = {'learn', 'improve', 'better', 'progress', 'develop', 'grow', 'achieve', 'overcome', 'challenge'}
        if any(word in content.lower() for word in growth_words):
            growth_areas.append("Your writing explicitly shows a commitment to self-improvement and progress.")
        
        if sentiment_score < 0.35 and any(t.get('theme') in ['work', 'relationships'] for t in self._extract_themes_from_similar([], content)):
            growth_areas.append("Navigating challenges in work or relationships could be a key area for growth.")

        if not growth_areas:
            growth_areas.append("Continuing to engage in regular self-reflection is a powerful growth practice in itself.")
             
        return growth_areas

    def _generate_suggestions(self, sentiment_score: float, themes: List[Dict], emotions: List[Dict]) -> List[str]:
        """Generates actionable and supportive suggestions."""
        suggestions = []
        primary_emotion = emotions[0]['emotion'] if emotions else None
        primary_theme = themes[0]['theme'] if themes else None

        if sentiment_score < 0.4:
            if primary_emotion == 'anxious':
                suggestions.append("When feeling anxious, try a 5-minute breathing exercise to ground yourself.")
            elif primary_emotion == 'sad':
                suggestions.append("Consider doing one small activity you usually enjoy, even if you don't feel like it at first.")
            else:
                suggestions.append("It might be helpful to acknowledge these difficult feelings and practice self-compassion.")
        elif sentiment_score > 0.7:
            suggestions.append("Your positive outlook is wonderful. How can you carry this feeling into the rest of your day?")
        
        if primary_theme == 'work' and primary_emotion in ['stressed', 'anxious', 'overwhelmed']:
             suggestions.append("To manage work stress, could you identify one small boundary to set this week?")
        elif primary_theme == 'relationships' and primary_emotion in ['sad', 'lonely', 'hurt']:
             suggestions.append("Nurturing connections can be healing. Is there one person you could reach out to for a brief chat?")

        return suggestions if suggestions else ["Continue to use this space to explore your thoughts and feelings. It's a valuable practice."]

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
        """Analyzes trends over a series of entries."""
        if not entries or len(entries) < 3:
            return self._create_empty_trends()
        
        # --- Fast keyword extraction for P3 keyword cloud ---
        def fast_extract_keywords(self, entries: List[Dict[str, Any]], top_n: int = 30) -> List[Dict[str, Any]]:
            """Extracts top keywords across entries using simple token counts and stopword removal.

            Args:
                entries: List of entries with a 'content' field.
                top_n: Maximum number of keywords to return.

            Returns:
                List of { 'word': str, 'count': int, 'weight': float } sorted by count desc.
            """
            try:
                counter = Counter()
                total_tokens = 0

                for e in entries:
                    text = (e.get('content') or '')
                    # Tokenize words
                    tokens = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())  # min length 3
                    # Remove stopwords and numeric-like tokens
                    filtered = [t for t in tokens if t not in self.STOPWORDS and not t.isdigit()]
                    total_tokens += len(filtered)
                    counter.update(filtered)

                if not counter:
                    return []

                # Compute weights (tf-like normalized frequency)
                most_common = counter.most_common(top_n)
                max_count = most_common[0][1] if most_common else 1
                keywords = [
                    {"word": w, "count": c, "weight": round(c / max_count, 3)}
                    for w, c in most_common
                ]
                return keywords
            except Exception as e:
                print(f"Error extracting keywords: {e}")
                return []

        try:
            sentiments = [self._analyze_sentiment_fast(e.get("content", "")) for e in entries]
            theme_counter = Counter()
            emotion_counter = Counter()

            for entry in entries:
                content = entry.get("content", "")
                for theme in self._extract_themes_from_similar([], content):
                    theme_counter[theme["theme"]] += 1
                for emotion in self._extract_emotions_fast(content):
                    emotion_counter[emotion["emotion"]] += 1

            # Trend analysis
            recent_avg = np.mean(sentiments[-5:])
            earlier_avg = np.mean(sentiments[:-5]) if len(sentiments) > 5 else np.mean(sentiments)
            trend = "improving" if recent_avg > earlier_avg + 0.05 else "declining" if recent_avg < earlier_avg - 0.05 else "stable"
            
            # Dominant themes & emotions
            dominant_themes = [{"theme": t[0], "frequency": round(t[1]/len(entries), 2)} for t in theme_counter.most_common(3)]
            dominant_emotions = [{"emotion": e[0], "frequency": round(e[1]/len(entries), 2)} for e in emotion_counter.most_common(3)]

            summary = f"Your recent entries show a {trend} emotional trend. The most common themes are {[t['theme'] for t in dominant_themes]}, with emotions like {[e['emotion'] for e in dominant_emotions]} appearing often."

            return {
                "overall_sentiment_trend": trend,
                "dominant_themes": dominant_themes,
                "emotional_patterns": dominant_emotions,
                "growth_indicators": ["Consistent journaling demonstrates a commitment to self-awareness."],
                "areas_of_concern": ["Monitoring the 'declining' sentiment trend is advisable."] if trend == 'declining' else [],
                "recommendations": ["Reflect on what might be contributing to the recent emotional trend."],
                "insights_summary": summary,
            }
        except Exception as e:
            print(f"Error in trends analysis: {e}")
            return self._create_empty_trends()

    def _create_fallback_analysis(self, content: str) -> Dict[str, Any]:
        """Creates a safe, generic analysis object in case of errors."""
        return {
            "summary": self._generate_summary(content, [], []),
            "emotions": [{"emotion": "reflective", "intensity": 0.7, "description": "Engaging in self-reflection."}],
            "themes": [{"theme": "personal_reflection", "relevance": 0.8, "description": "General life reflection."}],
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
