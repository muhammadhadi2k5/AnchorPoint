import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getParseJob, parseJobFileUrl } from '../lib/api.js'
import './ParseJobDetail.css'

const POLL_MS = 3000

const BATCH_STATUS_LABELS = {
  pending: 'Parsing…',
  complete: 'Done',
  failed: 'Failed',
}

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

export default function ParseJobDetail({ job, batch = [], onSelectBatchJob, onCreateDataset, onClose }) {
  const [currentJob, setCurrentJob] = useState(job)
  const [tab, setTab] = useState('markdown')
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  // starts empty for a batch and fills in as files finish parsing, so the common case
  // (parse a few related files, turn them all into one chat) is just one click once
  // everything's done. a manual uncheck sticks even if that file wasn't done yet
  const [selectedIds, setSelectedIds] = useState(() => new Set(batch.length > 1 ? [] : [job.id]))
  const deselectedRef = useRef(new Set())
  const pollTimeoutRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      let changed = false
      for (const item of batch) {
        if (item.status === 'complete' && !next.has(item.id) && !deselectedRef.current.has(item.id)) {
          next.add(item.id)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [batch])

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
        deselectedRef.current.add(id)
      } else {
        next.add(id)
        deselectedRef.current.delete(id)
      }
      return next
    })
  }

  // only polls if the job wasn't already done when this opened, same
  // pending -> complete/failed shape as the ingestion loading screen.
  // also resyncs currentJob whenever a different batch card gets picked
  useEffect(() => {
    cancelledRef.current = false
    setCurrentJob(job)

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
            <button
              type="button"
              className="parse-detail-create-dataset-btn"
              disabled={selectedIds.size === 0}
              onClick={() => onCreateDataset(Array.from(selectedIds))}
            >
              Create a chat{selectedIds.size > 1 ? ` (${selectedIds.size} docs)` : ''}
            </button>
          )}
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

      {batch.length > 1 && (
        <div className="parse-detail-batch-row">
          {batch.map((item) => (
            <div key={item.id} className={`parse-detail-batch-card${item.id === currentJob.id ? ' active' : ''}`}>
              <button type="button" className="parse-detail-batch-card-main" onClick={() => onSelectBatchJob(item)}>
                <span className="parse-detail-batch-name">{item.filename}</span>
                <span className={`parse-detail-batch-progress status-${item.status}`}>
                  <span className="parse-detail-batch-progress-fill" />
                </span>
                <span className={`parse-detail-batch-status status-${item.status}`}>
                  {BATCH_STATUS_LABELS[item.status]}
                </span>
              </button>
              {item.status === 'complete' && (
                <label className="parse-detail-batch-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  Include in chat
                </label>
              )}
            </div>
          ))}
        </div>
      )}

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
