import { useState } from 'react'
import { ChartTooltip, clampTooltipLeft } from './ChartTooltip'
import { estimateTextWidth, labelsCollide } from './labelLayout'
import { useContainerWidth } from './useContainerWidth'

export interface BarChartDatum {
  label: string
  value: number
  /** Shown above the bar at all times, not just on hover -- e.g. "67%". */
  valueLabel: string
  tooltip: string[]
}

interface BarChartProps {
  data: BarChartDatum[]
  color?: string
}

const HEIGHT = 200
const PADDING_LEFT = 8
const PADDING_RIGHT = 8
const PADDING_TOP = 24
// Room above a full-height bar for a rotated "100%" reading upward.
const PADDING_TOP_ROTATED = 40
const PADDING_BOTTOM = 24
const BAR_GAP = 4
const VALUE_FONT_SIZE = 11

/** Vertical bar chart for comparing magnitude across an ordered discrete scale (e.g. accuracy
 * by confidence value). Single hue, rounded bar tops, a direct value label above each bar (the
 * bar count here is small and fixed, not a dense scatter of points, so a label per bar stays
 * readable), plus a hover tooltip for the fuller breakdown. */
export function BarChart({ data, color = '#16476a' }: BarChartProps) {
  const { ref, width } = useContainerWidth()
  const [hovered, setHovered] = useState<number | null>(null)

  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No data yet.</p>
  }

  const maxValue = Math.max(1, ...data.map((d) => d.value))
  const plotLeft = PADDING_LEFT
  const plotRight = width - PADDING_RIGHT
  const plotWidth = Math.max(plotRight - plotLeft, 0)
  const barWidth = data.length > 0 ? Math.max(plotWidth / data.length - BAR_GAP, 1) : 0
  // On narrow screens (e.g. 16 confidence levels on a portrait phone) upright value labels are
  // wider than their bars and overlap -- turn them sideways rather than dropping any.
  const widestValueLabel = Math.max(...data.map((d) => estimateTextWidth(d.valueLabel, VALUE_FONT_SIZE)))
  const rotateValueLabels = labelsCollide(widestValueLabel, barWidth + BAR_GAP)
  const plotTop = rotateValueLabels ? PADDING_TOP_ROTATED : PADDING_TOP
  const plotBottom = HEIGHT - PADDING_BOTTOM
  const plotHeight = plotBottom - plotTop

  const tooltipDatum = hovered !== null ? data[hovered] : undefined
  const tooltipLeft = hovered !== null ? plotLeft + hovered * (barWidth + BAR_GAP) : 0

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
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * plotHeight
          const x = plotLeft + i * (barWidth + BAR_GAP)
          const y = plotBottom - barHeight
          const isDimmed = hovered !== null && hovered !== i
          return (
            <g key={d.label} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <rect x={x} y={plotTop} width={barWidth} height={plotHeight} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 0)}
                rx={4}
                fill={color}
                opacity={isDimmed ? 0.45 : 1}
              />
              {rotateValueLabels ? (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  transform={`rotate(-90 ${x + barWidth / 2} ${y - 4})`}
                  dominantBaseline="central"
                  fontSize={VALUE_FONT_SIZE}
                  fontWeight={600}
                  fill="#0b0b0b"
                >
                  {d.valueLabel}
                </text>
              ) : (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(y - 6, plotTop - 10)}
                  textAnchor="middle"
                  fontSize={VALUE_FONT_SIZE}
                  fontWeight={600}
                  fill="#0b0b0b"
                >
                  {d.valueLabel}
                </text>
              )}
              <text x={x + barWidth / 2} y={plotBottom + 16} textAnchor="middle" fontSize={11} fill="#898781">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {tooltipDatum && (
        <ChartTooltip
          style={{ left: clampTooltipLeft(tooltipLeft, width), top: 0 }}
          heading={tooltipDatum.label}
          lines={tooltipDatum.tooltip}
        />
      )}
    </div>
  )
}
