import { useEffect, useRef, useState } from 'react'
import { createParseJob, deleteParseJob, listParseJobs } from '../lib/api.js'
import ParseJobDetail from '../components/ParseJobDetail.jsx'
import './ParseView.css'

const POLL_MS = 3000

const PARSE_GREETINGS = [
  'What are we parsing today?',
  'Parse a document...',
  "Let's format your documents",
  'Drop a document and get it parsed',
  'What should we read today?',
  'Ready to parse',
  'What do you want extracted?',
  'Upload it, watch it get parsed',
  "Let's turn your data into something readable",
  'What are we extracting today?',
  'What can I clean up for you?',
  'What needs parsing?',
  'Your documents, cleaned up and readable',
  'Your anchor point for accurate parsing',
  'What can I parse for you?',
  'Ready to clean up your documents',
]

export default function ParseView({ onBack, showBrandWord }) {
  const [greeting] = useState(() => PARSE_GREETINGS[Math.floor(Math.random() * PARSE_GREETINGS.length)])
  const [isDragging, setIsDragging] = useState(false)
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
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

  // each file becomes its own job right away, no name field or submit button
  // needed since there's nothing else to fill in first. opens the detail view
  // on the last one uploaded so you land straight on it instead of the list
  const uploadFiles = async (incoming) => {
    setError(null)
    let lastCreated = null
    for (const file of incoming) {
      try {
        lastCreated = await createParseJob(file)
      } catch {
        setError(`Couldn't start parsing ${file.name}`)
      }
    }
    refreshJobs()
    if (lastCreated) setSelectedJob(lastCreated)
  }

  const handleDeleteJob = async (jobId) => {
    await deleteParseJob(jobId)
    setConfirmDeleteId(null)
    refreshJobs()
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    uploadFiles(Array.from(event.dataTransfer.files))
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
        className={`parse-drop-zone${isDragging ? ' dragging' : ''}`}
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
            uploadFiles(picked)
          }}
        />
        <p className="parse-drop-text">
          {isDragging ? 'Drop it right here' : 'Drag and drop your documents here, or click to browse'}
        </p>
        <p className="parse-drop-hint">PDF, DOCX, XLSX, CSV, TXT, or images</p>
      </div>

      {error && <p className="parse-field-error">{error}</p>}

      {jobs.length > 0 && (
        <ul className="parse-job-list">
          {jobs.map((job) => (
            <li key={job.id} className="parse-job-row">
              <button type="button" className="parse-job-row-main" onClick={() => setSelectedJob(job)}>
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

      {selectedJob && <ParseJobDetail job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  )
}
