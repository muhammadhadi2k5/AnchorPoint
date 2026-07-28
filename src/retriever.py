from sklearn.metrics.pairwise import cosine_similarity


class Retriever:

    def __init__(self, vectorDB, embedding_manager):
        self.vectorDB = vectorDB
        self.embedding_manager = embedding_manager

    #turns the user's query text into a single embedding vector
    def _embed_query(self, query):
        return self.embedding_manager.embed_query(query)

    #pulls every stored chunk's embedding, text, and metadata out of the vectorDB
    def _get_all_stored(self):
        return self.vectorDB.get_all()

    #embeds the query, compares it against every stored chunk, and returns
    #the top matches above the similarity threshold
    def retrieve(self, query, top_k=5, threshold=0.3):
        query_vector = self._embed_query(query)
        stored = self._get_all_stored()

        if not stored["ids"]:
            print("VectorDB is empty, nothing to search.")
            return []

        #cosine_similarity expects 2D arrays: one row = one vector
        similarities = cosine_similarity([query_vector], stored["embeddings"])[0]

        results = []
        for i, score in enumerate(similarities):
            if score >= threshold:
                results.append({
                    "score": score,
                    "text": stored["documents"][i],
                    "metadata": stored["metadatas"][i],
                })

        #highest similarity first
        results.sort(key=lambda r: r["score"], reverse=True)

        return results[:top_k]

    #prints results in a clean, readable format
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
