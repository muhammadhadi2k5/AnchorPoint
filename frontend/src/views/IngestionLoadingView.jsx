import { useEffect, useState } from 'react'
import { getIngestStatus } from '../api.js'
import './IngestionLoadingView.css'

const PREPARING_MESSAGES = ['Warming things up...', 'Preparing your chat...']
const PREPARING_STEP_MS = 700

export default function IngestionLoadingView({ datasetId, onComplete }) {
  const [message, setMessage] = useState('Reading your documents...')
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

  return (
    <div className="ingestion-loading-view">
      <div className="loading-strip">
        <div className="loading-bar" />
      </div>
      {error ? (
        <p className="loading-message error">{error}</p>
      ) : (
        <p className="loading-message">{message}</p>
      )}
    </div>
  )
}
