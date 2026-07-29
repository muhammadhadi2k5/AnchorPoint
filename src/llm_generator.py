import os
from dotenv import load_dotenv
from google import genai
from google.genai import types, errors
from rate_limit_guard import RateLimitGuard, QuotaExceededError

load_dotenv()

MODEL_NAME = "gemini-3.5-flash-lite"

SYSTEM_INSTRUCTION = (
    "You are a helpful assistant answering questions using ONLY the provided context. "
    "Thoroughly study the context and give a well formatted, clean answer. "
    "If the answer isn't in the context, say you don't know - don't make anything up. "
    "Mention which source file each part of your answer comes from."
)


class Generator:

    
    def __init__(self, daily_limit=500):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")


        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60000),
        )
        self.guard = RateLimitGuard(name="llm", daily_limit=daily_limit)

    # labels each chunk with its source file so the model can cite where it
    # got each part of the answer from
    def _format_context(self, results):
        parts = []
        for i, result in enumerate(results, start=1):
            source = result["metadata"].get("source_file", "unknown")
            parts.append(f"[Source {i}: {source}]\n{result['text']}")
        return "\n\n".join(parts)

    # yields text as it streams in instead of returning the whole answer at
    # once - makes long answers feel way less laggy
    def generate_answer(self, query, results):
        if not results:
            yield "I don't have any relevant information to answer that question."
            return

        context = self._format_context(results)
        prompt = f"Context:\n{context}\n\nQuestion: {query}"

        # local quota check before even hitting the API
        self.guard.check_and_increment()

        try:
            stream = self.client.models.generate_content_stream(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                ),
            )
            for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except errors.APIError as e:
            if e.code == 429: 
                raise QuotaExceededError(
                    f"[{self.guard.name}] Google's API reports the quota is exceeded: {e.message}"
                ) from e
            raise
