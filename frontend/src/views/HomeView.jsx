import { useRef, useState } from 'react'
import './HomeView.css'

const BASE_GREETINGS = [
  'What are we looking into today?',
  'Ask your documents anything',
  "What's on your mind?",
  "Let's dig into your documents",
  'What do you need to know?',
  'Ready when you are',
  'What can I find for you?',
  'Where should we start?',
  'What are you curious about?',
  'Your documents, your questions',
  "Let's find that answer",
  'What would you like to know?',
  'Anything you need from your docs?',
  'Search away',
  'What can I help you find today?',
  "Let's get you an answer",
  'What are we exploring today?',
  'Your anchor point for answers',
  'What can I look up for you?',
  'Ready to search',
]

export default function HomeView({ onStart, onBack, showBrandWord }) {
  const [greeting] = useState(() => BASE_GREETINGS[Math.floor(Math.random() * BASE_GREETINGS.length)])
  const [name, setName] = useState('')
  const [files, setFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [justCaught, setJustCaught] = useState(false)
  const [nameError, setNameError] = useState(null)
  const [filesError, setFilesError] = useState(null)
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const catchTimeoutRef = useRef(null)

  // needs a plain array here, not a live FileList, resetting input.value right after picking
  // files would wipe the FileList before react even gets to read from it
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

    // re-triggerable one-shot "caught it" bounce, separate from .dragging's
    // looping ripple which stops the instant the drag ends
    setJustCaught(false)
    clearTimeout(catchTimeoutRef.current)
    requestAnimationFrame(() => {
      setJustCaught(true)
      catchTimeoutRef.current = setTimeout(() => setJustCaught(false), 450)
    })
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
      <div className="home-hero-band" aria-hidden="true" />

      <button type="button" className="home-back" onClick={onBack}>&lsaquo; Back</button>

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
          autoComplete="off"
        />
        {nameError && <p className="field-error">{nameError}</p>}

        <div
          className={`drop-zone${isDragging ? ' dragging' : ''}${filesError ? ' has-error' : ''}${justCaught ? ' caught' : ''}`}
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
              <span
                className="file-chip"
                key={`${file.name}-${file.size}`}
                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
              >
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
