import { useState } from 'react'
import './InfoTooltip.css'

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)

  return (
    <span
      className="info-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button type="button" className="info-tooltip-trigger" aria-label={text}>
        i
      </button>
      {open && (
        <span className="info-tooltip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
