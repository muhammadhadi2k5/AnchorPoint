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

#model is already loaded above, so queries in this loop don't pay that cost again
while True:
    query = input("\nEnter your query (or 'q' to quit): ")
    if query.strip().lower() == "q":
        break

    #both retrieval (query embedding) and generation now call out to Gemini,
    #so a dropped connection can happen at either step - catch it once
    #around both instead of duplicating the same handling twice
    try:
        results = retriever.retrieve(query, top_k=5, threshold=0.3)

        print(f"\nQuery: {query}")
        print("\n" + "=" * 80)
        print("ANSWER")
        print("=" * 80)
        #each piece prints as soon as it arrives, instead of waiting for the
        #whole answer to finish generating
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
