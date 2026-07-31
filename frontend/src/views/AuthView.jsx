import { useState } from 'react'
import { login, signup } from '../api.js'
import './AuthView.css'

export default function AuthView({ onAuthenticated }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const switchMode = () => {
    setMode((current) => (current === 'signup' ? 'signin' : 'signup'))
    setError(null)
  }

  const handleSubmit = async (event) => {
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

  return (
    <div className="auth-view">
      <div className="auth-card">
        <h1 className="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>

        <form className="auth-form" onSubmit={handleSubmit}>
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
          <input
            id="auth-password"
            type="password"
            className="auth-field"
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'One moment...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button type="button" className="auth-switch" onClick={switchMode}>
          {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      </div>
    </div>
  )
}
