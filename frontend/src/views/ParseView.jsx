import { useEffect, useRef, useState } from 'react'
import { createParseJobWithProgress, deleteParseJob, listParseJobs, retryParseJob } from '../lib/api.js'
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
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const fileInputRef = useRef(null)
  const pollTimeoutRef = useRef(null)
  const cancelledRef = useRef(false)
  // uploads that got removed mid-flight, so the upload can still be deleted the
  // instant it lands instead of leaving an orphaned job nobody can see
  const removedWhileUploadingRef = useRef(new Set())

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

  // Esc closes the history overlay same as the x button
  useEffect(() => {
    if (!showHistory) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowHistory(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showHistory])

  // the "uploading documents" nudge only means something while an upload is actually in
  // flight - once everything's landed there's nothing left to block Start parsing on
  useEffect(() => {
    if (error === 'Uploading documents…' && !pendingFiles.some((entry) => entry.status === 'uploading')) {
      setError(null)
    }
  }, [pendingFiles, error])

  const updateEntry = (key, patch) => {
    setPendingFiles((current) => current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)))
  }

  // upload files immediately to chrome pdf viewer
  const addFiles = (incoming) => {
    const existingKeys = new Set(pendingFiles.map((entry) => entry.key))
    const newEntries = incoming
      .filter((file) => !existingKeys.has(`${file.name}-${file.size}`))
      .map((file) => ({ key: `${file.name}-${file.size}`, file, progress: 0, status: 'uploading', job: null }))

    if (newEntries.length === 0) return
    setPendingFiles((current) => [...current, ...newEntries])

    for (const entry of newEntries) {
      createParseJobWithProgress(entry.file, (progress) => updateEntry(entry.key, { progress }))
        .then((job) => {
          if (removedWhileUploadingRef.current.has(entry.key)) {
            removedWhileUploadingRef.current.delete(entry.key)
            deleteParseJob(job.id)
            return
          }
          updateEntry(entry.key, { status: 'uploaded', progress: 100, job })
        })
        .catch(() => {
          removedWhileUploadingRef.current.delete(entry.key)
          updateEntry(entry.key, { status: 'error', progress: 0 })
          setError(`Couldn't upload ${entry.file.name}`)
        })
    }
  }

  const removeFile = (key) => {
    const entry = pendingFiles.find((e) => e.key === key)
    if (entry?.status === 'uploading') removedWhileUploadingRef.current.add(key)
    else if (entry?.job) deleteParseJob(entry.job.id)
    setPendingFiles((current) => current.filter((e) => e.key !== key))
  }

  // by now every file already finished uploading, so this just hands off the
  // already-created jobs to the detail view - opens the last one uploaded so
  // you land straight on it instead of the list
  const handleStartParsing = () => {
    if (pendingFiles.length === 0) {
      setError('Add at least one document to continue')
      return
    }
    if (pendingFiles.some((entry) => entry.status === 'uploading')) {
      setError('Uploading documents…')
      return
    }
    setError(null)
    const created = pendingFiles.filter((entry) => entry.status === 'uploaded').map((entry) => entry.job)
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

  const handleRetryJob = async (jobId) => {
    await retryParseJob(jobId)
    refreshJobs()
  }

  const handleDeleteAllJobs = async () => {
    await Promise.all(jobs.map((job) => deleteParseJob(job.id)))
    setConfirmDeleteAll(false)
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
          {pendingFiles.map((entry) => {
            const circumference = 2 * Math.PI * 6
            return (
              <div className={`parse-file-chip status-${entry.status}`} key={entry.key}>
                {entry.status === 'uploaded' ? (
                  <svg className="parse-file-chip-icon parse-file-chip-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg className="parse-file-chip-icon parse-file-chip-ring" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="var(--sand-line)" strokeWidth="2" />
                    <circle
                      className="parse-file-chip-ring-fill"
                      cx="8"
                      cy="8"
                      r="6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - entry.progress / 100)}
                      transform="rotate(-90 8 8)"
                    />
                  </svg>
                )}
                <span className="parse-file-chip-name">{entry.file.name}</span>
                <button
                  type="button"
                  className="parse-file-chip-remove"
                  aria-label={`Remove ${entry.file.name}`}
                  onClick={() => removeFile(entry.key)}
                >
                  ×
                </button>
              </div>
            )
          })}
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
              <div className="parse-history-header-actions">
                {jobs.length > 0 && (
                  confirmDeleteAll ? (
                    <span className="parse-job-confirm">
                      <button type="button" className="parse-job-confirm-delete" onClick={handleDeleteAllJobs}>
                        Delete all
                      </button>
                      <button type="button" className="parse-job-confirm-cancel" onClick={() => setConfirmDeleteAll(false)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="parse-history-delete-all" onClick={() => setConfirmDeleteAll(true)}>
                      Delete all
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="parse-history-close"
                  onClick={() => setShowHistory(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
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
                    {job.status === 'failed' && (
                      <button
                        type="button"
                        className="parse-job-retry"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRetryJob(job.id)
                        }}
                      >
                        Retry
                      </button>
                    )}
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
          onCreateDataset={(jobIds, name) => onCreateDatasetFromJob(jobIds, name)}
          onClose={() => {
            setSelectedJob(null)
            setActiveBatch([])
          }}
        />
      )}
    </div>
  )
}
