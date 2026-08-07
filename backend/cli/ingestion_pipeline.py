import sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

# lets this script import its sibling top-level packages (ingestion, core)
# regardless of the caller's working directory, same reasoning as api/__init__.py
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from ingestion.document_loader import process_all_documents
from ingestion.chunker import chunking
from core.embedding_manager import EmbeddingManager
from core.vector_db import VectorDB, make_doc_id

# anchored to the project root rather than a bare "data" string, so this
# still finds the real data/ regardless of where `uv run` is invoked from
_DATA_DIR = _BACKEND_DIR.parent / "data"

all_documents = process_all_documents(str(_DATA_DIR))
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
