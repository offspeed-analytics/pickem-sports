import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../data/supabase/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useInvalidateProfile, useProfile } from '../hooks/useProfile'
import { useTeams } from '../hooks/useTeams'

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  )
}

function UsernameSection({ userId, currentUsername }: { userId: string; currentUsername: string }) {
  const invalidateProfile = useInvalidateProfile()
  const [username, setUsername] = useState(currentUsername)
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    setSubmitting(true)
    const { error } = await supabase.from('profiles').update({ username }).eq('id', userId)
    setSubmitting(false)
    if (error) {
      setStatus({
        type: 'error',
        message: error.code === '23505' ? 'That username is already taken.' : error.message,
      })
      return
    }
    invalidateProfile(userId)
    setStatus({ type: 'success', message: 'Username updated.' })
  }

  return (
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
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      {status && (
        <p className={`text-sm ${status.type === 'error' ? 'text-brand-crimson' : 'text-green-600'}`}>
          {status.message}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue disabled:opacity-50"
      >
        Save username
      </button>
    </form>
  )
}

function FavoriteTeamSection({ userId }: { userId: string }) {
  const teamsQuery = useTeams('NFL')
  const currentFavoriteQuery = useQuery({
    queryKey: ['favorite-team', userId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('profile_favorite_teams')
        .select('team_id')
        .eq('user_id', userId)
        .eq('sport', 'NFL')
        .maybeSingle()
      if (error) throw error
      return data?.team_id ?? null
    },
  })

  const [editedFavoriteTeamId, setEditedFavoriteTeamId] = useState<string | null>(null)
  const favoriteTeamId = editedFavoriteTeamId ?? currentFavoriteQuery.data ?? ''
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await supabase
      .from('profile_favorite_teams')
      .upsert(
        { user_id: userId, sport: 'NFL', team_id: favoriteTeamId },
        { onConflict: 'user_id,sport' },
      )
    setSubmitting(false)
    setStatus('success')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="favorite-team" className="mb-1 block text-sm font-medium text-slate-700">
          Favorite NFL team
        </label>
        <select
          id="favorite-team"
          value={favoriteTeamId}
          onChange={(e) => setEditedFavoriteTeamId(e.target.value)}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">No preference</option>
          {teamsQuery.data?.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>
      {status === 'success' && <p className="text-sm text-green-600">Favorite team updated.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue disabled:opacity-50"
      >
        Save favorite team
      </button>
    </form>
  )
}

function PasswordSection() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    if (password !== confirmPassword) {
      setStatus({ type: 'error', message: "Passwords don't match." })
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setStatus({ type: 'error', message: error.message })
      return
    }
    setPassword('')
    setConfirmPassword('')
    setStatus({ type: 'success', message: 'Password updated.' })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-700">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      {status && (
        <p className={`text-sm ${status.type === 'error' ? 'text-brand-crimson' : 'text-green-600'}`}>
          {status.message}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue disabled:opacity-50"
      >
        Update password
      </button>
    </form>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const profileQuery = useProfile(user!.id)

  if (profileQuery.isLoading || !profileQuery.data) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      <SettingsSection title="Username">
        <UsernameSection userId={user!.id} currentUsername={profileQuery.data.username} />
      </SettingsSection>
      <SettingsSection title="Favorite team">
        <FavoriteTeamSection userId={user!.id} />
      </SettingsSection>
      <SettingsSection title="Password">
        <PasswordSection />
      </SettingsSection>
    </div>
  )
}
