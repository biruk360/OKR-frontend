'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type TitleContextValue = {
  overrideTitle: string | null
  setOverrideTitle: (title: string | null) => void
}

const DashboardTitleContext = createContext<TitleContextValue | null>(null)

export function DashboardTitleProvider({ children }: { children: ReactNode }) {
  const [overrideTitle, setOverrideTitle] = useState<string | null>(null)

  const value = useMemo(
    () => ({ overrideTitle, setOverrideTitle }),
    [overrideTitle]
  )

  return (
    <DashboardTitleContext.Provider value={value}>{children}</DashboardTitleContext.Provider>
  )
}

export function useDashboardTitleContext() {
  const ctx = useContext(DashboardTitleContext)
  if (!ctx) {
    throw new Error('useDashboardTitleContext must be used within DashboardTitleProvider')
  }
  return ctx
}

/** Sets the header title for dynamic pages; clears on unmount. */
export function PageTitleSetter({ title }: { title: string }) {
  const { setOverrideTitle } = useDashboardTitleContext()

  useEffect(() => {
    setOverrideTitle(title)
    return () => setOverrideTitle(null)
  }, [title, setOverrideTitle])

  return null
}
