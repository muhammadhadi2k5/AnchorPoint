import os
import numpy as np
from typing import List
from dotenv import load_dotenv
from google import genai
from google.genai import types
from rate_limit_guard import RateLimitGuard

load_dotenv()

MODEL_NAME = "gemini-embedding-001"
#must match EMBEDDING_DIM in vector_db.py, since that's what Qdrant is
#configured to store
EMBEDDING_DIM = 768


class EmbeddingManager:

    #free tier: 1000 requests/day for gemini-embedding-001, per your AI Studio dashboard
    def __init__(self, daily_limit=1000):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")

        self.client = genai.Client(api_key=api_key)
        self.guard = RateLimitGuard(name="embedding", daily_limit=daily_limit)

    #for text being stored/indexed
    def embed_documents(self, texts: List[str]) -> np.ndarray:
        return self._embed(texts, task_type="RETRIEVAL_DOCUMENT")

    #for a search query - a different task_type than documents, since
    #matching a short question against long stored chunks is asymmetric
    def embed_query(self, text: str) -> np.ndarray:
        return self._embed([text], task_type="RETRIEVAL_QUERY")[0]

    def _embed(self, texts: List[str], task_type: str) -> np.ndarray:
        print(f"Generating {task_type} embeddings for {len(texts)} text(s)...")

        result = self.guard.call(
            self.client.models.embed_content,
            model=MODEL_NAME,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=EMBEDDING_DIM,
            ),
        )

        embeddings = np.array([e.values for e in result.embeddings])
        print(f"Generated embeddings with shape: {embeddings.shape}")
        return embeddings
