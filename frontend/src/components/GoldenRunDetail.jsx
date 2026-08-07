import { useEffect, useState } from 'react'
import { getGoldenRun } from '../lib/api.js'
import { TESTSET_METRICS } from '../lib/evalMetricInfo.js'
import './GoldenRunDetail.css'

function scoreTier(score) {
  if (score === null || score === undefined) return 'muted'
  if (score >= 4) return 'good'
  if (score === 3) return 'mid'
  return 'bad'
}

export default function GoldenRunDetail({ datasetId, runId, onClose }) {
  const [run, setRun] = useState(null)

  useEffect(() => {
    let cancelled = false
    getGoldenRun(datasetId, runId).then((data) => {
      if (!cancelled) setRun(data)
    })
    return () => {
      cancelled = true
    }
  }, [datasetId, runId])

  return (
    <>
      <div className="golden-detail-backdrop" onClick={onClose} />
      <aside className="golden-detail-drawer" role="dialog" aria-label="Test set run">
        <div className="golden-detail-header">
          <span>Run detail</span>
          <button type="button" className="golden-detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!run ? (
          <p className="golden-detail-loading">Loading…</p>
        ) : (
          <ul className="golden-detail-list">
            {run.results.map((result) => (
              <li key={result.id} className="golden-detail-item">
                <span className="golden-detail-question">{result.question}</span>

                {result.status === 'failed' ? (
                  <p className="golden-detail-error">{result.error}</p>
                ) : (
                  <>
                    <div className="golden-detail-scores">
                      {TESTSET_METRICS.map((metric) => {
                        const score = result[metric.scoreField]
                        if (metric.nullable && (score === null || score === undefined)) return null
                        return (
                          <span key={metric.key} className={`golden-detail-score tier-${scoreTier(score)}`}>
                            {metric.label} {score ?? '—'}/5
                          </span>
                        )
                      })}
                    </div>
                    <div className="golden-detail-answers">
                      <div>
                        <span className="golden-detail-label">Expected</span>
                        <p className="golden-detail-text">{result.expected_answer}</p>
                      </div>
                      <div>
                        <span className="golden-detail-label">Generated</span>
                        <p className="golden-detail-text">{result.generated_answer}</p>
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  )
}
