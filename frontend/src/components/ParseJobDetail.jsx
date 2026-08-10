import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getParseJob, parseJobFileUrl } from '../lib/api.js'
import './ParseJobDetail.css'

const POLL_MS = 3000

const EXPORT_FORMATS = {
  markdown: { label: 'Markdown (.md)', ext: 'md', mime: 'text/markdown' },
  text: { label: 'Text (.txt)', ext: 'txt', mime: 'text/plain' },
  json: { label: 'JSON (.json)', ext: 'json', mime: 'application/json' },
}

function buildExportContent(job, format) {
  if (format === 'json') return JSON.stringify(job, null, 2)
  return job.markdown
}

// same blob -> object url -> synthetic link pattern as the chat export
function downloadParseJob(job, format) {
  const { ext, mime } = EXPORT_FORMATS[format]
  const blob = new Blob([buildExportContent(job, format)], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${job.filename.replace(/\.[^/.]+$/, '')}.${ext}`
  link.click()
  URL.revokeObjectURL(url)
}

export default function ParseJobDetail({ job, onClose }) {
  const [currentJob, setCurrentJob] = useState(job)
  const [tab, setTab] = useState('markdown')
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
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
        <div className="parse-detail-header-actions">
          {currentJob.status === 'complete' && (
            <div className="parse-detail-download">
              <button
                type="button"
                className="parse-detail-download-btn"
                onClick={() => setShowDownloadMenu((open) => !open)}
              >
                Download
              </button>
              {showDownloadMenu && (
                <div className="parse-detail-download-menu">
                  {Object.entries(EXPORT_FORMATS).map(([format, { label }]) => (
                    <button
                      type="button"
                      key={format}
                      onClick={() => {
                        downloadParseJob(currentJob, format)
                        setShowDownloadMenu(false)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="parse-detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      <div className="parse-detail-body">
        <div className="parse-detail-pdf-pane">
          <embed src={parseJobFileUrl(currentJob.id)} type="application/pdf" className="parse-detail-embed" />
        </div>

        <div className="parse-detail-content-pane">
          {currentJob.status === 'pending' && (
            <div className="parse-detail-loading">
              <div className="parse-detail-parsing-icon" aria-hidden="true">
                <span className="parse-detail-parsing-page">
                  <span className="parse-detail-parsing-line" />
                  <span className="parse-detail-parsing-line" />
                  <span className="parse-detail-parsing-line" />
                  <span className="parse-detail-parsing-line" />
                  <span className="parse-detail-parsing-sweep" />
                </span>
              </div>
              <p className="parse-detail-loading-text">Parsing your documents…</p>
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
