import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api import chat, db, ingest
from api.progress import clear_progress, get_progress
from rate_limit_guard import QuotaExceededError
from vector_db import delete_collection

db.init_db()

app = FastAPI(title="AnchorPoint API")

# security isn't a concern for this project (personal tool / shared demo
# link), so kept permissive rather than fighting CORS during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_dataset(dataset_id):
    dataset = db.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return dataset


def _save_files(dataset_id, files):
    dest_dir = db.dataset_dir_for(dataset_id)
    for uploaded in files:
        (dest_dir / uploaded.filename).write_bytes(uploaded.file.read())


class MessageIn(BaseModel):
    content: str


class DatasetUpdate(BaseModel):
    name: str | None = None
    pinned: bool | None = None


@app.post("/datasets")
def create_dataset(name: str = Form(...), files: list[UploadFile] = File(...)):
    dataset = db.create_dataset(name)
    _save_files(dataset["id"], files)
    ingest.start_ingestion(dataset["id"])
    return dataset


@app.get("/datasets")
def list_datasets():
    return db.list_datasets()


@app.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str):
    return _require_dataset(dataset_id)


@app.patch("/datasets/{dataset_id}")
def update_dataset(dataset_id: str, body: DatasetUpdate):
    _require_dataset(dataset_id)
    if body.name is not None:
        name = body.name.strip()
        if name:
            db.rename_dataset(dataset_id, name)
    if body.pinned is not None:
        db.set_pinned(dataset_id, body.pinned)
    return db.get_dataset(dataset_id)


@app.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str):
    _require_dataset(dataset_id)
    delete_collection(db.collection_name_for(dataset_id))
    db.delete_dataset(dataset_id)
    clear_progress(dataset_id)
    return {"status": "deleted"}


@app.get("/datasets/{dataset_id}/files")
def list_files(dataset_id: str):
    _require_dataset(dataset_id)
    files_dir = db.dataset_dir_for(dataset_id)
    return sorted(f.name for f in files_dir.iterdir() if f.is_file())


# adds more files to an existing dataset and re-runs ingestion, scoped to
# that dataset's own folder/collection. dedup in ingestion_pipeline's logic
# means already-embedded chunks won't be redone
@app.post("/datasets/{dataset_id}/documents")
def add_documents(dataset_id: str, files: list[UploadFile] = File(...)):
    _require_dataset(dataset_id)
    _save_files(dataset_id, files)
    ingest.start_ingestion(dataset_id)
    return {"status": "ingesting"}


# re-runs ingestion on the files already saved for this dataset, no new
# uploads needed. same dedup as add_documents means already-embedded chunks
# get skipped, so this just picks up whatever didn't make it in the first
# time (e.g. a run that died partway through on a quota error)
@app.post("/datasets/{dataset_id}/reingest")
def reingest_dataset(dataset_id: str):
    _require_dataset(dataset_id)
    ingest.start_ingestion(dataset_id)
    return {"status": "ingesting"}


@app.get("/datasets/{dataset_id}/ingest-status")
def ingest_status(dataset_id: str):
    _require_dataset(dataset_id)
    progress = get_progress(dataset_id)
    if progress is None:
        return {"message": None, "filename": None, "done": True, "error": None}
    return progress


@app.get("/datasets/{dataset_id}/messages")
def list_messages(dataset_id: str):
    _require_dataset(dataset_id)
    return db.list_messages(dataset_id)


@app.post("/datasets/{dataset_id}/messages")
def send_message(dataset_id: str, body: MessageIn):
    _require_dataset(dataset_id)
    stream = chat.ask(dataset_id, body.content)

    # errors from the guard/embedding call happen before the first token is
    # yielded, so peeking one chunk ahead lets a real error become a proper
    # HTTP status instead of a broken stream
    try:
        first_chunk = next(stream, "")
    except QuotaExceededError:
        raise HTTPException(status_code=429, detail="quota_exceeded")
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail="connection_error")

    def full_stream():
        yield first_chunk
        yield from stream

    return StreamingResponse(full_stream(), media_type="text/plain")


# resets the conversation without touching the dataset or its documents
@app.delete("/datasets/{dataset_id}/messages")
def clear_conversation(dataset_id: str):
    _require_dataset(dataset_id)
    db.clear_messages(dataset_id)
    return {"status": "cleared"}
