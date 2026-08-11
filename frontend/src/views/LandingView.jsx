import { useEffect, useRef, useState } from 'react'
import logoIcon from '../assets/anchorpoint-icon.png'
import './LandingView.css'

const STEPS = [
  {
    title: 'Upload your documents',
    body: 'Drag and drop PDFs, spreadsheets, or scanned pages. Each chat stays completely separate from the others.',
  },
  {
    title: 'We read them for you',
    body: 'Text gets pulled out and chunked. Scanned or image-heavy pages fall back to OCR automatically, Or simply parse a document and export it.',
  },
  {
    title: 'Ask anything',
    body: 'Get answers pulled straight from your own documents, with the exact source and page cited for every claim.',
  },
  {
    title: 'Stay in control',
    body: 'Rename, pin, delete a chat, or add documents to existing chats anytime. Nothing changes in your chats except what you ask for.',
  },
]

function RevealStep({ step, index }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`step${visible ? ' visible' : ''}`}>
      <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
      <h3 className="step-title">{step.title}</h3>
      <p className="step-body">{step.body}</p>
    </div>
  )
}

export default function LandingView({ onStart, theme, onToggleTheme }) {
  const howItWorksRef = useRef(null)

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing-view">
      <section className="landing-hero">
        <div className="landing-glow" aria-hidden="true" />
        <div className="landing-wave-top" aria-hidden="true" />
        <div className="landing-wave" aria-hidden="true" />

        <button
          type="button"
          className="landing-theme-toggle"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="4.5" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="10" y1="1" x2="10" y2="3.2" />
                <line x1="10" y1="16.8" x2="10" y2="19" />
                <line x1="1" y1="10" x2="3.2" y2="10" />
                <line x1="16.8" y1="10" x2="19" y2="10" />
                <line x1="3.9" y1="3.9" x2="5.4" y2="5.4" />
                <line x1="14.6" y1="14.6" x2="16.1" y2="16.1" />
                <line x1="3.9" y1="16.1" x2="5.4" y2="14.6" />
                <line x1="14.6" y1="5.4" x2="16.1" y2="3.9" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M17.3 12.8A7.5 7.5 0 0 1 7.2 2.7a7.5 7.5 0 1 0 10.1 10.1Z"
              />
            </svg>
          )}
        </button>

        <div className="landing-hero-content">
          <img src={logoIcon} className="landing-logo" alt="" />
          <h1 className="landing-word">
             ANCHOR<span className="accent">POINT</span>
          </h1>
          <p className="landing-tagline">Ask your documents anything</p>

          <button type="button" className="landing-start" onClick={onStart}>
            Start
          </button>
        </div>

        <button type="button" className="landing-scroll-hint" onClick={scrollToHowItWorks}>
          <span>How it works</span>
          <span className="scroll-arrow" aria-hidden="true">⌄</span>
        </button>
      </section>

      <section className="landing-how" ref={howItWorksRef}>
        <div className="landing-how-inner">
          <p className="landing-how-eyebrow">The journey</p>
          <h2 className="landing-how-title">From documents to answers</h2>

          <div className="landing-steps">
            {STEPS.map((step, index) => (
              <RevealStep key={step.title} step={step} index={index} />
            ))}
          </div>

          <button type="button" className="landing-cta" onClick={onStart}>
            Get started
          </button>
        </div>
      </section>
    </div>
  )
}
