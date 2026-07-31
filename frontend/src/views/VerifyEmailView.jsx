import { useState } from 'react'
import { resendVerification, verifyEmail } from '../api.js'
import './VerifyEmailView.css'

export default function VerifyEmailView({ email, onVerified }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!code.trim()) {
      setError('Enter the code we emailed you')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const user = await verifyEmail(code.trim())
      onVerified(user)
    } catch (err) {
      setError(err.type === 'invalid_code' ? 'That code is wrong or has expired' : 'Something went wrong, try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setInfo(null)
    setResending(true)
    try {
      await resendVerification()
      setInfo('Sent a new code your way.')
    } catch {
      setError('Could not resend the code, try again in a moment')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="verify-view">
      <div className="verify-card">
        <h1 className="verify-title">Verify your email</h1>
        <p className="verify-subtitle">We sent a 6-digit code to {email}</p>

        <form className="verify-form" onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="verify-field"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />

          {error && <p className="verify-error">{error}</p>}
          {info && <p className="verify-info">{info}</p>}

          <button type="submit" className="verify-submit" disabled={submitting}>
            {submitting ? 'Checking...' : 'Verify'}
          </button>
        </form>

        <button type="button" className="verify-resend" onClick={handleResend} disabled={resending}>
          {resending ? 'Sending...' : "Didn't get it? Resend code"}
        </button>
      </div>
    </div>
  )
}
