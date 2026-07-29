import os
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError
from rate_limit_guard import QuotaExceededError

load_dotenv()

MODEL_NAME = "grok-4.5"

SYSTEM_INSTRUCTION = (
    "You are a helpful assistant answering questions using ONLY the provided context. "
    "If the answer isn't in the context, say you don't know - don't make anything up. "
    "Mention which source file each part of your answer comes from."
)


class GrokGenerator:

    def __init__(self):
        api_key = os.environ.get("XAI_API_KEY")
        if not api_key:
            raise ValueError("XAI_API_KEY is not set. Add it to your .env file.")

        self.client = OpenAI(api_key=api_key, base_url="https://api.x.ai/v1")

    #turns retrieved chunks into one labeled text block, so the model can
    #see where each piece of context came from and cite it
    def _format_context(self, results):
        parts = []
        for i, result in enumerate(results, start=1):
            source = result["metadata"].get("source_file", "unknown")
            parts.append(f"[Source {i}: {source}]\n{result['text']}")
        return "\n\n".join(parts)

    #generates an answer to the query, grounded only in the retrieved chunks.
    #yields text pieces as they're generated
    def generate_answer(self, query, results):
        if not results:
            yield "I don't have any relevant information to answer that question."
            return

        context = self._format_context(results)
        prompt = f"Context:\n{context}\n\nQuestion: {query}"

        try:
            stream = self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": SYSTEM_INSTRUCTION},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            for chunk in stream:
                piece = chunk.choices[0].delta.content
                if piece:
                    yield piece
        except RateLimitError as e:
            raise QuotaExceededError(f"[grok] xAI reports the rate limit is exceeded: {e}") from e
