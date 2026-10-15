import { useEffect, useRef, useState } from 'react'

/** Measures the actual rendered pixel width of a container via ResizeObserver, so SVG charts
 * can use a 1:1 pixel viewBox instead of a fixed viewBox stretched non-uniformly by the browser
 * (which would distort circular markers in line/dot charts). */
export function useContainerWidth(fallback = 600) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width || fallback)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fallback])

  return { ref, width }
}
