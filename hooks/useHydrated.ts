'use client'

import { useEffect, useState } from 'react'

/**
 * False during SSR and the hydration render, true once React owns the DOM.
 *
 * Use it to keep a control inert until its JS handler exists — e.g. an auth
 * form's submit button: submitted before hydration, the browser performs the
 * form's native submit instead of the onSubmit handler.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])
  return hydrated
}
