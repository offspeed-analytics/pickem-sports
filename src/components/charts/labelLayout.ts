/** Rough rendered width of an 11px-ish SVG text label -- close enough for collision checks
 * without a DOM measurement pass (digits, "%" and short words average ~0.62em). */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62
}

const LABEL_GAP = 6

/** Whether labels of `labelWidth` centered on marks `spacing` px apart would run into each other. */
export function labelsCollide(labelWidth: number, spacing: number): boolean {
  return labelWidth + LABEL_GAP > spacing
}

/** How many marks apart labels must be to not collide -- 1 means every mark gets one. */
export function labelStride(labelWidth: number, spacing: number): number {
  if (spacing <= 0) return 1
  return Math.max(1, Math.ceil((labelWidth + LABEL_GAP) / spacing))
}
