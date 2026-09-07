import { NavLink } from 'react-router-dom'

interface LeagueTabsProps {
  leagueId: string
  /** Picks and League picks are per-week; omit while the current week hasn't resolved yet
   * to render those two tabs disabled rather than linking to a route missing its param. */
  periodId: string | undefined
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-brand-navy text-brand-navy' : 'border-transparent text-slate-500 hover:text-slate-700'
  }`

const disabledTabClass = 'border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-slate-300'

export function LeagueTabs({ leagueId, periodId }: LeagueTabsProps) {
  return (
    <nav className="mb-4 flex gap-5 border-b border-slate-200">
      {periodId ? (
        <>
          <NavLink to={`/leagues/${leagueId}/weeks/${periodId}`} className={tabClass}>
            Picks
          </NavLink>
          <NavLink to={`/leagues/${leagueId}/league-picks/${periodId}`} className={tabClass}>
            League picks
          </NavLink>
        </>
      ) : (
        <>
          <span className={disabledTabClass}>Picks</span>
          <span className={disabledTabClass}>League picks</span>
        </>
      )}
      <NavLink to={`/leagues/${leagueId}/standings`} className={tabClass}>
        Standings
      </NavLink>
    </nav>
  )
}
