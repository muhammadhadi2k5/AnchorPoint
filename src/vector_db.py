import os
import hashlib
import chromadb
import numpy as np
from typing import List, Any


# Same chunk (same source file, page, and text) always gets the same id.
# Used to tell "already embedded" chunks apart from new ones.
def make_doc_id(doc):
    id_source = f"{doc.metadata.get('source_file', '')}_{doc.metadata.get('page', '')}_{doc.page_content}"
    return hashlib.md5(id_source.encode('utf-8')).hexdigest()


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
