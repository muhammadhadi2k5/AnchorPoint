import os
import time
import numpy as np
from typing import List
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types
from core.rate_limit_guard import raise_on_quota_exceeded

load_dotenv()

MODEL_NAME = "gemini-embedding-001"
# keep this in sync with EMBEDDING_DIM in vector_db.py or qdrant rejects the vectors
EMBEDDING_DIM = 768

MAX_CHARS_PER_BATCH = 16000


TARGET_TEXTS_PER_MINUTE = 60


class EmbeddingManager:

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")

        # 60s timeout - long enough to survive the usual ~20s free tier
        # queueing delay, but won't hang forever if the connection dies
        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60000),
        )

    # embeds chunks going INTO the vectorDB. handles batching + pacing
    def embed_documents(self, texts: List[str]) -> np.ndarray:
        batches = self._make_batches(texts)
        all_embeddings = []

        for i, batch in enumerate(batches):
            if i > 0:
                # sleep proportional to batch size so we don't blow the per-min limit
                time.sleep(60 * len(batch) / TARGET_TEXTS_PER_MINUTE)
            all_embeddings.append(self._embed(batch, task_type="RETRIEVAL_DOCUMENT"))

        return np.vstack(all_embeddings)

    # groups texts so each batch stays under the per-request char/token cap
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

    # different task_type than documents on purpose, a short question and a long stored chunk
    # aren't symmetric and gemini treats them differently under the hood
    def embed_query(self, text: str) -> np.ndarray:
        return self._embed([text], task_type="RETRIEVAL_QUERY")[0]

    def _embed(self, texts: List[str], task_type: str) -> np.ndarray:
        print(f"Generating {task_type} embeddings for {len(texts)} text(s)...")

        try:
            result = self.client.models.embed_content(
                model=MODEL_NAME,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=EMBEDDING_DIM,
                ),
            )
        except errors.APIError as e:
            raise_on_quota_exceeded(e, "embedding")

        embeddings = np.array([e.values for e in result.embeddings])
        print(f"Generated embeddings with shape: {embeddings.shape}")
        return embeddings
