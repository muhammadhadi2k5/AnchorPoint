import sys
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np

from document_loader import process_all_documents
from chunker import chunking
from embedding_manager import EmbeddingManager
from vector_db import VectorDB, make_doc_id

all_documents = process_all_documents("data")
chunks = chunking(all_documents)

embedding_manager = EmbeddingManager()
vectorDB = VectorDB()

#skip chunks that are already embedded and stored, so reruns don't waste
#time re-embedding chunks we already have
existing_ids = set(vectorDB.collection.get(include=[])['ids'])
new_chunks = [chunk for chunk in chunks if make_doc_id(chunk) not in existing_ids]
print(f"\n{len(new_chunks)} new chunk(s) out of {len(chunks)} need embedding")

if new_chunks:
    #convert the new chunks' text to embeddings
    texts = [doc.page_content for doc in new_chunks]
    embeddings = embedding_manager.generate_embeddings(texts)

    #store embeddings in vectorDB
    vectorDB.add_documents(new_chunks, embeddings)
else:
    print("Nothing new to embed, vectorDB is already up to date.")


# ============================================================
# DEMO ONLY — sample chunks, embeddings, and vectorDB storage
# proof. Safe to delete once no longer needed.
# ============================================================

print("\n" + "=" * 80)
print("SAMPLE CHUNKS")
print("=" * 80)
for i, chunk in enumerate(chunks[:3]):
    preview = chunk.page_content[:300].strip()
    print(f"\n--- Chunk {i + 1} ---")
    print(f"Metadata: {chunk.metadata.get('source_file')} | Page: {chunk.metadata.get('page', 'N/A')}\n")
    print(f"Content ({len(chunk.page_content)} chars): {preview}{'...' if len(chunk.page_content) > 300 else ''}")

print("\n" + "=" * 80)
print("SAMPLE EMBEDDINGS")
print("=" * 80)
#pulled straight from the vectorDB, so this works whether or not this run
#embedded anything new
sample_ids = [make_doc_id(chunk) for chunk in chunks[:3]]
sample_stored = vectorDB.collection.get(ids=sample_ids, include=["embeddings"])
for i, vector in enumerate(sample_stored["embeddings"]):
    print(f"\n--- Embedding {i + 1} (for chunk {i + 1}) ---")
    print(f"Dims: {len(vector)}")
    print(f"First 10 dims: {np.round(vector[:10], 4)}")

print("\n" + "=" * 80)
print("VECTORDB STORAGE CHECK")
print("=" * 80)
stored = vectorDB.collection.get(limit=3, include=["embeddings", "documents", "metadatas"])
print(f"Total vectors stored in collection: {vectorDB.collection.count()}")
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
