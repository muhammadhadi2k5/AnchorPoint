import uuid
import hashlib
import numpy as np
from typing import List, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

#matches the output_dimensionality configured in embedding_manager.py
EMBEDDING_DIM = 768


# Same chunk (same source file, page, and text) always gets the same id.
# Used to tell "already embedded" chunks apart from new ones.
def make_doc_id(doc):
    id_source = f"{doc.metadata.get('source_file', '')}_{doc.metadata.get('page', '')}_{doc.page_content}"
    md5_hash = hashlib.md5(id_source.encode('utf-8')).hexdigest()
    #Qdrant only accepts unsigned integers or UUIDs as point ids, so we
    #reshape the md5 hash (32 hex chars) into a UUID string, still deterministic
    return str(uuid.UUID(hex=md5_hash))


#turns a Qdrant point (id + payload + vector) into the same
#{ids, documents, metadatas, embeddings} shape the rest of the app expects
def _points_to_result(points):
    return {
        "ids": [p.id for p in points],
        "documents": [p.payload.get("text", "") for p in points],
        "metadatas": [{k: v for k, v in p.payload.items() if k != "text"} for p in points],
        "embeddings": [p.vector for p in points],
    }


class VectorDB:

    def __init__(self, collection_name: str = "pdf_chunks", host: str = "localhost", port: int = 6333):
        self.collection_name = collection_name
        self.client = QdrantClient(host=host, port=port)
        self._initialize_collection()

    def _initialize_collection(self):
        try:
            if not self.client.collection_exists(self.collection_name):
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
                )

            print(f"VectorDB initialized with collection: {self.collection_name}")
            print(f"Existing documents in collection: {self.count()}")

        except Exception as e:
            print(f"Error initializing vectorDB: {e}")
            raise

    def count(self):
        return self.client.count(self.collection_name).count

    #every point id currently stored, so we know what NOT to re-embed
    def get_existing_ids(self):
        existing_ids = set()
        next_offset = None
        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.collection_name,
                limit=1000,
                with_payload=False,
                with_vectors=False,
                offset=next_offset,
            )
            existing_ids.update(point.id for point in points)
            if next_offset is None:
                break
        return existing_ids

    #every stored chunk's text, metadata, and embedding vector
    def get_all(self):
        all_points = []
        next_offset = None
        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.collection_name,
                limit=1000,
                with_payload=True,
                with_vectors=True,
                offset=next_offset,
            )
            all_points.extend(points)
            if next_offset is None:
                break
        return _points_to_result(all_points)

    #a small sample of stored chunks, without scanning the whole collection
    def peek(self, limit=3):
        points, _ = self.client.scroll(
            collection_name=self.collection_name,
            limit=limit,
            with_payload=True,
            with_vectors=True,
        )
        return _points_to_result(points)

    #fetch specific chunks by id
    def get_by_ids(self, ids):
        points = self.client.retrieve(collection_name=self.collection_name, ids=ids, with_vectors=True)
        return _points_to_result(points)

    def add_documents(self, documents: List[Any], embeddings: np.ndarray):
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents and embeddings must match.")

        print(f"Adding {len(documents)} documents to the vectorDB...")

        #existing ids in the collection, so reruns don't add duplicates
        existing_ids = self.get_existing_ids()

        points = []
        for doc, embedding in zip(documents, embeddings):
            doc_id = make_doc_id(doc)

            #skip chunks already stored in the vectorDB
            if doc_id in existing_ids:
                continue

            #payload holds the chunk text plus all its metadata together
            payload = dict(doc.metadata)
            payload['text'] = doc.page_content
            payload['content_length'] = len(doc.page_content)

            points.append(PointStruct(id=doc_id, vector=embedding.tolist(), payload=payload))

        if not points:
            print("No new documents to add, all chunks already exist in the vectorDB.")
            return

        try:
            self.client.upsert(collection_name=self.collection_name, points=points)
            print(f"Successfully added {len(points)} documents to the vectorDB.")
            print(f"Total documents in collection: {self.count()}")
        except Exception as e:
            print(f"Error adding documents to vectorDB: {e}")
            raise
