from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List


class EmbeddingManager:

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            print(f"\n\nLoading embedding model: {self.model_name}\n")
            self.model = SentenceTransformer(self.model_name)
            print(f"\n\nModel successfully loaded. Embedding dimensions: {self.model.get_sentence_embedding_dimension()}\n")
        except Exception as e:
            print(f"Error loading embedding model: {e}")
            raise

    def generate_embeddings(self, texts: List[str]) -> np.ndarray:
        if not self.model:
            raise ValueError("Embedding model is not loaded.")

        print(f"Generating embeddings for {len(texts)} texts...")
        embeddings = self.model.encode(texts, show_progress_bar=True)
        print(f"Generated embeddings with shape: {embeddings.shape}")
        return embeddings
