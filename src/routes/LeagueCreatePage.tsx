import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataClient } from '../data'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage } from '../lib/errors'

export function LeagueCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await dataClient.createLeague({ name, ownerId: user!.id })
      await queryClient.invalidateQueries({ queryKey: ['leagues', 'mine', user!.id] })
      navigate('/leagues')
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Create a league</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="league-name" className="mb-1 block text-sm font-medium text-slate-700">
            League name
          </label>
          <input
            id="league-name"
            type="text"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-brand-crimson">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue disabled:opacity-50"
        >
          Create league
        </button>
      </form>
    </div>
  )
}
