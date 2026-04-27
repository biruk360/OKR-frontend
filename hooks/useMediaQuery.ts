import { useEffect, useState } from 'react'

/**
 * SSR-safe matchMedia hook. Returns `false` on the server and on first
 * client paint, then updates on hydration to the actual match state.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
