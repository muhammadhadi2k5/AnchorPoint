import { useEffect, useRef, useState } from 'react'
import logoIcon from '../../elements/anchorpoint-icon.png'
import './LandingView.css'

const STEPS = [
  {
    title: 'Upload your documents',
    body: 'Drag and drop PDFs, spreadsheets, or scanned pages. Each dataset stays completely separate from the others.',
  },
  {
    title: 'We read them for you',
    body: 'Text gets pulled out and chunked. Scanned or image-heavy pages fall back to OCR automatically, no setup needed.',
  },
  {
    title: 'Ask anything',
    body: 'Get answers pulled straight from your own documents, with the exact source and page cited for every claim.',
  },
  {
    title: 'Stay in control',
    body: 'Rename, pin, delete a dataset, or add documents to existing datasets anytime. Nothing changes in your datasets except what you ask for.',
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

export default function LandingView({ onSignIn }) {
  const howItWorksRef = useRef(null)
  const [howActive, setHowActive] = useState(false)

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // the how-it-works section switches to full coral once it's substantially
  // in view, so the horizon wave at the bottom of the hero reads as the
  // start of that same coral field rather than a one-off decoration - and
  // it flips back on scroll-up so the transition works in both directions
  useEffect(() => {
    const el = howItWorksRef.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setHowActive(entry.isIntersecting),
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing-view">
      <section className="landing-hero">
        <div className="landing-wave" aria-hidden="true" />

        <div className="landing-hero-content">
          <img src={logoIcon} className="landing-logo" alt="" />
          <h1 className="landing-word">
             ANCHOR<span className="accent">POINT</span>
          </h1>
          <p className="landing-tagline">Ask your documents anything</p>

          <button type="button" className="landing-signin" onClick={onSignIn}>
            Sign in
          </button>
        </div>

        <button type="button" className="landing-scroll-hint" onClick={scrollToHowItWorks}>
          <span>How it works</span>
          <span className="scroll-arrow" aria-hidden="true">⌄</span>
        </button>
      </section>

      <section className={`landing-how${howActive ? ' how-active' : ''}`} ref={howItWorksRef}>
        <p className="landing-how-eyebrow">The journey</p>
        <h2 className="landing-how-title">From documents to answers</h2>

        <div className="landing-steps">
          {STEPS.map((step, index) => (
            <RevealStep key={step.title} step={step} index={index} />
          ))}
        </div>

        <button type="button" className="landing-cta" onClick={onSignIn}>
          Get started
        </button>
      </section>
    </div>
  )
}
