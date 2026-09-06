import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import { LeagueCreatePage } from './routes/LeagueCreatePage'
import { LeagueJoinPage } from './routes/LeagueJoinPage'
import { LeagueListPage } from './routes/LeagueListPage'
import { LoginPage } from './routes/LoginPage'
import { OnboardingPage } from './routes/OnboardingPage'
import { SettingsPage } from './routes/SettingsPage'
import { StandingsPage } from './routes/StandingsPage'
import { WeekPicksPage } from './routes/WeekPicksPage'

function LoadingScreen() {
  return <div className="p-6 text-sm text-slate-500">Loading…</div>
}

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireProfile() {
  const { user } = useAuth()
  const profileQuery = useProfile(user!.id)
  if (profileQuery.isLoading) return <LoadingScreen />
  if (!profileQuery.data) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<RequireProfile />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/leagues" replace />} />
            <Route path="/leagues" element={<LeagueListPage />} />
            <Route path="/leagues/new" element={<LeagueCreatePage />} />
            <Route path="/leagues/join" element={<LeagueJoinPage />} />
            <Route path="/leagues/:leagueId/weeks/:weekNumber" element={<WeekPicksPage />} />
            <Route path="/leagues/:leagueId/standings" element={<StandingsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
