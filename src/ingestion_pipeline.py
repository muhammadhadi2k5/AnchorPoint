import os
import sys
sys.stdout.reconfigure(encoding="utf-8")
from langchain_community.document_loaders import PyPDFLoader, PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import hashlib
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity

# Read the pdfs
def process_all_pdfs(pdf_directory):
    all_documents = []
    pdf_dir = Path(pdf_directory)

    #stores all the files with .pdf extension in a list called pdf_files
    pdf_files = list(pdf_dir.glob("**/*.pdf"))

    #measure the len of list and output how many files detected
    print(f"\nFound {len(pdf_files)} PDF files in {pdf_directory}")

    #loop thru each file to process it
    for pdf_file in pdf_files:
        print(f"\nProcessing PDF file: {pdf_file.name}")
        try:
            loader = PyPDFLoader(str(pdf_file))
            documents = loader.load()

            for doc in documents:
                doc.metadata['source_file'] = pdf_file.name
                doc.metadata['file_type'] = 'pdf'

            all_documents.extend(documents)
            print(f" Loaded {len(documents)} pages")

        except Exception as e:
            print(f"Error loading {pdf_file.name}: {e}")
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

all_pdf_documents = process_all_pdfs("data\pdf")
chunks = chunking(all_pdf_documents)

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
            #deterministic id based on content, so the same chunk always hashes to the same id
            id_source = f"{doc.metadata.get('source_file', '')}_{doc.metadata.get('page', '')}_{doc.page_content}"
            doc_id = hashlib.md5(id_source.encode('utf-8')).hexdigest()

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

#convert the text to embeddings
texts = [doc.page_content for doc in chunks]

#generate the embeddings
embeddings = embedding_manager.generate_embeddings(texts)

#store embeddings in vectorDB
vectorDB.add_documents(chunks, embeddings)


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
for i in range(3):
    print(f"\n--- Embedding {i + 1} (for chunk {i + 1}) ---")
    print(f"Shape: {embeddings[i].shape}")
    print(f"First 10 dims: {np.round(embeddings[i][:10], 4)}")

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

