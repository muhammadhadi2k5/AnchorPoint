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

# only embed what's actually new, re-embedding stuff already in qdrant is
# just wasted API calls
existing_ids = vectorDB.get_existing_ids()
new_chunks = [chunk for chunk in chunks if make_doc_id(chunk) not in existing_ids]
print(f"\n{len(new_chunks)} new chunk(s) out of {len(chunks)} need embedding")

if new_chunks:
    texts = [doc.page_content for doc in new_chunks]
    embeddings = embedding_manager.embed_documents(texts)
    vectorDB.add_documents(new_chunks, embeddings)
else:
    print("Nothing new to embed, vectorDB is already up to date.")
