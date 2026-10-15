import type { CSSProperties } from 'react'

const TOOLTIP_WIDTH = 150

/** Clamps a tooltip's left offset so a point near either edge of the chart doesn't push the
 * tooltip card outside the chart's own container. */
export function clampTooltipLeft(x: number, containerWidth: number): number {
  return Math.min(Math.max(x, 0), Math.max(containerWidth - TOOLTIP_WIDTH, 0))
}

interface ChartTooltipProps {
  style: CSSProperties
  heading: string
  lines: string[]
  emptyText?: string
}

/** Shared hover-tooltip card for all chart primitives. Callers own their own positioning --
 * clampTooltipLeft for point-relative charts (bar/line), static offsets for row-relative ones
 * (the horizontal leaderboard bars) -- but share the same look and empty-state handling. */
export function ChartTooltip({ style, heading, lines, emptyText }: ChartTooltipProps) {
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-md"
      style={style}
    >
      <div className="font-semibold text-slate-900">{heading}</div>
      {lines.length > 0
        ? lines.map((line) => (
            <div key={line} className="text-slate-600">
              {line}
            </div>
          ))
        : emptyText && <div className="text-slate-600">{emptyText}</div>}
    </div>
  )
}
