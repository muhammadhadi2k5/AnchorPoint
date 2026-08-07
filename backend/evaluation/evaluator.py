import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

from core.rate_limit_guard import raise_on_quota_exceeded

load_dotenv()

MODEL_NAME = "gemini-3.5-flash-lite"  # same model Generator uses - no new model to wire in


class MetricScore(BaseModel):
    score: int = Field(description="Integer from 1 (worst) to 5 (best)")
    reasoning: str = Field(description="One or two sentence justification for the score")


# Live tab - scored on the real retrieved context + real generated answer,
# no known-correct answer needed (see evaluate() below for why that works)
class FullEvalResult(BaseModel):
    faithfulness: MetricScore
    answer_relevance: MetricScore
    context_relevance: MetricScore


class RelevanceOnlyResult(BaseModel):
    answer_relevance: MetricScore


# Test Set tab - scored against a known-correct answer the user supplied
class AnswerCorrectnessResult(BaseModel):
    score: int = Field(description="Integer from 1 (worst) to 5 (best)")
    reasoning: str = Field(description="One or two sentence justification for the score")


JUDGE_SYSTEM_INSTRUCTION = (
    "You are a strict, impartial evaluator judging one question-answering exchange from a RAG "
    "system: a question, the context retrieved for it, and the answer generated from that "
    "context. Score three metrics, each an integer 1 (worst) to 5 (best). Use the full range.\n\n"
    "1. faithfulness: is every claim in the answer grounded in the retrieved context? Penalize "
    "anything not supported by the context, even if true in reality.\n\n"
    "2. answer_relevance: does the answer address the question, regardless of factual accuracy?\n\n"
    "3. context_relevance: is the retrieved context on the same subject as the question, not "
    "whether it contains the full answer. Score high if the chunks are about the right subject "
    "but simply don't state one detail the question wants (a date, a name, a comparison) - "
    "that's a gap in the source material, not a retrieval failure, and a correct 'the documents "
    "don't say' answer is not evidence of bad retrieval either. Score low only when the chunks "
    "are about a different subject than the question is actually asking about.\n\n"
    "Respond with an integer score and a one-sentence reasoning per metric, JSON only."
)

JUDGE_SYSTEM_INSTRUCTION_NO_CONTEXT = (
    "You are a strict, impartial evaluator judging a single question-answering exchange from "
    "a RAG system where retrieval found NO relevant context for the user's question. Score "
    "only answer_relevance, from 1 (worst) to 5 (best): a correct answer here honestly tells "
    "the user nothing relevant was found rather than guessing or making something up - that "
    "should score well. An answer that fabricates something or ignores the question should "
    "score low. Give an integer score and a one or two sentence reasoning. Respond only with "
    "the requested JSON structure."
)

CORRECTNESS_SYSTEM_INSTRUCTION = (
    "You are a strict, impartial evaluator comparing a generated answer against a known-correct "
    "reference answer for the same question. Score answer_correctness from 1 (worst) to 5 (best): "
    "judge whether the generated answer conveys the same correct information as the reference "
    "answer, not whether it's worded the same way - a paraphrase that captures the same facts "
    "should score well, a fluent answer that gets the facts wrong should score low. Give an "
    "integer score and a one or two sentence reasoning. Respond only with the requested JSON "
    "structure."
)


class Evaluator:

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")

        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60000),
        )

    # same labeling scheme as Generator._format_context, so the judge sees
    # exactly what the answering model saw
    def _format_context(self, results):
        parts = []
        for i, result in enumerate(results, start=1):
            source = result["metadata"].get("source_file", "unknown")
            parts.append(f"[Source {i}: {source}]\n{result['text']}")
        return "\n\n".join(parts)

    def _generate_json(self, prompt, system_instruction, schema):
        try:
            response = self.client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )
            return response.parsed
        except errors.APIError as e:
            # separate name from "llm" on purpose, just so a 429 from a
            # background eval call reads differently in logs/errors than one
            # from a real chat answer
            raise_on_quota_exceeded(e, "eval")

    # Live tab - query: the user's question, results: same shape
    # Retriever.retrieve() returns (may be []), answer: the full assistant
    # answer text. always returns all three keys; faithfulness/
    # context_relevance are None (not a bad score) when there was no
    # retrieved context to judge them against
    def evaluate(self, query, results, answer):
        if results:
            prompt = (
                f"Question: {query}\n\n"
                f"Retrieved context:\n{self._format_context(results)}\n\n"
                f"Answer given: {answer}"
            )
            parsed: FullEvalResult = self._generate_json(prompt, JUDGE_SYSTEM_INSTRUCTION, FullEvalResult)
            return {
                "faithfulness": parsed.faithfulness.model_dump(),
                "answer_relevance": parsed.answer_relevance.model_dump(),
                "context_relevance": parsed.context_relevance.model_dump(),
            }
        else:
            prompt = f"Question: {query}\n\nAnswer given: {answer}"
            parsed: RelevanceOnlyResult = self._generate_json(
                prompt, JUDGE_SYSTEM_INSTRUCTION_NO_CONTEXT, RelevanceOnlyResult
            )
            return {
                "faithfulness": None,
                "answer_relevance": parsed.answer_relevance.model_dump(),
                "context_relevance": None,
            }

    # Test Set tab - compares the generated answer against a known-correct
    # expected_answer the user supplied
    def evaluate_answer_correctness(self, query, expected_answer, generated_answer):
        prompt = (
            f"Question: {query}\n\n"
            f"Reference answer: {expected_answer}\n\n"
            f"Generated answer: {generated_answer}"
        )
        parsed: AnswerCorrectnessResult = self._generate_json(
            prompt, CORRECTNESS_SYSTEM_INSTRUCTION, AnswerCorrectnessResult
        )
        return parsed.model_dump()

    # Test Set tab - deterministic, no LLM call: "was file X among the
    # retrieved chunks" is a plain fact, not a judgment call. None (not
    # applicable) when the user didn't specify which file the answer should
    # come from
    def context_recall(self, results, expected_sources):
        if not expected_sources:
            return None
        retrieved_sources = {r["metadata"].get("source_file") for r in results}
        matched = len(retrieved_sources & set(expected_sources))
        total = len(expected_sources)
        return {
            "score": round(1 + 4 * matched / total),
            "reasoning": f"{matched}/{total} expected source file(s) were actually retrieved",
        }
