import { useEffect, useRef, useState } from 'react'
import { listFiles } from '../lib/api.js'
import './DocumentLibrary.css'

export default function DocumentLibrary({ datasetId, onClose, onAddDocuments, onReingest }) {
  const [files, setFiles] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    listFiles(datasetId).then(setFiles)
  }, [datasetId])

  const handlePicked = (event) => {
    if (event.target.files.length > 0) {
      onAddDocuments(Array.from(event.target.files))
    }
  }

  return (
    <>
      <div className="library-backdrop" onClick={onClose} />
      <div className="library-panel" role="dialog" aria-label="Documents">
        <div className="library-header">
          <span>Documents in this chat</span>
          <button type="button" className="library-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ul className="library-list">
          {files.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>

        <input ref={fileInputRef} type="file" multiple hidden onChange={handlePicked} />
        <div className="library-actions">
          <button type="button" className="library-add" onClick={() => fileInputRef.current?.click()}>
            Add documents
          </button>
          <button type="button" className="library-reingest" onClick={onReingest}>
            Re-run ingestion
          </button>
        </div>
        <p className="library-reingest-hint">
          First ingestion only partly worked? Re-run it, already-processed documents won't be redone.
        </p>
      </div>
    </>
  )
}
