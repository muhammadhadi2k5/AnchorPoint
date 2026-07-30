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
        <div className="citation-drawer-body">
          <div>File: {citation.source_file}</div>
          {citation.page !== null && citation.page !== undefined && (
            <div>Page: {citation.page}</div>
          )}
          <div>Match: {Math.round(citation.score * 100)}%</div>
        </div>
      </aside>
    </>
  )
}
