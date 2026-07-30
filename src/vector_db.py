import uuid
import hashlib
import numpy as np
from typing import List, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# has to match output_dimensionality in embedding_manager.py or inserts fail
EMBEDDING_DIM = 768


# same chunk (same source file + page + text) always hashes to the same id.
# that's how I know a chunk is a duplicate on reruns
def make_doc_id(doc):
    id_source = f"{doc.metadata.get('source_file', '')}_{doc.metadata.get('page', '')}_{doc.page_content}"
    md5_hash = hashlib.md5(id_source.encode('utf-8')).hexdigest()
    # Qdrant ids have to be either an int or a UUID, not a random string.
    # md5 hash is 32 hex chars = same length as a UUID, so just repack it
    return str(uuid.UUID(hex=md5_hash))


# standalone helper (not a VectorDB method) since VectorDB's constructor
# always creates the collection if missing, which would defeat deleting it
def delete_collection(collection_name, host="localhost", port=6333):
    try:
        client = QdrantClient(host=host, port=port)
        if client.collection_exists(collection_name):
            client.delete_collection(collection_name)
    except Exception:
        pass


# qdrant points don't come back in the shape the rest of my code expects,
# reshape into {ids, documents, metadatas, embeddings} everywhere
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

    # ids of everything already stored, so add_documents knows what to skip
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
            if next_offset is None:  # qdrant sets this to None once we've paged through everything
                break
        return existing_ids

    # full dump - text + metadata + vectors for every stored chunk. used by
    # the retriever to do the cosine similarity search
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

    # quick look at a few stored chunks without pulling the whole collection
    def peek(self, limit=3):
        points, _ = self.client.scroll(
            collection_name=self.collection_name,
            limit=limit,
            with_payload=True,
            with_vectors=True,
        )
        return _points_to_result(points)

    def get_by_ids(self, ids):
        points = self.client.retrieve(collection_name=self.collection_name, ids=ids, with_vectors=True)
        return _points_to_result(points)

    def add_documents(self, documents: List[Any], embeddings: np.ndarray):
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents and embeddings must match.")

        print(f"Adding {len(documents)} documents to the vectorDB...")

        existing_ids = self.get_existing_ids()

        points = []
        for doc, embedding in zip(documents, embeddings):
            doc_id = make_doc_id(doc)

            if doc_id in existing_ids:  
                continue

            # payload = chunk text + all its metadata bundled together
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
