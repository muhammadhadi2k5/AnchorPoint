import threading

from ingestion.document_loader import process_all_documents
from ingestion.chunker import chunking
from core.embedding_manager import EmbeddingManager
from core.rate_limit_guard import QuotaExceededError
from core.vector_db import VectorDB, make_doc_id

from models import db
from api.progress import set_progress


def _loader_progress(dataset_id):
    def handler(event, **kwargs):
        if event == "reading":
            set_progress(dataset_id, "Reading your documents...", stage="reading")
        elif event == "reading_file":
            set_progress(
                dataset_id,
                "Reading your documents...",
                filename=kwargs.get("filename"),
                kind="reading",
                file_index=kwargs.get("index"),
                file_total=kwargs.get("total"),
                stage="reading",
            )
        elif event == "ocr_fallback":
            set_progress(
                dataset_id,
                "Running OCR",
                filename=kwargs.get("filename"),
                kind="ocr",
                stage="reading",
            )
    return handler


# same as ingestion_pipeline.py, just scoped to one dataset and reporting progress as it goes.
# 'stage' collapses the play-by-play into the 3 states the frontend actually animates differently
def _run(dataset_id):
    try:
        data_dir = db.dataset_dir_for(dataset_id)
        collection_name = db.collection_name_for(dataset_id)

        all_documents = process_all_documents(
            str(data_dir), on_progress=_loader_progress(dataset_id)
        )

        set_progress(dataset_id, "Splitting everything into chunks...", stage="reading")
        chunks = chunking(all_documents)

        embedding_manager = EmbeddingManager()
        vector_db = VectorDB(collection_name=collection_name)

        existing_ids = vector_db.get_existing_ids()
        new_chunks = [c for c in chunks if make_doc_id(c) not in existing_ids]

        if new_chunks:
            set_progress(dataset_id, "Generating embeddings...", stage="embedding")
            texts = [d.page_content for d in new_chunks]
            embeddings = embedding_manager.embed_documents(texts)

            set_progress(dataset_id, "Saving to your dataset...", stage="embedding")
            vector_db.add_documents(new_chunks, embeddings)

        set_progress(dataset_id, "All set, opening your chat", done=True, stage="done")
    except QuotaExceededError:
        set_progress(
            dataset_id,
            "Something went wrong during ingestion.",
            done=True,
            error="Shit! You blew through your free embeddings quota, try again later.",
        )
    except Exception as e:
        set_progress(dataset_id, "Something went wrong during ingestion.", done=True, error=str(e))


# fire-and-forget: caller gets control back immediately, frontend polls
# progress.get_progress(dataset_id) for status
def start_ingestion(dataset_id):
    thread = threading.Thread(target=_run, args=(dataset_id,), daemon=True)
    thread.start()
    return thread
