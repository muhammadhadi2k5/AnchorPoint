from sklearn.metrics.pairwise import cosine_similarity


class Retriever:

    def __init__(self, vectorDB, embedding_manager):
        self.vectorDB = vectorDB
        self.embedding_manager = embedding_manager

    def _embed_query(self, query):
        return self.embedding_manager.embed_query(query)

    def _get_all_stored(self):
        return self.vectorDB.get_all()

    # brute force cosine similarity - fine at this scale (couple thousand
    # chunks), would need an actual index if this ever gets huge
    def retrieve(self, query, top_k=7, threshold=0.45):
        query_vector = self._embed_query(query)
        stored = self._get_all_stored()

        if not stored["ids"]:
            print("VectorDB is empty, nothing to search.")
            return []

        # cosine_similarity wants 2D arrays even for a single query vector
        similarities = cosine_similarity([query_vector], stored["embeddings"])[0]

        results = []
        for i, score in enumerate(similarities):
            if score >= threshold:  # drop anything not even loosely related
                results.append({
                    "score": score,
                    "text": stored["documents"][i],
                    "metadata": stored["metadatas"][i],
                })

        results.sort(key=lambda r: r["score"], reverse=True)  # best match first

        return results[:top_k]

    # just for printing to terminal, not used by the actual answer generation
    def print_results(self, results):
        if not results:
            print("\nNo matching chunks found.")
            return

        print(f"\nSOURCES ({len(results)} chunk(s)):\n")
        for rank, result in enumerate(results, start=1):
            metadata = result["metadata"]
            print("=" * 80)
            print(f"Rank {rank} | Similarity: {result['score']:.4f}")
            print(f"Source: {metadata.get('source_file', 'unknown')} | Page: {metadata.get('page', 'N/A')}")
            print("-" * 80)
            print(result["text"].strip())
            print()
