import type { ProfileInfo } from '../../hooks/useProfilesByIds'

interface StandingsTableProps {
  title: string
  rows: { userId: string; points: number }[]
  profiles: Map<string, ProfileInfo>
}

export function StandingsTable({ title, rows, profiles }: StandingsTableProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No points yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2 font-medium">#</th>
              <th className="pb-2 font-medium">Member</th>
              <th className="pb-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const profile = profiles.get(row.userId)
              return (
                <tr key={row.userId} className="border-t border-slate-100">
                  <td className="py-2 text-slate-500">{i + 1}</td>
                  <td className="py-2 font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      {profile?.favoriteTeamLogoUrl && (
                        <img src={profile.favoriteTeamLogoUrl} alt="" className="h-5 w-5 object-contain" />
                      )}
                      {profile?.username ?? 'Unknown'}
                    </span>
                  </td>
                  <td className="py-2 text-right text-slate-900">{row.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
