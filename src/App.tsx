import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LeagueJoinCreatePage } from './routes/LeagueJoinCreatePage'
import { LeagueListPage } from './routes/LeagueListPage'
import { LoginPage } from './routes/LoginPage'
import { OnboardingPage } from './routes/OnboardingPage'
import { StandingsPage } from './routes/StandingsPage'
import { WeekPicksPage } from './routes/WeekPicksPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/leagues" replace />} />
        <Route path="/leagues" element={<LeagueListPage />} />
        <Route path="/leagues/join" element={<LeagueJoinCreatePage />} />
        <Route path="/leagues/:leagueId/weeks/:weekNumber" element={<WeekPicksPage />} />
        <Route path="/leagues/:leagueId/standings" element={<StandingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
