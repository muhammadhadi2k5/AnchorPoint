import threading

from ingestion.document_loader import process_all_documents
from core.rate_limit_guard import QuotaExceededError
from models import db
from parsing.markdown_formatter import MarkdownFormatter


def _run(job_id):
    job_dir = db.parse_job_dir_for(job_id)
    try:
        documents = process_all_documents(str(job_dir))
        raw_text = "\n\n".join(doc.page_content for doc in documents)
        markdown = MarkdownFormatter().format(raw_text)
        db.complete_parse_job(job_id, markdown)
    except QuotaExceededError:
        db.fail_parse_job(job_id, "Blew through the free quota, try again in a bit.")
    except Exception as e:
        db.fail_parse_job(job_id, str(e))


# fire-and-forget, same shape as ingest.start_ingestion
def start_parse_job(job_id):
    thread = threading.Thread(target=_run, args=(job_id,), daemon=True)
    thread.start()
    return thread
