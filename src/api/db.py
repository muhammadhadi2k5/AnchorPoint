import json
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

# anchored to the project root via this file's own location rather than a
# relative path, so it lands in the same data/ the CLI scripts use regardless
# of whatever directory the API server happens to be launched from
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = _PROJECT_ROOT / "data" / "anchorpoint.db"
DATASETS_DIR = _PROJECT_ROOT / "data" / "datasets"

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0
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
        _ensure_column(conn, "datasets", "pinned", "INTEGER NOT NULL DEFAULT 0")
        # one-time cleanup for databases created back when there was a login
        # system - everyone shares the same datasets now, so there's nothing
        # left to scope them by
        _drop_column_if_exists(conn, "datasets", "visitor_id")
        conn.execute("DROP TABLE IF EXISTS sessions")
        conn.execute("DROP TABLE IF EXISTS verification_codes")
        conn.execute("DROP TABLE IF EXISTS users")
        conn.commit()
    finally:
        conn.close()


# lets older databases (created before a column existed) pick it up without
# needing a real migration system for a single-user project
def _ensure_column(conn, table, column, definition):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _drop_column_if_exists(conn, table, column):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column in existing:
        conn.execute(f"ALTER TABLE {table} DROP COLUMN {column}")


# collection name is derived from the id rather than stored, one less
# thing that can drift out of sync with the id
def collection_name_for(dataset_id):
    return f"dataset_{dataset_id}"


# where a dataset's raw uploaded files live, isolated from every other
# dataset. doc_cache stays global/content-hashed on purpose, see document_loader.py
def dataset_dir_for(dataset_id):
    return DATASETS_DIR / dataset_id


# no per-visitor scoping - one shared list of datasets for whoever opens the app
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
            "SELECT * FROM datasets ORDER BY pinned DESC, created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def rename_dataset(dataset_id, name):
    conn = get_connection()
    try:
        conn.execute("UPDATE datasets SET name = ? WHERE id = ?", (name, dataset_id))
        conn.commit()
    finally:
        conn.close()
    return get_dataset(dataset_id)


def set_pinned(dataset_id, pinned):
    conn = get_connection()
    try:
        conn.execute("UPDATE datasets SET pinned = ? WHERE id = ?", (1 if pinned else 0, dataset_id))
        conn.commit()
    finally:
        conn.close()
    return get_dataset(dataset_id)


# removes the dataset's row, its messages, and its on-disk files. the
# caller is responsible for dropping the matching qdrant collection, since
# that lives outside sqlite
def delete_dataset(dataset_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM messages WHERE dataset_id = ?", (dataset_id,))
        conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()
    finally:
        conn.close()
    shutil.rmtree(dataset_dir_for(dataset_id), ignore_errors=True)


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
