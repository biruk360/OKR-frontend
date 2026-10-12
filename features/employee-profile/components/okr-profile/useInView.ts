'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * True once the element has come within `rootMargin` of the viewport (and stays
 * true). The OKR tree uses it to defer each row's `GET /api/connections` request
 * until the row is about to be seen. Falls back to `true` where
 * IntersectionObserver is unavailable.
 */
export function useInViewOnce<T extends Element>(rootMargin = '200px') {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (seen) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [seen, rootMargin])

  return { ref, seen }
}
