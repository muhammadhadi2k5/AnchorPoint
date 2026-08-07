import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './InfoTooltip.css'

const BUBBLE_WIDTH = 210
const VIEWPORT_MARGIN = 10

export default function InfoTooltip({ text }) {
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)

  // measures its own spot when it opens instead of just centering with css, so it stays on
  // screen no matter where the trigger is, and portals to <body> since the dashboard panel is centered with a css transform, which would otherwise clip it away
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
