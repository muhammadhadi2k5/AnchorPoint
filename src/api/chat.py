from vector_db import VectorDB
from embedding_manager import EmbeddingManager
from retriever import Retriever
from llm_generator import Generator

from api import db

# flip to False to test latency without conversation memory. generate_answer
# treats history=None the same as if this whole feature never existed, so
# this is safe to toggle - or delete the block below entirely - without
# breaking anything downstream
INCLUDE_HISTORY = True


def _build_history(dataset_id):
    if not INCLUDE_HISTORY:
        return None
    return [
        {"role": m["role"], "content": m["content"]}
        for m in db.list_messages(dataset_id)
    ]


# chunk text goes in here too, not just source/page/score - so clicking a
# citation can show the actual passage the answer came from without a
# separate lookup call
def _build_citations(results):
    return [
        {
            "source_file": r["metadata"].get("source_file", "unknown"),
            "page": r["metadata"].get("page"),
            "score": round(float(r["score"]), 2),
            "text": r["text"],
        }
        for r in results
    ]


# streams the answer back piece by piece, and persists both sides of the
# exchange (with citations on the assistant message) once streaming finishes
def ask(dataset_id, query):
    collection_name = db.collection_name_for(dataset_id)
    vector_db = VectorDB(collection_name=collection_name)
    embedding_manager = EmbeddingManager()
    retriever = Retriever(vector_db, embedding_manager)
    generator = Generator()

    history = _build_history(dataset_id)
    db.add_message(dataset_id, "user", query)

    results = retriever.retrieve(query, top_k=7, threshold=0.45)
    citations = _build_citations(results) if results else None

    def stream():
        pieces = []
        for piece in generator.generate_answer(query, results, history=history):
            pieces.append(piece)
            yield piece
        db.add_message(dataset_id, "assistant", "".join(pieces), citations=citations)

    return stream()
