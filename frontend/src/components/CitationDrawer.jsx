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
          <span className="citation-drawer-meta-label">Chunk metadata</span>
          <div className="citation-drawer-meta-body">
            <div>File: {citation.source_file}</div>
            {citation.page !== null && citation.page !== undefined && (
              <div>Page: {citation.page + 1}</div>
            )}
            <div>Match: {Math.round(citation.score * 100)}%</div>
          </div>
        </div>

        <div className="citation-drawer-chunk">
          <span className="citation-drawer-chunk-label">Chunk content</span>
          <p className="citation-drawer-chunk-text">
            {/* PDF extraction keeps the source's own line breaks (e.g. a
                certificate's stacked layout), which reads as choppy
                one-phrase-per-line text in a narrow panel - collapse those
                into normal spaces so it flows like a real paragraph instead */}
            {citation.text
              ? citation.text.replace(/\s+/g, ' ').trim()
              : "Chunk text isn't available for this older message."}
          </p>
        </div>
      </aside>
    </>
  )
}
