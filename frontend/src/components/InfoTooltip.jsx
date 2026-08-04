import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './InfoTooltip.css'

const BUBBLE_WIDTH = 210
const VIEWPORT_MARGIN = 10

export default function InfoTooltip({ text }) {
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)

  // fixed-position + measured on show, rather than centering with plain CSS,
  // so the bubble stays on-screen no matter where in the row/column the
  // trigger sits (a centered bubble would spill past the panel edge for the
  // rightmost stat tile otherwise). portaled to <body> because the dashboard
  // panel is centered via CSS transform, which makes it the containing block
  // for any position:fixed descendant instead of the viewport - without the
  // portal, the bubble's coordinates would resolve against the wrong box and
  // its own overflow:hidden would just clip the bubble out of view entirely
  const show = () => {
    const rect = triggerRef.current.getBoundingClientRect()
    const centered = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2
    const left = Math.min(
      Math.max(centered, VIEWPORT_MARGIN),
      window.innerWidth - BUBBLE_WIDTH - VIEWPORT_MARGIN,
    )
    setPosition({ top: rect.bottom + 7, left })
  }
  const hide = () => setPosition(null)

  return (
    <span className="info-tooltip" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <button ref={triggerRef} type="button" className="info-tooltip-trigger" aria-label={text}>
        i
      </button>
      {position &&
        createPortal(
          <span
            className="info-tooltip-bubble"
            role="tooltip"
            style={{ top: position.top, left: position.left }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}
