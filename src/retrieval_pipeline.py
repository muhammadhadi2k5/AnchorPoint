import sys
sys.stdout.reconfigure(encoding="utf-8")

from vector_db import VectorDB
from embedding_manager import EmbeddingManager
from retriever import Retriever

vectorDB = VectorDB()
embedding_manager = EmbeddingManager()
retriever = Retriever(vectorDB, embedding_manager)

#model is already loaded above, so queries in this loop don't pay that cost again
while True:
    query = input("\nEnter your query (or 'q' to quit): ")
    if query.strip().lower() == "q":
        break

    results = retriever.retrieve(query, top_k=5, threshold=0.3)
    retriever.print_results(results, query)
