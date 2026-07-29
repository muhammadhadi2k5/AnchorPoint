# ============================================================
# DEMO ONLY — sample chunks, embeddings, and vectorDB storage
# proof. Safe to delete once no longer needed.
# ============================================================

import sys
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np

from document_loader import process_all_documents
from chunker import chunking
from vector_db import VectorDB, make_doc_id


all_documents = process_all_documents("data")
chunks = chunking(all_documents)
vectorDB = VectorDB()

print("\n" + "=" * 80)
print(f"ALL CHUNKS ({len(chunks)} total)")
print("=" * 80)
for i, chunk in enumerate(chunks):
    print(f"\n--- Chunk {i + 1}/{len(chunks)} ---")
    print(f"Metadata: {chunk.metadata.get('source_file')} | Page: {chunk.metadata.get('page', 'N/A')}\n")
    print(f"Content ({len(chunk.page_content)} chars):")
    print(chunk.page_content.strip())

print("\n" + "=" * 80)
print("SAMPLE EMBEDDINGS")
print("=" * 80)
#pulled straight from the vectorDB, so this works whether or not this run
#embedded anything new
sample_ids = [make_doc_id(chunk) for chunk in chunks[:3]]
sample_stored = vectorDB.get_by_ids(sample_ids)
for i, vector in enumerate(sample_stored["embeddings"]):
    print(f"\n--- Embedding {i + 1} (for chunk {i + 1}) ---")
    print(f"Dims: {len(vector)}")
    print(f"First 10 dims: {np.round(vector[:10], 4)}")

print("\n" + "=" * 80)
print("VECTORDB STORAGE CHECK")
print("=" * 80)
stored = vectorDB.peek(limit=3)
print(f"Total vectors stored in collection: {vectorDB.count()}")
for i, doc_id in enumerate(stored["ids"]):
    print(f"\n--- Stored Entry {i + 1} ---")
    print(f"ID: {doc_id}")
    print(f"Embedding dims: {len(stored['embeddings'][i])}")
    print(f"Embedding preview: {np.round(stored['embeddings'][i][:10], 4)}")
    print(f"Document preview: {stored['documents'][i][:150]}...")

print("\nCHUNK OVERLAP EXAMPLE")
print("=" * 80)
print(chunks[0].page_content[-200:])
print("---")
print(chunks[1].page_content[:200])

# ============================================================
# END DEMO
# ============================================================
