import re
from sklearn.metrics.pairwise import cosine_similarity

# generic words to ignore when pulling the drug name out of a filename
GENERIC_FILENAME_WORDS = {"insert", "sheet", "label", "leaflet", "pdf", "doc", "document"}

# skip tokens shorter than this so stuff like "v1" doesn't match everything
MIN_TOKEN_LEN = 4


class Retriever:

    def __init__(self, vectorDB, embedding_manager):
        self.vectorDB = vectorDB
        self.embedding_manager = embedding_manager

    def _embed_query(self, query):
        return self.embedding_manager.embed_query(query)

    def _get_all_stored(self):
        return self.vectorDB.get_all()

    # word-overlap match between query and filenames, no API call needed
    def _detect_target_sources(self, query, known_sources):
        query_words = [w for w in re.split(r"\W+", query.lower()) if len(w) >= MIN_TOKEN_LEN]

        matches = []
        for source in known_sources:
            stem = re.sub(r"\.\w+$", "", source.lower())  # drop the extension
            filename_tokens = [
                t for t in re.split(r"\W+", stem)
                if len(t) >= MIN_TOKEN_LEN and t not in GENERIC_FILENAME_WORDS
            ]

            if any(qw in ft or ft in qw for qw in query_words for ft in filename_tokens):
                matches.append(source)

        return matches

    # brute force cosine similarity - fine at this scale (couple thousand
    # chunks), would need an actual index if this ever gets huge
    def retrieve(self, query, top_k=7, threshold=0.45):
        query_vector = self._embed_query(query)
        stored = self._get_all_stored()

        if not stored["ids"]:
            print("VectorDB is empty, nothing to search.")
            return []

        # narrow to the detected drug's file(s), empty match = search all
        known_sources = sorted(set(m.get("source_file", "") for m in stored["metadatas"]))
        target_sources = self._detect_target_sources(query, known_sources)

        if target_sources:
            keep = [i for i, m in enumerate(stored["metadatas"]) if m.get("source_file") in target_sources]
            stored = {key: [values[i] for i in keep] for key, values in stored.items()}

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
