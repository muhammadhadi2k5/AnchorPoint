import { useEffect, useState } from 'react'
import { getDatasetStats } from '../lib/api.js'
import './DatasetStats.css'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DatasetStats({ datasetId, onClose }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    getDatasetStats(datasetId).then(setStats)
  }, [datasetId])

  return (
    <>
      <div className="stats-backdrop" onClick={onClose} />
      <div className="stats-panel" role="dialog" aria-label="Dataset stats">
        <div className="stats-header">
          <span>Dataset stats</span>
          <button type="button" className="stats-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!stats ? (
          <p className="stats-loading">Loading...</p>
        ) : (
          <div className="stats-grid">
            <div className="stats-tile">
              <span className="stats-tile-label">Documents</span>
              <span className="stats-tile-value">{stats.document_count}</span>
            </div>
            <div className="stats-tile">
              <span className="stats-tile-label">Chunks</span>
              <span className="stats-tile-value">{stats.chunk_count}</span>
            </div>
            <div className="stats-tile">
              <span className="stats-tile-label">Storage</span>
              <span className="stats-tile-value">{formatBytes(stats.total_bytes)}</span>
            </div>
            <div className="stats-tile">
              <span className="stats-tile-label">Questions asked</span>
              <span className="stats-tile-value">{stats.questions_asked}</span>
            </div>
            <div className="stats-tile">
              <span className="stats-tile-label">Created</span>
              <span className="stats-tile-value stats-tile-value-small">{formatDate(stats.created_at)}</span>
            </div>
            <div className="stats-tile">
              <span className="stats-tile-label">Last activity</span>
              <span className="stats-tile-value stats-tile-value-small">{formatDate(stats.last_activity)}</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
