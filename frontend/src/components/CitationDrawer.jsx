import './CitationDrawer.css'

// some PDFs (certificate templates especially) extract with a real space
// between every single character, using a double space only at actual word
// boundaries - collapsing all whitespace to one space (like a normal PDF
// needs) would leave "C o u r s e s" looking exactly as broken as before.
// splitting on the double-space/newline boundaries first, then only
// rejoining runs that are genuinely single-char tokens, fixes that case
// without mangling PDFs that never had this problem in the first place
function formatChunkText(text) {
  return text
    .split(/ {2,}|\n+/)
    .map((part) => {
      const tokens = part.split(' ')
      const isCharSpaced = tokens.length > 1 && tokens.every((t) => t.length <= 1)
      return isCharSpaced ? tokens.join('') : part
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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
            {citation.text
              ? formatChunkText(citation.text)
              : "Chunk text isn't available for this older message."}
          </p>
        </div>
      </aside>
    </>
  )
}
