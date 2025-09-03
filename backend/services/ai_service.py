import os
from typing import List
import httpx
import json

class AIService:
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1/messages"
        
        self.system_prompt = """You are an empathetic AI called Keo, a journaling companion. Your role is to:

1. Listen actively and provide thoughtful, non-judgmental responses
2. Ask insightful follow-up questions to encourage deeper reflection
3. Help users identify patterns in their thoughts and emotions
4. Provide gentle guidance and perspective when appropriate
5. Remember context from previous conversations to maintain continuity

Guidelines:
- Be warm, supportive, and genuinely interested
- Ask open-ended questions to promote self-reflection
- Validate emotions while encouraging growth
- Keep responses concise but meaningful
- Use the conversation history to provide personalized insights
- Never provide medical or therapeutic advice - suggest professional help when needed

Remember: You're a supportive companion, not a therapist. Focus on active listening and encouraging healthy self-reflection."""

    async def generate_response(self, user_message: str, relevant_memories: List[str]) -> str:
        try:
            # Build context from memories
            context = ""
            if relevant_memories:
                context = "\n\nRelevant conversation history:\n" + "\n".join(relevant_memories[:3])
            
            # Create the prompt
            user_prompt = f"""User message: {user_message}{context}

Please respond as an empathetic journaling companion. Consider the conversation history if provided."""

            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "temperature": 0.7,
                "system": self.system_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": user_prompt
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
                    return result["content"][0]["text"]
                else:
                    print(f"API Error: {response.status_code} - {response.text}")
                    return "I'm having trouble connecting right now. Could you try again?"
            
        except Exception as e:
            print(f"Error generating AI response: {e}")
            return "I'm having trouble processing that right now. Could you try rephrasing your thoughts?"

    async def generate_opening_prompt(self, recent_journal_entries: List[str]) -> str:
        """Generate a contextual opening prompt based on recent journal entries."""
        try:
            if not recent_journal_entries:
                # Default opening prompts for new users
                default_prompts = [
                    "What's been on your mind lately?",
                    "How are you feeling today?",
                    "What's one thing that stood out to you today?",
                    "I'm here to listen. What would you like to share?",
                    "What's bringing you here for reflection today?"
                ]
                import random
                return random.choice(default_prompts)
            
            # Build context from recent entries
            context = "Recent journal entries:\n" + "\n---\n".join(recent_journal_entries[:3])
            
            opening_prompt = f"""{context}

Based on the user's recent journal entries above, craft a warm, empathetic opening message that:
1. Acknowledges themes or emotions from recent entries
2. Shows you remember what they've shared
3. Asks a thoughtful follow-up question to continue the conversation
4. Keeps it concise (1-2 sentences max)

Examples of good opening messages:
- "I remember you mentioned feeling overwhelmed at work yesterday. How are things looking today?"
- "It sounds like you've been processing a lot lately. What's on your heart right now?"
- "I can sense you've been working through some challenges. How are you doing with all of that today?"

Respond only with the opening message, nothing else."""

            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 200,
                "temperature": 0.8,
                "system": "You are Keo, an empathetic AI journaling companion. Generate warm, personal opening messages based on journal history.",
                "messages": [
                    {
                        "role": "user",
                        "content": opening_prompt
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
                    return result["content"][0]["text"].strip()
                else:
                    print(f"API Error: {response.status_code} - {response.text}")
                    return "How are you feeling today?"
                    
        except Exception as e:
            print(f"Error generating opening prompt: {e}")
            return "What's on your mind today?"