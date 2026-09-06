import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dataClient } from '../../data'
import type { League } from '../../types/domain'

async function shareInvite(league: League) {
  const text = `Join my "${league.name}" pick'em league! Use invite code ${league.inviteCode} at ${window.location.origin}/leagues/join`
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
  const memberCountQuery = useQuery({
    queryKey: ['league-member-ids', league.id],
    queryFn: () => dataClient.getLeagueMemberIds(league.id),
  })
  const currentPeriodQuery = useQuery({
    queryKey: ['current-period', league.sport],
    queryFn: () => dataClient.getCurrentPeriod(league.sport),
  })
  const currentPeriod = currentPeriodQuery.data
  const [copied, setCopied] = useState(false)

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
      <button
        type="button"
        onClick={handleInvite}
        className="mt-1 text-sm font-medium text-brand-blue hover:underline"
      >
        {copied ? 'Copied invite!' : 'Invite'}
      </button>
      <div className="mt-3 flex gap-3 text-sm font-medium">
        {currentPeriod && (
          <Link to={`/leagues/${league.id}/weeks/${currentPeriod.id}`} className="text-brand-blue hover:underline">
            Make picks
          </Link>
        )}
        <Link to={`/leagues/${league.id}/standings`} className="text-brand-blue hover:underline">
          Standings
        </Link>
      </div>
    </div>
  )
}
