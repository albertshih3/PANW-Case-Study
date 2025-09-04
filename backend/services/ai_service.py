import os
from typing import List, Optional, AsyncGenerator
import httpx
import json
import re
import random

class AIService:
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1/messages"
        
        # Updated and more robust system prompt
        self.system_prompt = """You are an empathetic AI called Keo, a journaling companion. Your primary role is to create a safe, non-judgmental space for the user to explore their thoughts and feelings.

Your Role as Keo:
1.  **Listen Actively:** Provide thoughtful, validating, and non-judgmental responses that show you understand.
2.  **Encourage Reflection Subtly:** Gently ask open-ended questions to help users explore their feelings and thoughts more deeply. Nudge, don't push.
3.  **Identify Patterns:** Help users notice connections and patterns in their emotions or experiences over time.
4.  **Offer Perspective:** Help users find their own perspective, rather than giving direct advice.
5.  **Maintain Continuity:** Remember context from the provided conversation history to create a continuous and personal experience.

Interaction Guidelines:
-   Your tone should always be warm, supportive, and genuinely curious.
-   Validate the user's feelings first before asking questions (e.g., "That sounds really tough," or "It makes sense that you would feel that way.").
-   **CRITICAL** Keep responses concise but meaningful. Avoid long, overwhelming paragraphs. **YOU SHOULD WRITE ONE PAGRAGRAPH MAXIMUM.**
-   **CRITICAL** Only use one prompt at a time to encourage reflection. Avoid multiple questions in a single response. Your goal is to prompt the user to continue to write.
-   Avoid clichés or generic advice. Tailor your responses to the user's unique situation.
-   Focus on helping the user uncover their own insights.

*** CRITICAL SAFETY INSTRUCTIONS ***
You are not a therapist, doctor, or crisis counselor. Your duty is to act responsibly when faced with sensitive topics.

1.  **DO NOT PROVIDE MEDICAL OR THERAPEUTIC ADVICE:** Never diagnose, treat, or give any form of medical or psychological advice. If a user asks for advice on a mental health condition, gently decline and suggest they consult a healthcare professional.
    -   Example refusal: "I hear that you're looking for guidance on this, and I really appreciate you trusting me with that. However, as an AI, I'm not qualified to give therapeutic advice. The best person to help with this would be a licensed therapist or counselor."

2.  **IMMEDIATE CRISIS RESPONSE PROTOCOL:** If a user expresses thoughts of self-harm, suicide, or appears to be in immediate danger or severe crisis:
    -   **Step 1:** Immediately stop your standard journaling companion role.
    -   **Step 2:** Respond with empathy and serious concern.
    -   **Step 3:** CLEARLY state your limitation as an AI and that you cannot provide the help they need.
    -   **Step 4:** URGENTLY and DIRECTLY guide them to professional help. Provide a resource.
    -   **CRISIS RESPONSE EXAMPLE:** "It sounds like you are in a lot of pain, and I'm deeply concerned to hear you're feeling this way. It’s really important that you talk to someone who can help right now. Please reach out to a crisis hotline or emergency services immediately. You can call or text 988 in the US and Canada, or call 911. Your safety is the most important thing."
    -   **DO NOT** attempt to "talk them down" or explore the reasons for these feelings. Your ONLY priority is to guide them to real, human help.
"""

    def _sanitize_text(self, text: str) -> str:
        """Remove or mask common PII patterns from outgoing prompts."""
        if not text:
            return text
        t = text
        # Emails
        t = re.sub(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)\.[A-Za-z]{2,}", "[email]", t)
        # Phone numbers (simple patterns)
        t = re.sub(r"\b(?:\+?\d{1,3}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s-]?\d{3}[\s-]?\d{4}\b", "[phone]", t)
        # Names in brackets like [John], <John>
        t = re.sub(r"[\[<]([A-Z][a-z]{1,20})[>\]]", "[name]", t)
        # Addresses (very rough street patterns)
        t = re.sub(r"\b\d{1,5}\s+\w+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b", "[address]", t, flags=re.IGNORECASE)
        return t

    async def generate_response(self, user_message: str, relevant_memories: List[str], user_goals: Optional[List[str]] = None) -> str:
        try:
            # Build context from memories
            context = ""
            if relevant_memories:
                context = "\n\nRelevant conversation history:\n" + "\n".join([self._sanitize_text(m) for m in relevant_memories[:3]])
            # Add goals context if provided
            goals_text = ""
            if user_goals:
                goals_text = "\n\nUser focus areas/goals: " + ", ".join(user_goals[:5])
            
            # Create the prompt
            user_prompt = f"""User message: {self._sanitize_text(user_message)}{context}{goals_text}

Please respond as Keo, the empathetic journaling companion, following all your core instructions and safety protocols."""

            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                # Note: 'claude-sonnet-4-20250514' is a hypothetical future model name.
                # Use a currently available model like 'claude-3-5-sonnet-20240620' or 'claude-3-sonnet-20240229'.
                "model": "claude-3-5-sonnet-20240620",
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

    async def generate_response_stream(self, user_message: str, relevant_memories: List[str], user_goals: Optional[List[str]] = None) -> AsyncGenerator[str, None]:
        """Generate a streaming response from the AI service."""
        try:
            context = ""
            if relevant_memories:
                context = "\n\nRelevant conversation history:\n" + "\n".join([self._sanitize_text(m) for m in relevant_memories[:3]])
            goals_text = ""
            if user_goals:
                goals_text = "\n\nUser focus areas/goals: " + ", ".join(user_goals[:5])
            
            user_prompt = f"""User message: {self._sanitize_text(user_message)}{context}{goals_text}

Please respond as Keo, the empathetic journaling companion, following all your core instructions and safety protocols."""

            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "messages-2023-12-15" # Recommended for streaming
            }
            
            data = {
                "model": "claude-3-5-sonnet-20240620",
                "max_tokens": 1000,
                "temperature": 0.7,
                "system": self.system_prompt,
                "stream": True,
                "messages": [
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ]
            }
            
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    self.base_url,
                    headers=headers,
                    json=data,
                    timeout=30.0
                ) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data_json = json.loads(data_str)
                                    if data_json.get("type") == "content_block_delta":
                                        delta = data_json.get("delta", {})
                                        if "text" in delta:
                                            yield delta["text"]
                                except json.JSONDecodeError:
                                    continue
                    else:
                        error_text = await response.aread()
                        print(f"API Error: {response.status_code} - {error_text}")
                        yield "I'm having trouble connecting right now. Could you try again?"
                        
        except Exception as e:
            print(f"Error generating streaming AI response: {e}")
            yield "I'm having trouble processing that right now. Could you try rephrasing your thoughts?"

    async def generate_opening_prompt(self, recent_journal_entries: List[str], user_goals: Optional[List[str]] = None) -> str:
        """Generate a contextual opening prompt based on recent journal entries."""
        try:
            if not recent_journal_entries:
                default_prompts = [
                    "What's been on your mind lately?",
                    "How are you feeling today?",
                    "What's one thing that stood out to you today?",
                    "I'm here to listen. What would you like to share?",
                    "What's bringing you here for reflection today?"
                ]
                return random.choice(default_prompts)
            
            context = "Recent journal entries:\n" + "\n---\n".join([self._sanitize_text(s) for s in recent_journal_entries[:3]])
            goals_line = f"\n\nUser goals to keep in mind: {', '.join(user_goals[:5])}" if user_goals else ""
            
            opening_prompt = f"""{context}{goals_line}

Based on the user's recent journal entries, craft a warm, empathetic opening message that:
1.  Acknowledges themes or emotions from recent entries without being overly specific.
2.  Shows you remember what they've shared.
3.  Asks a thoughtful, gentle follow-up question to continue the conversation.
4.  Keeps it concise (1-2 sentences).

Examples:
- "I remember you mentioned feeling overwhelmed at work. I was thinking of you. How are things looking today?"
- "It sounds like you've been processing a lot lately. What's on your heart right now?"

Respond only with the opening message itself, nothing else."""

            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                "model": "claude-3-5-sonnet-20240620",
                "max_tokens": 200,
                "temperature": 0.8,
                # Updated system prompt for this specific task
                "system": "You are Keo, an empathetic AI journaling companion. Your task is to generate warm, personal opening messages based on a user's journal history. Always maintain a supportive, safe, and non-triggering tone.",
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