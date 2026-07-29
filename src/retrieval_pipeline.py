import sys
sys.stdout.reconfigure(encoding="utf-8")
import httpx

from vector_db import VectorDB
from embedding_manager import EmbeddingManager
from retriever import Retriever
from llm_generator import Generator

vectorDB = VectorDB()
embedding_manager = EmbeddingManager()
retriever = Retriever(vectorDB, embedding_manager)
generator = Generator()


while True:
    query = input("\nEnter your query (or 'q' to quit): ")
    if query.strip().lower() == "q":
        break

    # chance of dropped connection
    try:
        results = retriever.retrieve(query, top_k=7, threshold=0.45)

        print(f"\nQuery: {query}")
        print("\n" + "=" * 80)
        print("ANSWER")
        print("=" * 80)
        # prints as it streams in instead of waiting for the full answer
        for piece in generator.generate_answer(query, results):
            print(piece, end="", flush=True)
        print()

        retriever.print_results(results)

    except httpx.ConnectError:
        print("\nInternet is not connected. Please reconnect and retry.")
        continue
    except httpx.TimeoutException:
        print("\nRequest timed out (connection stalled). Please try again.")
        continue
