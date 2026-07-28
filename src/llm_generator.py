import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
from rate_limit_guard import RateLimitGuard

load_dotenv()

MODEL_NAME = "gemini-3.5-flash-lite"

SYSTEM_INSTRUCTION = (
    "You are a helpful assistant answering questions using ONLY the provided context. "
    "If the answer isn't in the context, say you don't know - don't make anything up. "
    "Mention which source file each part of your answer comes from."
)


class Generator:

    #free tier: 500 requests/day for gemini-3.5-flash-lite
    def __init__(self, daily_limit=500):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")

        self.client = genai.Client(api_key=api_key)
        self.guard = RateLimitGuard(name="llm", daily_limit=daily_limit)

    #turns retrieved chunks into one labeled text block, so the model can
    #see where each piece of context came from and cite it
    def _format_context(self, results):
        parts = []
        for i, result in enumerate(results, start=1):
            source = result["metadata"].get("source_file", "unknown")
            parts.append(f"[Source {i}: {source}]\n{result['text']}")
        return "\n\n".join(parts)

    #generates an answer to the query, grounded only in the retrieved chunks
    def generate_answer(self, query, results):
        if not results:
            return "I don't have any relevant information to answer that question."

        context = self._format_context(results)
        prompt = f"Context:\n{context}\n\nQuestion: {query}"

        response = self.guard.call(
            self.client.models.generate_content,
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
            ),
        )

        return response.text
