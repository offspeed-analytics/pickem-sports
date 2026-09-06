import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../data/supabase/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useInvalidateProfile, useProfile } from '../hooks/useProfile'
import { useTeams } from '../hooks/useTeams'
import { getErrorMessage } from '../lib/errors'

export function OnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const profileQuery = useProfile(user?.id ?? null)
  const invalidateProfile = useInvalidateProfile()
  const teamsQuery = useTeams('NFL')

  const [username, setUsername] = useState('')
  const [favoriteTeamId, setFavoriteTeamId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!authLoading && !user) return <Navigate to="/login" replace />
  if (profileQuery.data) return <Navigate to="/leagues" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: user.id, username })
      if (profileError) throw profileError

      if (favoriteTeamId) {
        const { error: favoriteError } = await supabase
          .from('profile_favorite_teams')
          .insert({ user_id: user.id, sport: 'NFL', team_id: favoriteTeamId })
        if (favoriteError) throw favoriteError
      }

      invalidateProfile(user.id)
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Set up your profile</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            minLength={3}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="favorite-team" className="mb-1 block text-sm font-medium text-slate-700">
            Favorite NFL team
          </label>
          <select
            id="favorite-team"
            value={favoriteTeamId}
            onChange={(e) => setFavoriteTeamId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="">No preference</option>
            {teamsQuery.data?.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-brand-crimson">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue disabled:opacity-50"
        >
          Continue
        </button>
      </form>
    </div>
  )
}
