import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dataClient } from '../../data'
import { useAuth } from '../../hooks/useAuth'
import { useCurrentPeriod } from '../../hooks/useCurrentPeriod'
import { formatGameplayMode } from '../../lib/gameplayModes'
import type { League } from '../../types/domain'

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

async function shareInvite(league: League) {
  const text = `Join my "${league.name}" pick'em league! Use invite code ${league.inviteCode} at ${window.location.origin}/#/leagues/join`
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my pick'em league", text })
    } catch {
      // user dismissed the share sheet — nothing to do
    }
    return false
  }
  await navigator.clipboard.writeText(text)
  return true
}

export function LeagueCard({ league }: { league: League }) {
  const { user } = useAuth()
  const memberCountQuery = useQuery({
    queryKey: ['league-member-ids', league.id],
    queryFn: () => dataClient.getLeagueMemberIds(league.id),
  })
  const currentPeriodQuery = useCurrentPeriod(league.sport)
  const currentPeriod = currentPeriodQuery.data
  const [copied, setCopied] = useState(false)

  // Standings only have rows for members with a scored pick, so members are looked up
  // separately and defaulted to 0 — otherwise a member with nothing scored yet would throw
  // off the rank (or be missing from it entirely) rather than just sitting in last place.
  const standingsQuery = useQuery({
    queryKey: ['standings', league.id, currentPeriod?.seasonYear],
    queryFn: () => dataClient.getStandings(league.id, currentPeriod!.seasonYear),
    enabled: !!currentPeriod,
  })
  const myStanding = (() => {
    if (!user || !memberCountQuery.data || !standingsQuery.data) return undefined
    const pointsByUser = new Map(standingsQuery.data.map((s) => [s.userId, s.totalPoints]))
    const ranked = memberCountQuery.data
      .map((userId) => ({ userId, points: pointsByUser.get(userId) ?? 0 }))
      .sort((a, b) => b.points - a.points)
    const rankIndex = ranked.findIndex((r) => r.userId === user.id)
    return rankIndex === -1 ? undefined : { rank: rankIndex + 1, points: ranked[rankIndex].points }
  })()

  async function handleInvite() {
    const didCopy = await shareInvite(league)
    if (didCopy) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{league.name}</h3>
        <span className="text-sm text-slate-500">
          {memberCountQuery.data ? `${memberCountQuery.data.length} members` : ' '}
        </span>
      </div>
      <p className="text-sm text-slate-500">{formatGameplayMode(league.gameplayMode)}</p>
      <button
        type="button"
        onClick={handleInvite}
        className="mt-1 text-sm font-medium text-brand-blue hover:underline"
      >
        {copied ? 'Copied invite!' : 'Invite'}
      </button>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {currentPeriod && (
            <>
              <Link
                to={`/leagues/${league.id}/weeks/${currentPeriod.id}`}
                className="text-brand-blue hover:underline"
              >
                Make picks
              </Link>
              <span className="text-slate-300">|</span>
              <Link
                to={`/leagues/${league.id}/league-picks/${currentPeriod.id}`}
                className="text-brand-blue hover:underline"
              >
                League picks
              </Link>
              <span className="text-slate-300">|</span>
            </>
          )}
          <Link to={`/leagues/${league.id}/standings`} className="text-brand-blue hover:underline">
            Standings
          </Link>
        </div>
        {myStanding && (
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {ordinal(myStanding.rank)} Place: {myStanding.points} pts
          </span>
        )}
      </div>
    </div>
  )
}
