import { useMemo, useState } from 'react'
import { ChartTooltip, clampTooltipLeft } from './ChartTooltip'
import { estimateTextWidth, labelStride, labelsCollide } from './labelLayout'
import { useContainerWidth } from './useContainerWidth'

export interface LineChartPoint {
  x: string
  /** Terser x-axis label (e.g. "12" for "Wk 12") used once the points get too close together
   * for `x` to fit. Falls back to `x`. */
  shortX?: string
  y: number | null
  /** Shown above the point at all times, not just on hover. Omit (or leave undefined) for a
   * null/gap point, which has no mark to label. */
  valueLabel?: string
  tooltip: string[]
}

interface LineChartProps {
  points: LineChartPoint[]
  color?: string
  /** Title under the x axis in compact mode, where the axis shows `shortX` (e.g. "Week"). */
  compactXAxisTitle?: string
  /** Formats the y-axis gridline values shown in compact mode. */
  formatYAxis?: (value: number) => string
  /** Fixed top of the y scale in compact mode, so the axis reads in round numbers (e.g. 100 for
   * percentages) instead of whatever the highest point happens to be. */
  compactYMax?: number
}

const HEIGHT = 200
// Wide enough that a value label ("100%") or x-axis label ("Wk 12") centered on the first/last
// point doesn't get clipped by the SVG's own edge -- a plain point-gap margin isn't enough once
// there's text centered on the point itself.
const PADDING_LEFT = 24
const PADDING_RIGHT = 24
const PADDING_TOP = 28
const PADDING_BOTTOM = 24
// Compact mode: room on the left for y-axis values, below for the axis title.
const COMPACT_PADDING_LEFT = 36
const COMPACT_PADDING_RIGHT = 16
const COMPACT_PADDING_BOTTOM = 36
const FONT_SIZE = 11

/** Trend-over-time chart: one 2px line, a direct value label above each point (the point count
 * here is small -- a season's worth of weeks, not a dense series -- so labeling each one stays
 * readable), gaps (not interpolated segments or zeros) wherever a point's value is null -- e.g.
 * a week where every pick is still pending.
 *
 * Once the points are too close for those labels (late season on a portrait phone) it switches
 * to a compact layout: a y-axis scale instead of a label on every point (only the latest and the
 * hovered/tapped point keep theirs), and `shortX` axis labels thinned to every Nth point. */
export function LineChart({
  points,
  color = '#16476a',
  compactXAxisTitle,
  formatYAxis = (v) => v.toFixed(0),
  compactYMax,
}: LineChartProps) {
  const { ref, width } = useContainerWidth()
  const [hovered, setHovered] = useState<number | null>(null)

  const widestLabel = Math.max(
    0,
    ...points.map((p) => Math.max(estimateTextWidth(p.x, FONT_SIZE), estimateTextWidth(p.valueLabel ?? '', FONT_SIZE))),
  )
  const fullStep = points.length > 1 ? (width - PADDING_LEFT - PADDING_RIGHT) / (points.length - 1) : Infinity
  const compact = labelsCollide(widestLabel, fullStep)

  const plotLeft = compact ? COMPACT_PADDING_LEFT : PADDING_LEFT
  const plotRight = width - (compact ? COMPACT_PADDING_RIGHT : PADDING_RIGHT)
  const plotTop = PADDING_TOP
  const plotBottom = HEIGHT - (compact ? COMPACT_PADDING_BOTTOM : PADDING_BOTTOM)
  const plotHeight = plotBottom - plotTop

  const { minValue, valueRange } = useMemo(() => {
    const values = points.map((p) => p.y).filter((y): y is number => y !== null)
    const dataMax = values.length > 0 ? Math.max(...values) : 1
    const maxValue = compact && compactYMax !== undefined ? Math.max(compactYMax, dataMax) : dataMax
    const minValue = values.length > 0 ? Math.min(0, ...values) : 0
    return { minValue, valueRange: maxValue - minValue || 1 }
  }, [points, compact, compactYMax])

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

  const xLabel = (p: LineChartPoint) => (compact ? (p.shortX ?? p.x) : p.x)
  const xLabelStride = compact
    ? labelStride(Math.max(...points.map((p) => estimateTextWidth(xLabel(p), FONT_SIZE))), step)
    : 1
  let latestIndex = -1
  positioned.forEach((p, i) => {
    if (p.plotY !== null) latestIndex = i
  })
  const showValueLabel = (i: number) => !compact || i === latestIndex || i === hovered

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
          <g key={fraction}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={plotTop + plotHeight * (1 - fraction)}
              y2={plotTop + plotHeight * (1 - fraction)}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
            {compact && (
              <text
                x={plotLeft - 6}
                y={plotTop + plotHeight * (1 - fraction)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={FONT_SIZE}
                fill="#898781"
              >
                {formatYAxis(minValue + valueRange * fraction)}
              </text>
            )}
          </g>
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
                {p.valueLabel && showValueLabel(i) && (
                  <text
                    x={p.plotX}
                    y={Math.max(p.plotY - 10, plotTop - 12)}
                    textAnchor={compact && i === points.length - 1 ? 'end' : 'middle'}
                    fontSize={FONT_SIZE}
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
        {positioned.map(
          (p, i) =>
            // Counted back from the latest point so the current week always keeps its label.
            (points.length - 1 - i) % xLabelStride === 0 && (
              <text key={i} x={p.plotX} y={plotBottom + 16} textAnchor="middle" fontSize={FONT_SIZE} fill="#898781">
                {xLabel(p)}
              </text>
            ),
        )}
        {compact && compactXAxisTitle && (
          <text x={(plotLeft + plotRight) / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={FONT_SIZE} fill="#898781">
            {compactXAxisTitle}
          </text>
        )}
        <rect
          x={plotLeft}
          y={plotTop}
          width={Math.max(plotRight - plotLeft, 0)}
          height={plotHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onPointerDown={handleMove}
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
