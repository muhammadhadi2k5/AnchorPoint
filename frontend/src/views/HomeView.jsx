import { useRef, useState } from 'react'
import './HomeView.css'

const BASE_GREETINGS = [
  'What are we looking into today?',
  'Ask your documents anything',
  "What's on your mind?",
  "Let's dig into your documents",
  'What do you need to know?',
  'Ready when you are',
]

// best-effort only - there's no separate display name field, just a guess
// from the email's local part (e.g. "muhammadhadi.2k5" -> "Muhammadhadi")
function nameFromEmail(email) {
  if (!email) return null
  const local = email.split('@')[0]
  const firstSegment = local.split(/[._-]/)[0].replace(/[0-9]+$/, '')
  if (!firstSegment) return null
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
}

export default function HomeView({ onStart, showBrandWord, userEmail }) {
  const [greeting] = useState(() => {
    const name = nameFromEmail(userEmail)
    const options = name
      ? [...BASE_GREETINGS, `Welcome back, ${name}`, `Good to see you, ${name}`]
      : BASE_GREETINGS
    return options[Math.floor(Math.random() * options.length)]
  })
  const [name, setName] = useState('')
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [nameError, setNameError] = useState(null)
  const [filesError, setFilesError] = useState(null)
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)

  // incoming must already be a plain array, not a live FileList - callers
  // that reset input.value right after selection would otherwise clear the
  // very FileList this reads from before React gets to process it
  const addFiles = (incoming) => {
    const existingKeys = new Set(files.map((f) => `${f.name}-${f.size}`))
    const newFiles = []
    let hasDuplicate = false

    for (const file of incoming) {
      const key = `${file.name}-${file.size}`
      if (existingKeys.has(key)) {
        hasDuplicate = true
      } else {
        existingKeys.add(key)
        newFiles.push(file)
      }
    }

    if (newFiles.length > 0) {
      setFiles((current) => [...current, ...newFiles])
    }
    setFilesError(hasDuplicate ? 'This file has already been added' : null)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  const removeFile = (index) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const handleNameChange = (event) => {
    setName(event.target.value)
    if (nameError) setNameError(null)
  }

  const handleStartClick = () => {
    if (name.trim().length === 0) {
      setNameError('Please fill in this field to continue')
      nameInputRef.current?.focus()
      return
    }
    if (files.length === 0) {
      setFilesError('Add at least one document to continue')
      return
    }
    onStart(name.trim(), files)
  }

  return (
    <div className="home-view">
      <div className="home-brand">
        <span className={`home-brand-word${showBrandWord ? '' : ' hidden'}`}>
          ANCHOR<span className="accent">POINT</span>
        </span>
      </div>

      <h1 className="greeting">{greeting}</h1>

      <div className="home-form">
        <label className="name-label" htmlFor="dataset-name">
          Name this dataset
        </label>
        <input
          id="dataset-name"
          ref={nameInputRef}
          className={`name-field${nameError ? ' has-error' : ''}`}
          type="text"
          placeholder="e.g. Research Papers"
          value={name}
          onChange={handleNameChange}
        />
        {nameError && <p className="field-error">{nameError}</p>}

        <div
          className={`drop-zone${isDragging ? ' dragging' : ''}${filesError ? ' has-error' : ''}`}
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
          <p className="drop-text">
            {isDragging
              ? 'Drop it right here'
              : 'Drag and drop your documents here, or click to browse'}
          </p>
          <p className="drop-hint">PDF, DOCX, XLSX, CSV, TXT, or images</p>
        </div>
        {filesError && <p className="field-error">{filesError}</p>}

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

        <button className="cta-button" onClick={handleStartClick}>
          Start ingesting
        </button>
      </div>
    </div>
  )
}
