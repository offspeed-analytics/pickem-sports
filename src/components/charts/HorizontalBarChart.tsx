import { useState } from 'react'
import { ChartTooltip } from './ChartTooltip'

export interface HorizontalBarChartRow {
  id: string
  label: string
  logoUrl?: string
  value: number
  valueLabel: string
  /** Shown as a styled hover tooltip, headed by this row's label/name. */
  detailLines: string[]
}

interface HorizontalBarChartProps {
  rows: HorizontalBarChartRow[]
  tone: 'good' | 'critical'
}

/** Ranked bars use the site's own brand tokens (src/styles/index.css) rather than a generic
 * status palette, so "good"/"critical" read as states of the same visual language as the rest
 * of the app -- brand-teal for the winners list, brand-crimson (already the app's error/alert
 * color) for the losers list. Plain HTML/CSS bars rather than SVG: a handful of ranked rows
 * don't need chart geometry, just a sized fill. */
const TONE_COLOR: Record<'good' | 'critical', string> = {
  good: '#3b9797',
  critical: '#bf092f',
}

export function HorizontalBarChart({ rows, tone }: HorizontalBarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Not enough data yet.</p>
  }

  const maxValue = Math.max(...rows.map((r) => r.value), 1)
  const color = TONE_COLOR[tone]

  return (
    <ul className="space-y-2">
      {rows.map((row, i) => (
        <li
          key={row.id}
          className="relative flex items-center gap-2"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          {row.logoUrl && <img src={row.logoUrl} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />}
          <span className="w-10 flex-shrink-0 text-xs font-medium text-slate-700">{row.label}</span>
          <div className="relative h-4 flex-1 rounded-sm bg-slate-100">
            <div
              className="h-4 rounded-sm"
              style={{ width: `${Math.max((row.value / maxValue) * 100, 4)}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-24 flex-shrink-0 whitespace-nowrap text-right text-xs font-semibold text-slate-900">
            {row.valueLabel}
          </span>
          {hovered === i && (
            <ChartTooltip
              style={{ left: '2.5rem', top: '100%', marginTop: '0.25rem' }}
              heading={row.label}
              lines={row.detailLines}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
