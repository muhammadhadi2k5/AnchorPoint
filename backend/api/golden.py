import threading

from models import db
from core.embedding_manager import EmbeddingManager
from evaluation.evaluator import Evaluator
from generation.llm_generator import Generator
from retrieval.retriever import Retriever
from core.vector_db import VectorDB


# runs strictly sequentially, not one thread per question - this already
# shares the same daily llm/embedding/eval guards as real traffic, so
# parallel bursts would just hit QuotaExceededError faster with no benefit
def _run_all(run_id, dataset_id):
    questions = db.list_golden_questions(dataset_id)
    vector_db = VectorDB(collection_name=db.collection_name_for(dataset_id))
    embedding_manager = EmbeddingManager()
    retriever = Retriever(vector_db, embedding_manager)
    generator = Generator()
    evaluator = Evaluator()

    for q in questions:
        try:
            # same retrieval + generation path chat.ask() uses, but nothing
            # here touches the real messages table - this is a dry run
            results = retriever.retrieve(q["question"], top_k=7, threshold=0.45)
            answer = "".join(generator.generate_answer(q["question"], results))

            correctness = evaluator.evaluate_answer_correctness(
                q["question"], q["expected_answer"], answer
            )
            recall = evaluator.context_recall(results, q["expected_sources"])

            db.add_golden_result(
                run_id,
                q["id"],
                q["question"],
                q["expected_answer"],
                generated_answer=answer,
                retrieved_chunks=[
                    {
                        "source_file": r["metadata"].get("source_file", "unknown"),
                        "page": r["metadata"].get("page"),
                        "score": round(float(r["score"]), 2),
                        "text": r["text"],
                    }
                    for r in results
                ],
                answer_correctness=correctness,
                context_recall=recall,
                status="complete",
            )
        except Exception as e:
            db.add_golden_result(
                run_id, q["id"], q["question"], q["expected_answer"], status="failed", error=str(e)
            )

    db.complete_golden_run(run_id)


# fire-and-forget, mirrors ingest.start_ingestion/evaluate.start_evaluation
def start_run(dataset_id):
    run = db.create_golden_run(dataset_id)
    thread = threading.Thread(target=_run_all, args=(run["id"], dataset_id), daemon=True)
    thread.start()
    return run
