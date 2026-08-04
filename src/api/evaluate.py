import threading

from api import db
from evaluator import Evaluator
from rate_limit_guard import QuotaExceededError


def _run(evaluation_id, query, results, answer):
    try:
        evaluator = Evaluator()
        scores = evaluator.evaluate(query, results, answer)
        db.complete_evaluation(
            evaluation_id,
            faithfulness=scores["faithfulness"],
            answer_relevance=scores["answer_relevance"],
            context_relevance=scores["context_relevance"],
        )
    except QuotaExceededError as e:
        db.fail_evaluation(evaluation_id, str(e))
    except Exception as e:
        db.fail_evaluation(evaluation_id, str(e))


# fire-and-forget, mirrors ingest.start_ingestion: caller gets control back
# immediately, the dashboard reads status via the evaluations endpoints
# instead of a dedicated progress poll (the row itself carries status)
def start_evaluation(dataset_id, message_id, query, results, answer, citations):
    evaluation = db.create_evaluation(dataset_id, message_id, query, answer, citations)
    thread = threading.Thread(
        target=_run, args=(evaluation["id"], query, results, answer), daemon=True
    )
    thread.start()
    return evaluation
