import threading

from ingestion.document_loader import process_all_documents
from models import db


def _run(job_id):
    job_dir = db.parse_job_dir_for(job_id)
    try:
        documents = process_all_documents(str(job_dir))
        raw_text = "\n\n".join(doc.page_content for doc in documents)
        db.complete_parse_job(job_id, raw_text)
    except Exception as e:
        db.fail_parse_job(job_id, str(e))


def start_parse_job(job_id):
    thread = threading.Thread(target=_run, args=(job_id,), daemon=True)
    thread.start()
    return thread
