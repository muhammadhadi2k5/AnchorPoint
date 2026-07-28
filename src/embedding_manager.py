import os
import time
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


MAX_CHARS_PER_BATCH = 16000

TARGET_TEXTS_PER_MINUTE = 60


class EmbeddingManager:

    #free tier: 1000 requests/day for gemini-embedding-001, per your AI Studio dashboard
    def __init__(self, daily_limit=1000):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")

        self.client = genai.Client(api_key=api_key)
        self.guard = RateLimitGuard(name="embedding", daily_limit=daily_limit)

    #for text being stored/indexed. Splits into batches under the API's
    #per-request token limit, and paces requests to stay under the
    #requests-per-minute limit too - callers don't need to think about either.
    def embed_documents(self, texts: List[str]) -> np.ndarray:
        batches = self._make_batches(texts)
        all_embeddings = []

        for i, batch in enumerate(batches):
            if i > 0:
                #pace so this batch's texts don't push us over the
                #per-minute limit (e.g. a 20-text batch waits 20/60th of
                #the per-minute budget before sending)
                time.sleep(60 * len(batch) / TARGET_TEXTS_PER_MINUTE)
            all_embeddings.append(self._embed(batch, task_type="RETRIEVAL_DOCUMENT"))

        return np.vstack(all_embeddings)

    #groups texts into batches that stay under MAX_CHARS_PER_BATCH each
    def _make_batches(self, texts: List[str]):
        batches = []
        current_batch = []
        current_chars = 0

        for text in texts:
            if current_batch and current_chars + len(text) > MAX_CHARS_PER_BATCH:
                batches.append(current_batch)
                current_batch = []
                current_chars = 0

            current_batch.append(text)
            current_chars += len(text)

        if current_batch:
            batches.append(current_batch)

        return batches

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
            count=len(texts),
        )

        embeddings = np.array([e.values for e in result.embeddings])
        print(f"Generated embeddings with shape: {embeddings.shape}")
        return embeddings
