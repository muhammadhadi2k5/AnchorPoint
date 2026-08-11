import { useEffect, useRef, useState } from 'react'
import { createParseJob, deleteParseJob, listParseJobs } from '../lib/api.js'
import ParseJobDetail from '../components/ParseJobDetail.jsx'
import './ParseView.css'

const POLL_MS = 3000

const PARSE_GREETINGS = [
  'See how your document gets read',
  'Check how well this document parses',
  'Preview how your document gets extracted',
  "Let's see what the parser finds",
  'What should we take a look at?',
  'See your document through the pipeline',
  'Upload it, see exactly how it reads',
  'What document should we inspect?',
  'Preview extraction before you ingest',
  'See the raw text behind the page',
  'What are we reviewing today?',
  "Let's see what's really in that PDF",
  'Check your document before it goes in',
  'See how clean the extraction really is',
  'What should we take apart today?',
  'Peek behind your document',
  'Convert to Markdown, JSON, or plain text',
  'Turn your document into Markdown, JSON, or text',
  'Your anchor point before ingestion',
  'Your anchor point for accurate parsing'
]

export default function ParseView({ onBack, showBrandWord, onCreateDatasetFromJob }) {
  const [greeting] = useState(() => PARSE_GREETINGS[Math.floor(Math.random() * PARSE_GREETINGS.length)])
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [activeBatch, setActiveBatch] = useState([])
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const fileInputRef = useRef(null)
  const pollTimeoutRef = useRef(null)
  const cancelledRef = useRef(false)

  // clears any pending timer first so an upload-triggered refresh and a
  // timer-triggered one can never both land back to back
  const refreshJobs = async () => {
    clearTimeout(pollTimeoutRef.current)
    try {
      const latest = await listParseJobs()
      if (cancelledRef.current) return
      setJobs(latest)
      if (latest.some((j) => j.status === 'pending')) {
        pollTimeoutRef.current = setTimeout(refreshJobs, POLL_MS)
      }
    } catch {
      if (!cancelledRef.current) pollTimeoutRef.current = setTimeout(refreshJobs, POLL_MS)
    }
  }

  useEffect(() => {
    cancelledRef.current = false
    refreshJobs()
    return () => {
      cancelledRef.current = true
      clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  // dedupes by name+size same as HomeView, files just sit here until Start parsing is clicked
  const addFiles = (incoming) => {
    setPendingFiles((current) => {
      const existingKeys = new Set(current.map((f) => `${f.name}-${f.size}`))
      const newFiles = incoming.filter((file) => !existingKeys.has(`${file.name}-${file.size}`))
      return [...current, ...newFiles]
    })
  }

  const removeFile = (index) => {
    setPendingFiles((current) => current.filter((_, i) => i !== index))
  }

  // each file becomes its own job, one create call per file. opens the detail
  // view on the last one uploaded so you land straight on it instead of the list.
  // the whole created batch is kept around too, so the detail view can offer
  // quick switching between everything from this one upload
  const handleStartParsing = async () => {
    if (pendingFiles.length === 0) {
      setError('Add at least one document to continue')
      return
    }
    setError(null)
    const created = []
    for (const file of pendingFiles) {
      try {
        created.push(await createParseJob(file))
      } catch {
        setError(`Couldn't start parsing ${file.name}`)
      }
    }
    setPendingFiles([])
    setActiveBatch(created)
    refreshJobs()
    if (created.length > 0) setSelectedJob(created[created.length - 1])
  }

  const handleDeleteJob = async (jobId) => {
    await deleteParseJob(jobId)
    setConfirmDeleteId(null)
    refreshJobs()
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="parse-view">
      <div className="parse-hero-band" aria-hidden="true" />

      <button type="button" className="parse-view-back" onClick={onBack}>&lsaquo; Back</button>

      <div className="parse-view-brand">
        <span className={`parse-view-brand-word${showBrandWord ? '' : ' hidden'}`}>
          ANCHOR<span className="accent">POINT</span>
        </span>
      </div>

      <h1 className="parse-view-heading">{greeting}</h1>

      <div
        className={`parse-drop-zone${isDragging ? ' dragging' : ''}${error ? ' has-error' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files)
            e.target.value = ''
            addFiles(picked)
          }}
        />
        <p className="parse-drop-text">
          {isDragging ? 'Drop it right here' : 'Drag and drop your documents here, or click to browse'}
        </p>
        <p className="parse-drop-hint">PDF, DOCX, XLSX, CSV, TXT, or images</p>
      </div>

      {error && <p className="parse-field-error">{error}</p>}

      {pendingFiles.length > 0 && (
        <div className="parse-file-chips">
          {pendingFiles.map((file, index) => (
            <span className="parse-file-chip" key={`${file.name}-${file.size}`}>
              {file.name}
              <button
                type="button"
                className="parse-file-chip-remove"
                aria-label={`Remove ${file.name}`}
                onClick={() => removeFile(index)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="parse-main-actions">
        <button type="button" className="parse-start-button" onClick={handleStartParsing}>
          Start parsing
        </button>
        <button type="button" className="parse-history-tile" onClick={() => setShowHistory(true)}>
          View history
        </button>
      </div>

      {showHistory && (
        <div
          className="parse-history-overlay"
          role="dialog"
          aria-label="Parse history"
          onClick={() => setShowHistory(false)}
        >
          <div className="parse-history-panel" onClick={(event) => event.stopPropagation()}>
            <div className="parse-history-header">
              <span>Parse history</span>
              <button
                type="button"
                className="parse-history-close"
                onClick={() => setShowHistory(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {jobs.length === 0 ? (
              <p className="parse-history-empty">Nothing parsed yet.</p>
            ) : (
              <ul className="parse-job-list">
                {jobs.map((job) => (
                  <li key={job.id} className="parse-job-row">
                    <button
                      type="button"
                      className="parse-job-row-main"
                      onClick={() => {
                        setSelectedJob(job)
                        setShowHistory(false)
                      }}
                    >
                      <span className="parse-job-name">{job.filename}</span>
                      <span className={`parse-job-status status-${job.status}`}>{job.status}</span>
                    </button>
                    {confirmDeleteId === job.id ? (
                      <span className="parse-job-confirm">
                        <button type="button" className="parse-job-confirm-delete" onClick={() => handleDeleteJob(job.id)}>
                          Delete
                        </button>
                        <button type="button" className="parse-job-confirm-cancel" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="parse-job-delete"
                        onClick={(event) => {
                          event.stopPropagation()
                          setConfirmDeleteId(job.id)
                        }}
                        aria-label={`Delete ${job.filename}`}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selectedJob && (
        <ParseJobDetail
          job={selectedJob}
          batch={activeBatch.length > 1 ? activeBatch.map((b) => jobs.find((j) => j.id === b.id) || b) : []}
          onSelectBatchJob={setSelectedJob}
          onCreateDataset={(jobIds) => onCreateDatasetFromJob(jobIds)}
          onClose={() => {
            setSelectedJob(null)
            setActiveBatch([])
          }}
        />
      )}
    </div>
  )
}
