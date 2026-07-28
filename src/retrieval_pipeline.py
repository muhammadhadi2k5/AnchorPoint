import sys
sys.stdout.reconfigure(encoding="utf-8")

from vector_db import VectorDB
from embedding_manager import EmbeddingManager
from retriever import Retriever
from llm_generator import Generator

vectorDB = VectorDB()
embedding_manager = EmbeddingManager()
retriever = Retriever(vectorDB, embedding_manager)
generator = Generator()

#model is already loaded above, so queries in this loop don't pay that cost again
while True:
    query = input("\nEnter your query (or 'q' to quit): ")
    if query.strip().lower() == "q":
        break

    results = retriever.retrieve(query, top_k=5, threshold=0.3)
    answer = generator.generate_answer(query, results)

    print(f"\nQuery: {query}")
    print("\n" + "=" * 80)
    print("ANSWER")
    print("=" * 80)
    print(answer)

    retriever.print_results(results)
