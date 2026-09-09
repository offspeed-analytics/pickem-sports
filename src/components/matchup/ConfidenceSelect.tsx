interface ConfidenceSelectProps {
  gameCount: number
  value: number | null
  /** Confidence value -> "picked team over opponent" for the game currently holding it. */
  usedValues: Map<number, string>
  disabled: boolean
  onChange: (value: number) => void
}

export function ConfidenceSelect({
  gameCount,
  value,
  usedValues,
  disabled,
  onChange,
}: ConfidenceSelectProps) {
  const options = Array.from({ length: gameCount }, (_, i) => i + 1)

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
    >
      <option value="" disabled>
        Points
      </option>
      {options.map((n) => {
        const usedFor = usedValues.get(n)
        return (
          <option key={n} value={n}>
            {n}
            {usedFor && n !== value ? ` (${usedFor})` : ''}
          </option>
        )
      })}
    </select>
  )
}
