import os
import sys
import json
sys.stdout.reconfigure(encoding="utf-8")
from langchain_core.documents import Document
from langchain_community.document_loaders import (
    PyPDFLoader,
    PyMuPDFLoader,
    CSVLoader,
    UnstructuredExcelLoader,
    UnstructuredWordDocumentLoader,
    UnstructuredImageLoader,
    UnstructuredPDFLoader,
    TextLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import hashlib
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity

# Maps a file extension to the loader class that knows how to read it,
# plus any extra settings that loader needs.
LOADER_REGISTRY = {
    ".pdf": (PyPDFLoader, {}),
    ".txt": (TextLoader, {"encoding": "utf-8"}),
    ".csv": (CSVLoader, {"encoding": "utf-8"}),
    ".xlsx": (UnstructuredExcelLoader, {"mode": "elements"}),
    ".xls": (UnstructuredExcelLoader, {"mode": "elements"}),
    ".docx": (UnstructuredWordDocumentLoader, {}),
    ".png": (UnstructuredImageLoader, {}),
    ".jpg": (UnstructuredImageLoader, {}),
    ".jpeg": (UnstructuredImageLoader, {}),
}

# Loads a PDF the normal (fast) way first. If barely any text came out,
# assume it's a scanned/image-based PDF and retry using OCR instead.
def load_pdf(file_path, min_chars_per_page=20):
    documents = PyPDFLoader(file_path).load()
    avg_chars = sum(len(d.page_content) for d in documents) / max(len(documents), 1)

    if avg_chars < min_chars_per_page:
        print(f" Low text yield ({avg_chars:.0f} chars/page) — retrying with OCR")
        documents = UnstructuredPDFLoader(file_path, strategy="ocr_only", languages=["eng"]).load()

    return documents

# Cache of already-loaded documents, so unchanged files (especially slow OCR'd
# PDFs) don't get reprocessed on every run.
CACHE_DIR = Path("data/.doc_cache")

def get_file_hash(file_path):
    return hashlib.md5(Path(file_path).read_bytes()).hexdigest()

def load_from_cache(file_hash):
    cache_file = CACHE_DIR / f"{file_hash}.json"
    if not cache_file.exists():
        return None
    with open(cache_file, "r", encoding="utf-8") as f:
        cached = json.load(f)
    return [Document(page_content=d["page_content"], metadata=d["metadata"]) for d in cached]

def save_to_cache(file_hash, documents):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{file_hash}.json"
    serializable = [{"page_content": d.page_content, "metadata": d.metadata} for d in documents]
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(serializable, f)

# Same chunk (same source file, page, and text) always gets the same id.
# Used to tell "already embedded" chunks apart from new ones.
def make_doc_id(doc):
    id_source = f"{doc.metadata.get('source_file', '')}_{doc.metadata.get('page', '')}_{doc.page_content}"
    return hashlib.md5(id_source.encode('utf-8')).hexdigest()

# Read every supported document type in a directory
def process_all_documents(data_directory):
    all_documents = []
    data_dir = Path(data_directory)

    #find every file whose extension we have a loader for
    supported_files = [
        f for f in data_dir.glob("**/*")
        if f.is_file() and f.suffix.lower() in LOADER_REGISTRY
    ]

    #measure the len of list and output how many files detected
    print(f"\nFound {len(supported_files)} supported files in {data_directory}")

    #loop thru each file to process it
    for file in supported_files:
        file_type = file.suffix.lower().lstrip(".")
        print(f"\nProcessing {file_type.upper()} file: {file.name}")
        try:
            file_hash = get_file_hash(file)
            documents = load_from_cache(file_hash)

            if documents is not None:
                print(f" Loaded {len(documents)} document(s) from cache")
            else:
                if file.suffix.lower() == ".pdf":
                    documents = load_pdf(str(file))
                else:
                    loader_cls, loader_kwargs = LOADER_REGISTRY[file.suffix.lower()]
                    loader = loader_cls(str(file), **loader_kwargs)
                    documents = loader.load()

                for doc in documents:
                    doc.metadata['source_file'] = file.name
                    doc.metadata['file_type'] = file_type

                save_to_cache(file_hash, documents)
                print(f" Loaded {len(documents)} document(s)")

            all_documents.extend(documents)

        except Exception as e:
            print(f"Error loading {file.name}: {e}")
    print(f"\nTotal Documents Loaded:  {len(all_documents)}")
    return all_documents
            
# Chunking the documents
def chunking(documents, chunk_size=1000, chunk_overlap=200):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size = chunk_size,
        chunk_overlap = chunk_overlap,
        length_function = len,
        separators=["\n\n", "\n", " ", ""] #an array containing markers to chunk at
    )

    split_docs = text_splitter.split_documents(documents)
    print(f"Split {len(documents)} documents into {len(split_docs)} chunks")

    # print(f"\nExample Chunk")
    # print(f"Content: {split_docs[0].page_content[:200]}")
    # print(f"MetaData: {split_docs[0].metadata}")

    return split_docs

all_documents = process_all_documents("data")
chunks = chunking(all_documents)

class EmbeddingManager:

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            print(f"\n\nLoading embedding model: {self.model_name}\n")
            self.model = SentenceTransformer(self.model_name)
            print(f"\n\nModel successfully loaded. Embedding dimensions: {self.model.get_sentence_embedding_dimension()}\n")
        except Exception as e:
            print(f"Error loading embedding model: {e}")
            raise

    def generate_embeddings(self, texts: List[str]) -> np.ndarray:
        if not self.model:
            raise ValueError("Embedding model is not loaded.")

        print(f"Generating embeddings for {len(texts)} texts...")
        embeddings = self.model.encode(texts, show_progress_bar=True)
        print(f"Generated embeddings with shape: {embeddings.shape}")
        return embeddings


embedding_manager = EmbeddingManager()

class VectorDB:

    def __init__(self, collection_name: str = "pdf_chunks", persist_directory: str = "data/chroma"):
        self.collection_name = collection_name
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None
        self._initialize_chromadb()

    def _initialize_chromadb(self):
        try:
            os.makedirs(self.persist_directory, exist_ok=True)
            self.client = chromadb.PersistentClient(path=self.persist_directory)

            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "Collection of PDF chunks with embeddings for RAG"})

            print(f"VectorDB initialized with collection: {self.collection_name} at {self.persist_directory}")
            print(f"Existing documents in collection: {self.collection.count()}")

        except Exception as e:
            print(f"Error initializing vectorDB: {e}")
            raise

    def add_documents(self, documents:List[Any], embeddings: np.ndarray):
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents and embeddings must match.")

        print(f"Adding {len(documents)} documents to the vectorDB...")

        #existing ids in the collection, so reruns don't add duplicates
        existing_ids = set(self.collection.get(include=[])['ids'])

        ids = []
        metadatas=[]
        documents_text=[]
        embeddings_list=[]

        for i, (doc, embedding) in enumerate(zip(documents, embeddings)):
            doc_id = make_doc_id(doc)

            #skip chunks already stored in the vectorDB
            if doc_id in existing_ids:
                continue
            ids.append(doc_id)

            #make some metadata
            metadata = dict(doc.metadata)
            metadata['doc_index'] = i
            metadata['content_length'] = len(doc.page_content)
            metadatas.append(metadata)

            #add doc content in list
            documents_text.append(doc.page_content)

            #add embeddings in list
            embeddings_list.append(embedding.tolist())

        if not ids:
            print("No new documents to add, all chunks already exist in the vectorDB.")
            return

        try:
            self.collection.add(
                ids=ids,
                metadatas=metadatas,
                documents=documents_text,
                embeddings=embeddings_list
            )
            print(f"Successfully added {len(documents)} documents to the vectorDB.")
            print(f"Total documents in collection: {self.collection.count()}")
        except Exception as e:
            print(f"Error adding documents to vectorDB: {e}")
            raise

vectorDB=VectorDB()

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

