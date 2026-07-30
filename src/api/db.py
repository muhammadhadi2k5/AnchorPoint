import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

# lives next to the doc cache and rate limit files, already gitignored via data/
DB_PATH = Path("data/anchorpoint.db")
DATASETS_DIR = Path("data/datasets")

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations TEXT,
    created_at TEXT NOT NULL
);
"""


def _now():
    return datetime.now(timezone.utc).isoformat()


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


# collection name is derived from the id rather than stored, one less
# thing that can drift out of sync with the id
def collection_name_for(dataset_id):
    return f"dataset_{dataset_id}"


# where a dataset's raw uploaded files live, isolated from every other
# dataset. doc_cache stays global/content-hashed on purpose, see document_loader.py
def dataset_dir_for(dataset_id):
    return DATASETS_DIR / dataset_id


def create_dataset(name):
    dataset_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO datasets (id, name, created_at) VALUES (?, ?, ?)",
            (dataset_id, name, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    dataset_dir_for(dataset_id).mkdir(parents=True, exist_ok=True)
    return get_dataset(dataset_id)


def list_datasets():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM datasets ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_dataset(dataset_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def add_message(dataset_id, role, content, citations=None):
    message_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO messages (id, dataset_id, role, content, citations, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                message_id,
                dataset_id,
                role,
                content,
                json.dumps(citations) if citations is not None else None,
                _now(),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_message(message_id)


def get_message(message_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ?", (message_id,)
        ).fetchone()
        return _deserialize_message(row) if row else None
    finally:
        conn.close()


def list_messages(dataset_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM messages WHERE dataset_id = ? ORDER BY created_at ASC",
            (dataset_id,),
        ).fetchall()
        return [_deserialize_message(row) for row in rows]
    finally:
        conn.close()


# clears the conversation without touching the dataset or its documents
def clear_messages(dataset_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM messages WHERE dataset_id = ?", (dataset_id,))
        conn.commit()
    finally:
        conn.close()


def _deserialize_message(row):
    message = dict(row)
    message["citations"] = json.loads(message["citations"]) if message["citations"] else None
    return message
