import { useEffect, useRef, useState } from 'react'
import { createParseJob, listParseJobs } from '../lib/api.js'
import './ParseView.css'

const POLL_MS = 3000

export default function ParseView({ onBack }) {
  const [isDragging, setIsDragging] = useState(false)
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
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
  // needed since there's nothing else to fill in first
  const uploadFiles = async (incoming) => {
    setError(null)
    for (const file of incoming) {
      try {
        await createParseJob(file)
      } catch {
        setError(`Couldn't start parsing ${file.name}`)
      }
    }
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
      <h1 className="parse-view-heading">Parse your documents</h1>

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
              <span className="parse-job-name">{job.filename}</span>
              <span className={`parse-job-status status-${job.status}`}>{job.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
