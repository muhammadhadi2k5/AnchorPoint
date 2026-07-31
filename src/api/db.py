import json
import secrets
import shutil
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
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
    visitor_id TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- shared by email verification and password reset - one 6-digit code per
-- purpose, short-lived, single-use
CREATE TABLE IF NOT EXISTS verification_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
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
        _ensure_column(conn, "users", "email_verified", "INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    finally:
        conn.close()


# lets older databases (created before a column existed) pick it up without
# needing a real migration system for a single-user project
def _ensure_column(conn, table, column, definition):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


# collection name is derived from the id rather than stored, one less
# thing that can drift out of sync with the id
def collection_name_for(dataset_id):
    return f"dataset_{dataset_id}"


# where a dataset's raw uploaded files live, isolated from every other
# dataset. doc_cache stays global/content-hashed on purpose, see document_loader.py
def dataset_dir_for(dataset_id):
    return DATASETS_DIR / dataset_id


# visitor_id is just an anonymous id dropped in the visitor's browser
# (cookie/localStorage), not real auth - enough to keep strangers' dataset
# lists from showing up in each other's sidebar on a shared deploy
def create_dataset(name, visitor_id):
    dataset_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO datasets (id, name, visitor_id, created_at) VALUES (?, ?, ?, ?)",
            (dataset_id, name, visitor_id, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    dataset_dir_for(dataset_id).mkdir(parents=True, exist_ok=True)
    return get_dataset(dataset_id)


def list_datasets(visitor_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM datasets WHERE visitor_id = ? ORDER BY pinned DESC, created_at DESC",
            (visitor_id,),
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


def create_user(email, password_hash):
    user_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, email, password_hash, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    return get_user(user_id)


def get_user(user_id):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_email(email):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_session(user_id, ttl_days=30):
    session_id = uuid.uuid4().hex
    expires_at = (datetime.now(timezone.utc) + timedelta(days=ttl_days)).isoformat()
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (session_id, user_id, _now(), expires_at),
        )
        conn.commit()
    finally:
        conn.close()
    return session_id


# returns None for a missing OR expired session, so callers don't need to
# separately check expiry - an expired session just looks logged-out
def get_session_user_id(session_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        return None
    return row["user_id"]


def delete_session(session_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
    finally:
        conn.close()


# datasets created before login are scoped under the anonymous visitor
# cookie id - on signup/login, hand those over to the real account so they
# don't get stranded under an id the browser will stop sending once a real
# session cookie takes over
def claim_datasets(old_visitor_id, user_id):
    if not old_visitor_id or old_visitor_id == user_id:
        return
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE datasets SET visitor_id = ? WHERE visitor_id = ?",
            (user_id, old_visitor_id),
        )
        conn.commit()
    finally:
        conn.close()


def mark_email_verified(user_id):
    conn = get_connection()
    try:
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()


def update_password(user_id, password_hash):
    conn = get_connection()
    try:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        conn.commit()
    finally:
        conn.close()


# invalidates any still-unused codes for the same user+purpose first, so a
# resend can't leave multiple valid codes floating around at once
def create_verification_code(user_id, purpose, ttl_minutes=15):
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)).isoformat()
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE verification_codes SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0",
            (user_id, purpose),
        )
        conn.execute(
            """INSERT INTO verification_codes (id, user_id, purpose, code, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (uuid.uuid4().hex, user_id, purpose, code, _now(), expires_at),
        )
        conn.commit()
    finally:
        conn.close()
    return code


# checks the code and, if valid, consumes it in the same call - a code can
# only ever be used once
def consume_verification_code(user_id, purpose, code):
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT id, expires_at FROM verification_codes
               WHERE user_id = ? AND purpose = ? AND code = ? AND used = 0
               ORDER BY created_at DESC LIMIT 1""",
            (user_id, purpose, code),
        ).fetchone()
        if not row:
            return False
        if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
            return False
        conn.execute("UPDATE verification_codes SET used = 1 WHERE id = ?", (row["id"],))
        conn.commit()
        return True
    finally:
        conn.close()
