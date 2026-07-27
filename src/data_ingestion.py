import os
from langchain_community.document_loaders import PyPDFLoader, PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import uuid
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

    print(f"\nExample Chunk")
    print(f"Content: {split_docs[0].page_content[:200]}")
    print(f"MetaData: {split_docs[0].metadata}")

    return chunking

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
            print(f"\n\nModel successfully loaded. Embedding dimensions: {self.model.get_embedding_dimension()}\n")
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

    def get_embedding_dimension(self) -> int:
        if not self.model:
            raise ValueError("Embedding model is not loaded.")
        return self.model.get_sentence_embedding_dimension()

embedding_manager = EmbeddingManager()
