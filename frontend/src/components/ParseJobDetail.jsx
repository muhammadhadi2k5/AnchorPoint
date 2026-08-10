import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getParseJob, parseJobFileUrl } from '../lib/api.js'
import './ParseJobDetail.css'

const POLL_MS = 3000

export default function ParseJobDetail({ job, onClose }) {
  const [currentJob, setCurrentJob] = useState(job)
  const [tab, setTab] = useState('markdown')
  const pollTimeoutRef = useRef(null)
  const cancelledRef = useRef(false)

  // only polls if the job wasn't already done when this opened, same
  // pending -> complete/failed shape as the ingestion loading screen
  useEffect(() => {
    cancelledRef.current = false

    const poll = async () => {
      try {
        const latest = await getParseJob(job.id)
        if (cancelledRef.current) return
        setCurrentJob(latest)
        if (latest.status === 'pending') pollTimeoutRef.current = setTimeout(poll, POLL_MS)
      } catch {
        if (!cancelledRef.current) pollTimeoutRef.current = setTimeout(poll, POLL_MS)
      }
    }

    if (job.status === 'pending') pollTimeoutRef.current = setTimeout(poll, POLL_MS)

    return () => {
      cancelledRef.current = true
      clearTimeout(pollTimeoutRef.current)
    }
  }, [job.id, job.status])

  return (
    <div className="parse-detail-panel" role="dialog" aria-label="Parsed document">
      <div className="parse-detail-header">
        <span>{currentJob.filename}</span>
        <button type="button" className="parse-detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="parse-detail-body">
        <div className="parse-detail-pdf-pane">
          <embed src={parseJobFileUrl(currentJob.id)} type="application/pdf" className="parse-detail-embed" />
        </div>

        <div className="parse-detail-content-pane">
          {currentJob.status === 'pending' && (
            <div className="parse-detail-loading">
              <span className="parse-detail-spinner" aria-hidden="true" />
              <p className="parse-detail-loading-text">Still parsing…</p>
            </div>
          )}
          {currentJob.status === 'failed' && (
            <p className="parse-detail-error">{currentJob.error || 'Parsing failed.'}</p>
          )}
          {currentJob.status === 'complete' && (
            <>
              <div className="parse-detail-tabs">
                <button
                  type="button"
                  className={`parse-detail-tab-btn${tab === 'markdown' ? ' active' : ''}`}
                  onClick={() => setTab('markdown')}
                >
                  Markdown
                </button>
                <button
                  type="button"
                  className={`parse-detail-tab-btn${tab === 'text' ? ' active' : ''}`}
                  onClick={() => setTab('text')}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`parse-detail-tab-btn${tab === 'json' ? ' active' : ''}`}
                  onClick={() => setTab('json')}
                >
                  JSON
                </button>
              </div>

              <div className="parse-detail-content">
                {tab === 'markdown' && (
                  <div className="parse-detail-markdown">
                    <ReactMarkdown>{currentJob.markdown}</ReactMarkdown>
                  </div>
                )}
                {tab === 'text' && <pre className="parse-detail-raw">{currentJob.markdown}</pre>}
                {tab === 'json' && <pre className="parse-detail-raw">{JSON.stringify(currentJob, null, 2)}</pre>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
