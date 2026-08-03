import { useEffect, useState } from 'react'
import './CitationPopover.css'

const WIDTH = 360
const MARGIN = 12

// clamps the popup to the clicked tag's position without letting it run off
// either edge of the screen
function positionFor(anchorRect) {
  const left = Math.min(anchorRect.left, window.innerWidth - WIDTH - MARGIN)
  return {
    top: anchorRect.bottom + 8,
    left: Math.max(MARGIN, left),
  }
}

export default function CitationPopover({ citation, anchorRect, onClose }) {
  const [position, setPosition] = useState(() => anchorRect && positionFor(anchorRect))

  useEffect(() => {
    if (anchorRect) setPosition(positionFor(anchorRect))
  }, [anchorRect])

  if (!citation || !position) return null

  return (
    <>
      <div className="citation-popover-backdrop" onClick={onClose} />
      <div
        className="citation-popover"
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-label="Source"
      >
        <div className="citation-popover-header">
          <div>
            <div className="citation-popover-file">{citation.source_file}</div>
            <div className="citation-popover-meta">
              {citation.page !== null && citation.page !== undefined ? `Page ${citation.page} · ` : ''}
              {Math.round(citation.score * 100)}% match
            </div>
          </div>
          <button type="button" className="citation-popover-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="citation-popover-chunk">
          {citation.text ?? "Chunk text isn't available for this older message."}
        </div>
      </div>
    </>
  )
}
