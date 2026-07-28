from sklearn.metrics.pairwise import cosine_similarity


class Retriever:

    def __init__(self, vectorDB, embedding_manager):
        self.vectorDB = vectorDB
        self.embedding_manager = embedding_manager
