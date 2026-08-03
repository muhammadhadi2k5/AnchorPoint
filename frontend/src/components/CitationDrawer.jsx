import './CitationDrawer.css'

export default function CitationDrawer({ citation, onClose }) {
  if (!citation) return null

  return (
    <>
      <div className="citation-backdrop" onClick={onClose} />
      <aside className="citation-drawer" role="dialog" aria-label="Source">
        <div className="citation-drawer-header">
          <span>Source</span>
          <button type="button" className="citation-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="citation-drawer-meta">
          <div>File: {citation.source_file}</div>
          {citation.page !== null && citation.page !== undefined && (
            <div>Page: {citation.page}</div>
          )}
          <div>Match: {Math.round(citation.score * 100)}%</div>
        </div>

        <div className="citation-drawer-chunk">
          <span className="citation-drawer-chunk-label">Chunk content</span>
          <p className="citation-drawer-chunk-text">
            {citation.text ?? "Chunk text isn't available for this older message."}
          </p>
        </div>
      </aside>
    </>
  )
}
