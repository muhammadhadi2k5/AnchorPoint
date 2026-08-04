import { useEffect, useState } from 'react'
import {
  createGoldenQuestion,
  deleteGoldenQuestion,
  listGoldenQuestions,
  listGoldenRuns,
  startGoldenRun,
} from '../api.js'
import GoldenRunDetail from './GoldenRunDetail.jsx'

const POLL_MS = 3000

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function GoldenTestPanel({ datasetId }) {
  const [questions, setQuestions] = useState([])
  const [runs, setRuns] = useState([])
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [starting, setStarting] = useState(false)
  const [form, setForm] = useState({ question: '', expectedAnswer: '', expectedSources: '' })

  useEffect(() => {
    listGoldenQuestions(datasetId).then(setQuestions)
  }, [datasetId])

  // polls only while a run is still in progress, same pattern as the Live tab
  useEffect(() => {
    let cancelled = false
    let timeoutId

    const poll = async () => {
      try {
        const nextRuns = await listGoldenRuns(datasetId)
        if (cancelled) return
        setRuns(nextRuns)
        if (nextRuns.some((r) => r.status === 'running')) {
          timeoutId = setTimeout(poll, POLL_MS)
        }
      } catch {
        if (!cancelled) timeoutId = setTimeout(poll, POLL_MS)
      }
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [datasetId])

  const handleAddQuestion = async (event) => {
    event.preventDefault()
    const question = form.question.trim()
    const expectedAnswer = form.expectedAnswer.trim()
    if (!question || !expectedAnswer) return

    const expectedSources = form.expectedSources
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const created = await createGoldenQuestion(datasetId, {
      question,
      expectedAnswer,
      expectedSources: expectedSources.length > 0 ? expectedSources : null,
    })
    setQuestions((current) => [...current, created])
    setForm({ question: '', expectedAnswer: '', expectedSources: '' })
  }

  const handleDeleteQuestion = async (questionId) => {
    await deleteGoldenQuestion(datasetId, questionId)
    setQuestions((current) => current.filter((q) => q.id !== questionId))
  }

  const handleRun = async () => {
    setStarting(true)
    try {
      await startGoldenRun(datasetId)
      setRuns(await listGoldenRuns(datasetId))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="eval-tab">
      <div className="golden-section">
        <span className="golden-section-title">Saved questions</span>

        {questions.length === 0 ? (
          <p className="eval-empty">No questions yet. Add one below to start building a test set.</p>
        ) : (
          <ul className="golden-question-list">
            {questions.map((q) => (
              <li key={q.id} className="golden-question-row">
                <div className="golden-question-text">
                  <span className="golden-question-q">{q.question}</span>
                  <span className="golden-question-a">{q.expected_answer}</span>
                </div>
                <button
                  type="button"
                  className="golden-question-delete"
                  onClick={() => handleDeleteQuestion(q.id)}
                  aria-label="Delete question"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="golden-add-form" onSubmit={handleAddQuestion}>
          <input
            className="golden-input"
            placeholder="Question"
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          />
          <input
            className="golden-input"
            placeholder="Expected answer"
            value={form.expectedAnswer}
            onChange={(e) => setForm((f) => ({ ...f, expectedAnswer: e.target.value }))}
          />
          <input
            className="golden-input"
            placeholder="Expected source file(s), comma-separated (optional)"
            value={form.expectedSources}
            onChange={(e) => setForm((f) => ({ ...f, expectedSources: e.target.value }))}
          />
          <button type="submit" className="golden-add-button">Add question</button>
        </form>
      </div>

      <div className="golden-section">
        <div className="golden-run-control">
          <button
            type="button"
            className="golden-run-button"
            onClick={handleRun}
            disabled={questions.length === 0 || starting}
          >
            {starting ? 'Starting…' : 'Run test set'}
          </button>
        </div>
      </div>

      <div className="golden-section">
        <span className="golden-section-title">Run history</span>
        {runs.length === 0 ? (
          <p className="eval-empty">No runs yet.</p>
        ) : (
          <ul className="golden-run-list">
            {runs.map((run) => (
              <li key={run.id}>
                <button type="button" className="golden-run-row" onClick={() => setSelectedRunId(run.id)}>
                  <span className={`golden-run-status status-${run.status}`}>{run.status}</span>
                  <span className="golden-run-pass-rate">
                    {run.passed_questions}/{run.total_questions} passed
                  </span>
                  <span className="golden-run-time">{formatTimestamp(run.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedRunId && (
        <GoldenRunDetail datasetId={datasetId} runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      )}
    </div>
  )
}
