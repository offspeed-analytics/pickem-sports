const GAMEPLAY_MODE_LABELS: Record<string, string> = {
  confidence_pickem: "Confidence Pick'em",
}

export function formatGameplayMode(mode: string): string {
  return GAMEPLAY_MODE_LABELS[mode] ?? mode
}
