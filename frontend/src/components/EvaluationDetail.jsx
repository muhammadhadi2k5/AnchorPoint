import { METRIC_INFO } from '../evalMetricInfo.js'
import InfoTooltip from './InfoTooltip.jsx'
import './EvaluationDetail.css'

function scoreTier(score) {
  if (score === null || score === undefined) return 'muted'
  if (score >= 4) return 'good'
  if (score === 3) return 'mid'
  return 'bad'
}

function MetricSection({ title, info, score, reasoning }) {
  return (
    <div className="eval-detail-metric">
      <div className="eval-detail-metric-header">
        <span className="eval-detail-metric-title">
          {title}
          <InfoTooltip text={info} />
        </span>
        {score !== null && score !== undefined && (
          <span className={`eval-detail-metric-score tier-${scoreTier(score)}`}>{score}/5</span>
        )}
      </div>
      <p className="eval-detail-metric-reasoning">
        {score === null || score === undefined
          ? 'Not applicable — no context was retrieved.'
          : reasoning}
      </p>
    </div>
  )
}

export default function EvaluationDetail({ evaluation, onClose }) {
  if (!evaluation) return null

  return (
    <>
      <div className="eval-detail-backdrop" onClick={onClose} />
      <aside className="eval-detail-drawer" role="dialog" aria-label="Evaluation detail">
        <div className="eval-detail-header">
          <span>Evaluation</span>
          <button type="button" className="eval-detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="eval-detail-exchange">
          <span className="eval-detail-label">Question</span>
          <p className="eval-detail-text">{evaluation.question}</p>
          <span className="eval-detail-label">Answer</span>
          <p className="eval-detail-text">{evaluation.answer}</p>
        </div>

        {evaluation.status === 'failed' ? (
          <div className="eval-detail-error">
            <span className="eval-detail-label">Evaluation failed</span>
            <p className="eval-detail-text">{evaluation.error}</p>
          </div>
        ) : evaluation.status === 'pending' ? (
          <p className="eval-detail-text">Still being scored...</p>
        ) : (
          <div className="eval-detail-metrics">
            <MetricSection
              title="Faithfulness"
              info={METRIC_INFO.faithfulness}
              score={evaluation.faithfulness_score}
              reasoning={evaluation.faithfulness_reasoning}
            />
            <MetricSection
              title="Answer relevance"
              info={METRIC_INFO.answerRelevance}
              score={evaluation.answer_relevance_score}
              reasoning={evaluation.answer_relevance_reasoning}
            />
            <MetricSection
              title="Context relevance"
              info={METRIC_INFO.contextRelevance}
              score={evaluation.context_relevance_score}
              reasoning={evaluation.context_relevance_reasoning}
            />
          </div>
        )}
      </aside>
    </>
  )
}