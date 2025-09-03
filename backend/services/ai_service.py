import os
from typing import List
import httpx
import json

class AIService:
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1/messages"
        
        self.system_prompt = """You are an empathetic AI journaling companion. Your role is to:

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