import { useState } from 'react'
import { forgotPassword, login, resetPassword, signup } from '../api.js'
import './AuthView.css'

function PasswordField({ id, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-password-row">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className="auth-field"
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

export default function AuthView({ onAuthenticated }) {
  // 'signin' | 'signup' | 'forgot' (ask for email) | 'reset' (code + new password)
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const switchMode = (next) => {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const handleSignInUp = async (event) => {
    event.preventDefault()

    if (!email.trim() || !password) {
      setError('Fill in both fields to continue')
      return
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password needs to be at least 8 characters')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const user = mode === 'signup' ? await signup(email.trim(), password) : await login(email.trim(), password)
      onAuthenticated(user)
    } catch (err) {
      if (err.type === 'email_taken') setError('An account with that email already exists')
      else if (err.type === 'invalid_credentials') setError('Wrong email or password')
      else if (err.type === 'invalid_email') setError("That email doesn't look right")
      else if (err.type === 'password_too_short') setError('Password needs to be at least 8 characters')
      else setError('Something went wrong, try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotSubmit = async (event) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Enter your email to continue')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await forgotPassword(email.trim())
      setInfo(`If an account exists for ${email.trim()}, a code is on its way.`)
      setMode('reset')
    } catch {
      setError('Something went wrong, try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetSubmit = async (event) => {
    event.preventDefault()
    if (!code.trim() || !newPassword) {
      setError('Fill in both fields to continue')
      return
    }
    if (newPassword.length < 8) {
      setError('Password needs to be at least 8 characters')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const user = await resetPassword(email.trim(), code.trim(), newPassword)
      onAuthenticated(user)
    } catch (err) {
      if (err.type === 'invalid_code') setError('That code is wrong or has expired')
      else if (err.type === 'password_too_short') setError('Password needs to be at least 8 characters')
      else setError('Something went wrong, try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="auth-view">
        <div className="auth-card">
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-subtitle">Enter your email and we'll send you a code.</p>

          <form className="auth-form" onSubmit={handleForgotSubmit}>
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              className="auth-field"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'One moment...' : 'Send code'}
            </button>
          </form>

          <button type="button" className="auth-switch" onClick={() => switchMode('signin')}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'reset') {
    return (
      <div className="auth-view">
        <div className="auth-card">
          <h1 className="auth-title">Check your email</h1>
          {info && <p className="auth-subtitle">{info}</p>}

          <form className="auth-form" onSubmit={handleResetSubmit}>
            <label className="auth-label" htmlFor="reset-code">Code</label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="auth-field"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            <label className="auth-label" htmlFor="reset-password">New password</label>
            <PasswordField
              id="reset-password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'One moment...' : 'Reset password'}
            </button>
          </form>

          <button type="button" className="auth-switch" onClick={() => switchMode('signin')}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-view">
      <div className="auth-card">
        <h1 className="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>

        <form className="auth-form" onSubmit={handleSignInUp}>
          <label className="auth-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            className="auth-field"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="auth-label" htmlFor="auth-password">Password</label>
          <PasswordField
            id="auth-password"
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === 'signin' && (
            <button type="button" className="auth-forgot-link" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'One moment...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button type="button" className="auth-switch" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}>
          {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      </div>
    </div>
  )
}
