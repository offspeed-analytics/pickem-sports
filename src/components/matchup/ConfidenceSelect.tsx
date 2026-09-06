interface ConfidenceSelectProps {
  gameCount: number
  value: number | null
  usedValues: Set<number>
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
      {options.map((n) => (
        <option key={n} value={n} disabled={usedValues.has(n) && n !== value}>
          {n}
          {usedValues.has(n) && n !== value ? ' (used)' : ''}
        </option>
      ))}
    </select>
  )
}
