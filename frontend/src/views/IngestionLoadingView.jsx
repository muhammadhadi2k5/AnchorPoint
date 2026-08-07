import { useEffect, useState } from 'react'
import { getIngestStatus } from '../lib/api.js'
import './IngestionLoadingView.css'

const PREPARING_MESSAGES = ['Warming things up...', 'Preparing your chat...']
const PREPARING_STEP_MS = 700

// the little "reading a page" icon, turns purple instead of coral when ocr kicks in so it
// actually feels different, not just the same animation with new text next to it
function ReadingIcon({ ocr }) {
  return (
    <div className={`reading-icon${ocr ? ' ocr' : ''}`} aria-hidden="true">
      <span className="reading-line" />
      <span className="reading-line" />
      <span className="reading-line" />
    </div>
  )
}

// shows text turning into points in vector space, one dot in the center for the chunk with
// little satellite dots blinking in one by one, loosely standing in for its embedding dimensions
function VectorIcon() {
  const nodes = [
    { cx: 29, cy: 11 },
    { cx: 11, cy: 11 },
    { cx: 8, cy: 27 },
    { cx: 32, cy: 27 },
  ]
  return (
    <svg className="vector-icon" viewBox="0 0 40 40" aria-hidden="true">
      {nodes.map((n, i) => (
        <line key={i} x1="20" y1="20" x2={n.cx} y2={n.cy} className="vector-edge" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r="2.6" className="vector-node" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
      <circle cx="20" cy="20" r="3.4" className="vector-node vector-node-center" />
    </svg>
  )
}

// classic checkmark draw-on, the ring traces first then the check traces inside it, timed to
// land right as the app finishes ingesting and switches over to chat
function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" pathLength="1" className="check-ring" />
      <path d="M12,21 L17,26 L28,14" pathLength="1" className="check-mark" />
    </svg>
  )
}

export default function IngestionLoadingView({ datasetId, onComplete }) {
  const [message, setMessage] = useState('Reading your documents...')
  const [fileInfo, setFileInfo] = useState({ filename: null, index: null, total: null, kind: null })
  const [stage, setStage] = useState('reading')
  const [error, setError] = useState(null)
  const [phase, setPhase] = useState('ingesting')

  // phase 1: poll real ingestion progress from the backend
  useEffect(() => {
    if (phase !== 'ingesting') return undefined

    let cancelled = false

    const poll = async () => {
      try {
        const status = await getIngestStatus(datasetId)
        if (cancelled) return

        if (status.error) {
          setError(status.error)
          return
        }
        if (status.message) setMessage(status.message)
        setFileInfo({
          filename: status.filename ?? null,
          index: status.file_index ?? null,
          total: status.file_total ?? null,
          kind: status.kind ?? null,
        })
        if (status.stage) setStage(status.stage)

        if (status.done) {
          setPhase('preparing')
        } else {
          timeoutId = setTimeout(poll, 700)
        }
      } catch {
        if (!cancelled) timeoutId = setTimeout(poll, 700)
      }
    }

    let timeoutId = setTimeout(poll, 300)
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [datasetId, phase])

  // phase 2: no real backend work here, just a short paced transition
  // into chat so the two loading stages don't blend into one
  useEffect(() => {
    if (phase !== 'preparing') return undefined

    let step = 0
    setMessage(PREPARING_MESSAGES[0])
    setFileInfo({ filename: null, index: null, total: null, kind: null })

    const interval = setInterval(() => {
      step += 1
      if (step >= PREPARING_MESSAGES.length) {
        clearInterval(interval)
        onComplete()
        return
      }
      setMessage(PREPARING_MESSAGES[step])
    }, PREPARING_STEP_MS)

    return () => clearInterval(interval)
  }, [phase, onComplete])

  const isOcr = fileInfo.kind === 'ocr'

  // drives the Reading / Embedding / Done tracker below the headline, just reuses the same
  // stage state that picks the icon above, mapped onto a 3-step index instead
  const stageIndex = phase === 'preparing' ? 2 : stage === 'embedding' ? 1 : 0
  const stageStatus = (i) => (i < stageIndex ? 'done' : i === stageIndex ? 'active' : '')

  return (
    <div className="ingestion-loading-view">
      {!error && (
        <div key={phase === 'preparing' ? 'check' : stage} className="ingestion-icon-slot">
          {phase === 'preparing' ? (
            <CheckIcon />
          ) : stage === 'embedding' ? (
            <VectorIcon />
          ) : (
            <ReadingIcon ocr={isOcr} />
          )}
        </div>
      )}

      {error ? (
        <h1 className="loading-headline error">{error}</h1>
      ) : (
        <h1 className="loading-headline">{message}</h1>
      )}

      {/* keyed by filename so each new file re-triggers the fade-in
          instead of the text just snapping to the new value */}
      {fileInfo.filename && !error && (
        <p key={fileInfo.filename} className="reading-filename">
          {fileInfo.filename}
          {fileInfo.total > 1 && (
            <span className="reading-count"> · file {fileInfo.index} of {fileInfo.total}</span>
          )}
        </p>
      )}

      {/* the checkmark above already says "done" - a still-sliding track
          underneath it during the preparing phase would contradict that */}
      {phase !== 'preparing' && (
        <div className="loading-track">
          <div className={`loading-track-fill${isOcr ? ' ocr' : ''}`} />
        </div>
      )}

      {!error && (
        <div className="loading-stages">
          <span className={`loading-stage ${stageStatus(0)}`}>Reading</span>
          <span className={`loading-stage ${stageStatus(1)}`}>Embedding</span>
          <span className={`loading-stage ${stageStatus(2)}`}>Done</span>
        </div>
      )}
    </div>
  )
}
