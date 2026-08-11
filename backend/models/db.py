import json
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

# anchored to this file's own location, not a relative path, so it lands in the same data/
# the CLI uses no matter where the API server gets launched from
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = _PROJECT_ROOT / "data" / "anchorpoint.db"
DATASETS_DIR = _PROJECT_ROOT / "data" / "datasets"
PARSE_JOBS_DIR = _PROJECT_ROOT / "data" / "parse_jobs"

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

-- Live tab, one row per real message, scored in the background (api/evaluate.py). denormalized
-- onto the row on purpose so the dashboard is a single table read, no joins
CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    message_id TEXT NOT NULL UNIQUE REFERENCES messages(id),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    citations TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')) DEFAULT 'pending',
    faithfulness_score INTEGER,
    faithfulness_reasoning TEXT,
    answer_relevance_score INTEGER,
    answer_relevance_reasoning TEXT,
    context_relevance_score INTEGER,
    context_relevance_reasoning TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_evaluations_dataset_created
    ON evaluations(dataset_id, created_at DESC);

-- Test Set tab: a small set of known-answer questions per dataset, run
-- on demand (see api/golden.py) rather than automatically
CREATE TABLE IF NOT EXISTS golden_questions (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    question TEXT NOT NULL,
    expected_answer TEXT NOT NULL,
    expected_sources TEXT,
    created_at TEXT NOT NULL
);

-- one row per "Run test set" click, kept separate rather than overwritten so "did tuning
-- top_k actually help" is answerable from run history
CREATE TABLE IF NOT EXISTS golden_runs (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    status TEXT NOT NULL CHECK (status IN ('running', 'complete')) DEFAULT 'running',
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS golden_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES golden_runs(id),
    question_id TEXT NOT NULL REFERENCES golden_questions(id),
    question TEXT NOT NULL,
    expected_answer TEXT NOT NULL,
    generated_answer TEXT,
    retrieved_chunks TEXT,
    answer_correctness_score INTEGER,
    answer_correctness_reasoning TEXT,
    context_recall_score INTEGER,
    context_recall_reasoning TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')) DEFAULT 'pending',
    error TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_golden_results_run ON golden_results(run_id);

-- one row per uploaded file run through Parse, independent of any dataset. markdown holds
-- the LLM-restructured result, raw text/json views are derived from the doc cache on read
CREATE TABLE IF NOT EXISTS parse_jobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')) DEFAULT 'pending',
    markdown TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
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
        # leftover cleanup from when there used to be a login system, everyone shares
        # datasets now so there's nothing left to scope by visitor
        _drop_column_if_exists(conn, "datasets", "visitor_id")
        conn.execute("DROP TABLE IF EXISTS sessions")
        conn.execute("DROP TABLE IF EXISTS verification_codes")
        conn.execute("DROP TABLE IF EXISTS users")
        # a golden run's thread can't survive a server restart, any row still 'running' at
        # startup means its owner is gone, without this it'd show "running" forever
        conn.execute(
            "UPDATE golden_runs SET status = 'complete', completed_at = ? WHERE status = 'running'",
            (_now(),),
        )
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


# caller still has to drop the qdrant collection separately, outside sqlite's reach. eval
# tables have no ON DELETE CASCADE so they're cleared child-to-parent first or this raises IntegrityError
def delete_dataset(dataset_id):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM golden_results WHERE run_id IN "
            "(SELECT id FROM golden_runs WHERE dataset_id = ?)",
            (dataset_id,),
        )
        conn.execute("DELETE FROM golden_runs WHERE dataset_id = ?", (dataset_id,))
        conn.execute("DELETE FROM golden_questions WHERE dataset_id = ?", (dataset_id,))
        conn.execute("DELETE FROM evaluations WHERE dataset_id = ?", (dataset_id,))
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


# evaluations reference messages with no ON DELETE CASCADE, so they go first or this hits
# the same IntegrityError delete_dataset had to work around
def clear_messages(dataset_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM evaluations WHERE dataset_id = ?", (dataset_id,))
        conn.execute("DELETE FROM messages WHERE dataset_id = ?", (dataset_id,))
        conn.commit()
    finally:
        conn.close()


def _deserialize_message(row):
    message = dict(row)
    message["citations"] = json.loads(message["citations"]) if message["citations"] else None
    return message


# --- Live tab (automatic per-message evaluation) ---

def create_evaluation(dataset_id, message_id, question, answer, citations=None):
    evaluation_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO evaluations
               (id, dataset_id, message_id, question, answer, citations, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (
                evaluation_id,
                dataset_id,
                message_id,
                question,
                answer,
                json.dumps(citations) if citations is not None else None,
                _now(),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_evaluation(evaluation_id)


def complete_evaluation(evaluation_id, faithfulness, answer_relevance, context_relevance):
    conn = get_connection()
    try:
        conn.execute(
            """UPDATE evaluations SET
                 status = 'complete',
                 faithfulness_score = ?, faithfulness_reasoning = ?,
                 answer_relevance_score = ?, answer_relevance_reasoning = ?,
                 context_relevance_score = ?, context_relevance_reasoning = ?,
                 completed_at = ?
               WHERE id = ?""",
            (
                faithfulness["score"] if faithfulness else None,
                faithfulness["reasoning"] if faithfulness else None,
                answer_relevance["score"],
                answer_relevance["reasoning"],
                context_relevance["score"] if context_relevance else None,
                context_relevance["reasoning"] if context_relevance else None,
                _now(),
                evaluation_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def fail_evaluation(evaluation_id, error):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE evaluations SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
            (str(error), _now(), evaluation_id),
        )
        conn.commit()
    finally:
        conn.close()


# not called by the UI right now (the dashboard already has the full row from
# list_evaluations), kept for a plausible future feature like a shareable
# single-evaluation link
def get_evaluation(evaluation_id):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM evaluations WHERE id = ?", (evaluation_id,)).fetchone()
        return _deserialize_evaluation(row) if row else None
    finally:
        conn.close()


def list_evaluations(dataset_id, limit=50, offset=0):
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM evaluations WHERE dataset_id = ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (dataset_id, limit, offset),
        ).fetchall()
        return [_deserialize_evaluation(row) for row in rows]
    finally:
        conn.close()


def get_evaluation_summary(dataset_id):
    conn = get_connection()
    try:
        counts = {
            row["status"]: row["n"]
            for row in conn.execute(
                "SELECT status, COUNT(*) as n FROM evaluations WHERE dataset_id = ? GROUP BY status",
                (dataset_id,),
            )
        }
        avg = conn.execute(
            """SELECT AVG(faithfulness_score) AS faithfulness,
                      AVG(answer_relevance_score) AS answer_relevance,
                      AVG(context_relevance_score) AS context_relevance
               FROM evaluations WHERE dataset_id = ? AND status = 'complete'""",
            (dataset_id,),
        ).fetchone()
        return {
            "total": sum(counts.values()),
            "pending": counts.get("pending", 0),
            "complete": counts.get("complete", 0),
            "failed": counts.get("failed", 0),
            "averages": {
                key: (round(avg[key], 2) if avg[key] is not None else None)
                for key in ("faithfulness", "answer_relevance", "context_relevance")
            },
        }
    finally:
        conn.close()


def _deserialize_evaluation(row):
    evaluation = dict(row)
    evaluation["citations"] = json.loads(evaluation["citations"]) if evaluation["citations"] else None
    return evaluation


# --- Test Set tab (on-demand golden-answer evaluation) ---

def create_golden_question(dataset_id, question, expected_answer, expected_sources=None):
    question_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO golden_questions
               (id, dataset_id, question, expected_answer, expected_sources, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                question_id,
                dataset_id,
                question,
                expected_answer,
                json.dumps(expected_sources) if expected_sources else None,
                _now(),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_golden_question(question_id)


def get_golden_question(question_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM golden_questions WHERE id = ?", (question_id,)
        ).fetchone()
        return _deserialize_golden_question(row) if row else None
    finally:
        conn.close()


def list_golden_questions(dataset_id):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM golden_questions WHERE dataset_id = ? ORDER BY created_at ASC",
            (dataset_id,),
        ).fetchall()
        return [_deserialize_golden_question(row) for row in rows]
    finally:
        conn.close()


# golden_results has no ON DELETE CASCADE either, a question that's already been run needs
# its results cleared first, same FK issue as delete_dataset/clear_messages above
def delete_golden_question(question_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM golden_results WHERE question_id = ?", (question_id,))
        conn.execute("DELETE FROM golden_questions WHERE id = ?", (question_id,))
        conn.commit()
    finally:
        conn.close()


def _deserialize_golden_question(row):
    question = dict(row)
    question["expected_sources"] = (
        json.loads(question["expected_sources"]) if question["expected_sources"] else None
    )
    return question


def create_golden_run(dataset_id):
    run_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO golden_runs (id, dataset_id, status, created_at) VALUES (?, ?, 'running', ?)",
            (run_id, dataset_id, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    return get_golden_run(run_id)


def complete_golden_run(run_id):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE golden_runs SET status = 'complete', completed_at = ? WHERE id = ?",
            (_now(), run_id),
        )
        conn.commit()
    finally:
        conn.close()


def add_golden_result(
    run_id,
    question_id,
    question,
    expected_answer,
    generated_answer=None,
    retrieved_chunks=None,
    answer_correctness=None,
    context_recall=None,
    status="complete",
    error=None,
):
    result_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO golden_results
               (id, run_id, question_id, question, expected_answer, generated_answer,
                retrieved_chunks, answer_correctness_score, answer_correctness_reasoning,
                context_recall_score, context_recall_reasoning, status, error, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                result_id,
                run_id,
                question_id,
                question,
                expected_answer,
                generated_answer,
                json.dumps(retrieved_chunks) if retrieved_chunks is not None else None,
                answer_correctness["score"] if answer_correctness else None,
                answer_correctness["reasoning"] if answer_correctness else None,
                context_recall["score"] if context_recall else None,
                context_recall["reasoning"] if context_recall else None,
                status,
                error,
                _now(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


# pass-rate computed here (score >= 4 counts as a pass, same tier as the Live tab badges) so
# run history doesn't need a second round-trip per run just to show "4/5 passed"
def list_golden_runs(dataset_id):
    conn = get_connection()
    try:
        runs = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM golden_runs WHERE dataset_id = ? ORDER BY created_at DESC",
                (dataset_id,),
            )
        ]
        for run in runs:
            counts = conn.execute(
                """SELECT COUNT(*) AS total,
                          SUM(CASE WHEN answer_correctness_score >= 4 THEN 1 ELSE 0 END) AS passed
                   FROM golden_results WHERE run_id = ?""",
                (run["id"],),
            ).fetchone()
            run["total_questions"] = counts["total"] or 0
            run["passed_questions"] = counts["passed"] or 0
        return runs
    finally:
        conn.close()


def get_golden_run(run_id):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM golden_runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            return None
        run = dict(row)
        results = conn.execute(
            "SELECT * FROM golden_results WHERE run_id = ? ORDER BY created_at ASC",
            (run_id,),
        ).fetchall()
        run["results"] = [_deserialize_golden_result(r) for r in results]
        return run
    finally:
        conn.close()


# golden_results references the run by id with no ON DELETE CASCADE, same
# pattern as every other delete function in this file
def delete_golden_run(run_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM golden_results WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM golden_runs WHERE id = ?", (run_id,))
        conn.commit()
    finally:
        conn.close()


def clear_golden_runs(dataset_id):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM golden_results WHERE run_id IN "
            "(SELECT id FROM golden_runs WHERE dataset_id = ?)",
            (dataset_id,),
        )
        conn.execute("DELETE FROM golden_runs WHERE dataset_id = ?", (dataset_id,))
        conn.commit()
    finally:
        conn.close()


def _deserialize_golden_result(row):
    result = dict(row)
    result["retrieved_chunks"] = (
        json.loads(result["retrieved_chunks"]) if result["retrieved_chunks"] else None
    )
    return result


# --- Parse (standalone document parsing, independent of any dataset) ---

# where a parse job's uploaded file lives, isolated from every other job and from
# dataset storage entirely - a job never needs a dataset to exist
def parse_job_dir_for(job_id):
    return PARSE_JOBS_DIR / job_id


def create_parse_job(filename):
    job_id = uuid.uuid4().hex
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO parse_jobs (id, filename, status, created_at) VALUES (?, ?, 'pending', ?)",
            (job_id, filename, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    parse_job_dir_for(job_id).mkdir(parents=True, exist_ok=True)
    return get_parse_job(job_id)


def get_parse_job(job_id):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM parse_jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_parse_jobs():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM parse_jobs ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def complete_parse_job(job_id, markdown):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE parse_jobs SET status = 'complete', markdown = ?, completed_at = ? WHERE id = ?",
            (markdown, _now(), job_id),
        )
        conn.commit()
    finally:
        conn.close()


def fail_parse_job(job_id, error):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE parse_jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
            (str(error), _now(), job_id),
        )
        conn.commit()
    finally:
        conn.close()


def retry_parse_job(job_id):
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE parse_jobs SET status = 'pending', error = NULL, completed_at = NULL WHERE id = ?",
            (job_id,),
        )
        conn.commit()
    finally:
        conn.close()


def delete_parse_job(job_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM parse_jobs WHERE id = ?", (job_id,))
        conn.commit()
    finally:
        conn.close()
    shutil.rmtree(parse_job_dir_for(job_id), ignore_errors=True)
