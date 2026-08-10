import { useRef, useState } from 'react'
import { createParseJob } from '../lib/api.js'
import './ParseView.css'

export default function ParseView({ onBack }) {
  const [isDragging, setIsDragging] = useState(false)
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  // each file becomes its own job right away, no name field or submit button
  // needed since there's nothing else to fill in first
  const uploadFiles = async (incoming) => {
    setError(null)
    for (const file of incoming) {
      try {
        const job = await createParseJob(file)
        setJobs((current) => [job, ...current])
      } catch {
        setError(`Couldn't start parsing ${file.name}`)
      }
    }
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
