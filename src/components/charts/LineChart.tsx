import { useMemo, useState } from 'react'
import { ChartTooltip, clampTooltipLeft } from './ChartTooltip'
import { useContainerWidth } from './useContainerWidth'

export interface LineChartPoint {
  x: string
  y: number | null
  /** Shown above the point at all times, not just on hover. Omit (or leave undefined) for a
   * null/gap point, which has no mark to label. */
  valueLabel?: string
  tooltip: string[]
}

interface LineChartProps {
  points: LineChartPoint[]
  color?: string
}

const HEIGHT = 200
// Wide enough that a value label ("100%") or x-axis label ("Wk 12") centered on the first/last
// point doesn't get clipped by the SVG's own edge -- a plain point-gap margin isn't enough once
// there's text centered on the point itself.
const PADDING_LEFT = 24
const PADDING_RIGHT = 24
const PADDING_TOP = 28
const PADDING_BOTTOM = 24

/** Trend-over-time chart: one 2px line, a direct value label above each point (the point count
 * here is small -- a season's worth of weeks, not a dense series -- so labeling each one stays
 * readable), gaps (not interpolated segments or zeros) wherever a point's value is null -- e.g.
 * a week where every pick is still pending. */
export function LineChart({ points, color = '#16476a' }: LineChartProps) {
  const { ref, width } = useContainerWidth()
  const [hovered, setHovered] = useState<number | null>(null)

  const plotLeft = PADDING_LEFT
  const plotRight = width - PADDING_RIGHT
  const plotTop = PADDING_TOP
  const plotBottom = HEIGHT - PADDING_BOTTOM
  const plotHeight = plotBottom - plotTop

  const { minValue, valueRange } = useMemo(() => {
    const values = points.map((p) => p.y).filter((y): y is number => y !== null)
    const maxValue = values.length > 0 ? Math.max(...values) : 1
    const minValue = values.length > 0 ? Math.min(0, ...values) : 0
    return { minValue, valueRange: maxValue - minValue || 1 }
  }, [points])

  const step = points.length > 1 ? (plotRight - plotLeft) / (points.length - 1) : 0
  const positioned = useMemo(
    () =>
      points.map((p, i) => ({
        ...p,
        plotX: plotLeft + i * step,
        plotY: p.y === null ? null : plotBottom - ((p.y - minValue) / valueRange) * plotHeight,
      })),
    [points, step, plotLeft, plotBottom, plotHeight, minValue, valueRange],
  )

  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No data yet.</p>
  }

  const segments: { plotX: number; plotY: number }[][] = []
  let current: { plotX: number; plotY: number }[] = []
  for (const p of positioned) {
    if (p.plotY === null) {
      if (current.length > 0) segments.push(current)
      current = []
    } else {
      current.push({ plotX: p.plotX, plotY: p.plotY })
    }
  }
  if (current.length > 0) segments.push(current)

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const index = step > 0 ? Math.round(relativeX / step) : 0
    setHovered(Math.min(Math.max(index, 0), points.length - 1))
  }

  const hoveredPoint = hovered !== null ? positioned[hovered] : undefined

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={plotLeft}
            x2={plotRight}
            y1={plotTop + plotHeight * (1 - fraction)}
            y2={plotTop + plotHeight * (1 - fraction)}
            stroke="#e1e0d9"
            strokeWidth={1}
          />
        ))}
        <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="#c3c2b7" strokeWidth={1} />

        {segments.map((segment, i) => (
          <polyline
            key={i}
            points={segment.map((p) => `${p.plotX},${p.plotY}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {positioned.map(
          (p, i) =>
            p.plotY !== null && (
              <g key={i}>
                <circle cx={p.plotX} cy={p.plotY} r={hovered === i ? 5 : 4} fill={color} stroke="#fcfcfb" strokeWidth={1.5} />
                {p.valueLabel && (
                  <text
                    x={p.plotX}
                    y={Math.max(p.plotY - 10, plotTop - 12)}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#0b0b0b"
                  >
                    {p.valueLabel}
                  </text>
                )}
              </g>
            ),
        )}
        {hoveredPoint && (
          <line x1={hoveredPoint.plotX} x2={hoveredPoint.plotX} y1={plotTop} y2={plotBottom} stroke="#c3c2b7" strokeWidth={1} strokeDasharray="3,3" />
        )}
        {positioned.map((p, i) => (
          <text key={i} x={p.plotX} y={plotBottom + 16} textAnchor="middle" fontSize={11} fill="#898781">
            {p.x}
          </text>
        ))}
        <rect
          x={plotLeft}
          y={plotTop}
          width={Math.max(plotRight - plotLeft, 0)}
          height={plotHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
        />
      </svg>
      {hoveredPoint && (
        <ChartTooltip
          style={{ left: clampTooltipLeft(hoveredPoint.plotX - 60, width), top: 0 }}
          heading={hoveredPoint.x}
          lines={hoveredPoint.tooltip}
          emptyText="No picks yet"
        />
      )}
    </div>
  )
}
