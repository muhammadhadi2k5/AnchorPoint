import { useEffect, useState } from 'react'
import { getEvaluationsSummary, listEvaluations } from '../lib/api.js'
import { LIVE_METRICS } from '../lib/evalMetricInfo.js'
import EvaluationDetail from './EvaluationDetail.jsx'
import GoldenTestPanel from './GoldenTestPanel.jsx'
import InfoTooltip from './InfoTooltip.jsx'
import './EvaluationDashboard.css'

const POLL_MS = 3000

function scoreTier(score) {
  if (score === null || score === undefined) return 'muted'
  if (score >= 4) return 'good'
  if (score === 3) return 'mid'
  return 'bad'
}

function ScoreBadge({ label, score }) {
  return <span className={`eval-score-badge tier-${scoreTier(score)}`}>{label} {score ?? '—'}</span>
}

function LiveTab({ datasetId, onSelectEvaluation }) {
  const [summary, setSummary] = useState(null)
  const [evaluations, setEvaluations] = useState([])

  // polls only while something is still being scored, same recursive
  // setTimeout + cancelled-flag pattern IngestionLoadingView already uses
  useEffect(() => {
    let cancelled = false
    let timeoutId

    const poll = async () => {
      try {
        const [nextSummary, nextEvaluations] = await Promise.all([
          getEvaluationsSummary(datasetId),
          listEvaluations(datasetId),
        ])
        if (cancelled) return
        setSummary(nextSummary)
        setEvaluations(nextEvaluations)
        if (nextEvaluations.some((e) => e.status === 'pending')) {
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

  return (
    <div className="eval-tab">
      <div className="eval-stats">
        {LIVE_METRICS.map((metric) => (
          <div className="eval-stat-tile" key={metric.key}>
            <span className="eval-stat-label">
              {metric.label}
              <InfoTooltip text={metric.description} />
            </span>
            <span className="eval-stat-value">
              {summary?.averages?.[metric.key] ?? '—'}
              <span className="eval-stat-max">/5</span>
            </span>
          </div>
        ))}
      </div>

      {summary && summary.total > 0 && (
        <div className="eval-status-pills">
          <span className="eval-status-pill complete">{summary.complete} complete</span>
          {summary.pending > 0 && <span className="eval-status-pill pending">{summary.pending} pending</span>}
          {summary.failed > 0 && <span className="eval-status-pill failed">{summary.failed} failed</span>}
        </div>
      )}

      {evaluations.length === 0 ? (
        <p className="eval-empty">
          No evaluations yet. Every new message you send in this chat gets scored automatically.
        </p>
      ) : (
        <ul className="eval-list">
          {evaluations.map((evaluation) => (
            <li key={evaluation.id}>
              <button type="button" className="eval-row" onClick={() => onSelectEvaluation(evaluation)}>
                <span className={`eval-row-status status-${evaluation.status}`}>{evaluation.status}</span>
                <span className="eval-row-question">{evaluation.question}</span>
                <span className="eval-row-scores">
                  {LIVE_METRICS.map((metric) => (
                    <ScoreBadge key={metric.key} label={metric.shortLabel} score={evaluation[metric.scoreField]} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function EvaluationDashboard({ datasetId, onClose }) {
  const [tab, setTab] = useState('live')
  const [selectedEvaluation, setSelectedEvaluation] = useState(null)

  return (
    <>
      <div className="eval-backdrop" onClick={onClose} />
      <div className="eval-panel" role="dialog" aria-label="Evaluations">
        <div className="eval-header">
          <span>Evaluations</span>
          <button type="button" className="eval-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="eval-tabs">
          <button
            type="button"
            className={`eval-tab-btn${tab === 'live' ? ' active' : ''}`}
            onClick={() => setTab('live')}
          >
            Live
          </button>
          <button
            type="button"
            className={`eval-tab-btn${tab === 'testset' ? ' active' : ''}`}
            onClick={() => setTab('testset')}
          >
            Test set
          </button>
        </div>

        {tab === 'live' && <LiveTab datasetId={datasetId} onSelectEvaluation={setSelectedEvaluation} />}
        {tab === 'testset' && <GoldenTestPanel datasetId={datasetId} />}
      </div>

      {selectedEvaluation && (
        <EvaluationDetail evaluation={selectedEvaluation} onClose={() => setSelectedEvaluation(null)} />
      )}
    </>
  )
}