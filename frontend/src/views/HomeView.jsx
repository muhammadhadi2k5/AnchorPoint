import { useRef, useState } from 'react'
import './HomeView.css'

const GREETING = 'What are we looking into today?'

export default function HomeView({ onStart }) {
  const [name, setName] = useState('')
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const addFiles = (incoming) => {
    setFiles((current) => [...current, ...Array.from(incoming)])
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const removeFile = (index) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const canStart = name.trim().length > 0 && files.length > 0

  return (
    <div className="home-view">
      <h1 className="greeting">{GREETING}</h1>

      <div className="home-form">
        <label className="name-label" htmlFor="dataset-name">
          Name this dataset
        </label>
        <input
          id="dataset-name"
          className="name-field"
          type="text"
          placeholder="e.g. Research Papers"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div
          className={`drop-zone${isDragging ? ' dragging' : ''}`}
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
            onChange={(e) => addFiles(e.target.files)}
          />
          <p className="drop-text">
            {isDragging
              ? 'Drop it right here'
              : 'Drag and drop your documents here, or click to browse'}
          </p>
          <p className="drop-hint">PDF, DOCX, XLSX, CSV, TXT, or images</p>
        </div>

        {files.length > 0 && (
          <div className="file-chips">
            {files.map((file, index) => (
              <span className="file-chip" key={`${file.name}-${index}`}>
                {file.name}
                <button
                  type="button"
                  className="file-chip-remove"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeFile(index)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          className="cta-button"
          disabled={!canStart}
          onClick={() => onStart(name.trim(), files)}
        >
          Start ingesting
        </button>
      </div>
    </div>
  )
}
