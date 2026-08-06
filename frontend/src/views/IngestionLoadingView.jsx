import { useEffect, useState } from 'react'
import { getIngestStatus } from '../api.js'
import './IngestionLoadingView.css'

const PREPARING_MESSAGES = ['Warming things up...', 'Preparing your chat...']
const PREPARING_STEP_MS = 700

// small "page being read" icon - document lines with a sweeping bar,
// purple instead of coral when this file needed OCR, a genuinely different
// beat rather than just new words next to the same animation
function ReadingIcon({ ocr }) {
  return (
    <div className={`reading-icon${ocr ? ' ocr' : ''}`} aria-hidden="true">
      <span className="reading-line" />
      <span className="reading-line" />
      <span className="reading-line" />
    </div>
  )
}

// text turning into points in vector space - a center node (the chunk) with
// satellite nodes (its embedding dimensions, loosely) blinking into
// existence one after another, connected back to the center
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

// classic success draw-on: the ring traces itself, then the check traces
// inside it - signals "this part is genuinely done" right as the app
// transitions out of ingesting and into the chat itself
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

      {/* the checkmark above already says "done" - a still-sliding loading
          bar underneath it during the preparing phase would contradict that */}
      {phase !== 'preparing' && (
        <div className="loading-strip">
          <div className={`loading-bar${isOcr ? ' ocr' : ''}`} />
        </div>
      )}

      {error ? (
        <p className="loading-message error">{error}</p>
      ) : (
        <p className="loading-message">{message}</p>
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
    </div>
  )
}
