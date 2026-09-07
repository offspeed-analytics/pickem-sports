import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage } from '../lib/errors'

export function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [signedUp, setSignedUp] = useState(false)

  if (!loading && user) return <Navigate to="/leagues" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'sign-in') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setSignedUp(true)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const brandHeader = (
    <div className="mb-6 flex flex-col items-center text-center">
      <h1 className="text-2xl font-bold text-slate-900">Pick'em Sports</h1>
      <p className="mt-1 text-sm text-slate-500">Compete with friends, every week.</p>
    </div>
  )

  if (signedUp) {
    return (
      <div className="mx-auto mt-16 max-w-sm px-4">
        {brandHeader}
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Check your email</h2>
          <p className="text-sm text-slate-500">
            We sent a confirmation link to {email}. Confirm it, then come back and sign in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      {brandHeader}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          {mode === 'sign-in' ? 'Log in' : 'Create an account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-brand-crimson">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue disabled:opacity-50"
          >
            {mode === 'sign-in' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          className="mt-4 text-sm text-slate-500 hover:text-slate-700"
        >
          {mode === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  )
}
