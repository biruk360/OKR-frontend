'use client'

import { useQuery } from '@tanstack/react-query'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useTimeframes } from '@/hooks/useTimeframes'

export interface FilterOptions {
  users: { id: string; label: string }[]
  departments: { id: string; label: string }[]
  timeframes: { id: string; label: string }[]
  plans: { id: string; label: string }[]
}

async function fetchDepartments(): Promise<{ id: string; label: string }[]> {
  const res = await fetch('/api/departments')
  if (!res.ok) return []
  const json = await res.json()
  return (json.data ?? []).map((d: any) => ({ id: d.id, label: d.name }))
}

async function fetchPlans(): Promise<{ id: string; label: string }[]> {
  const res = await fetch('/api/timeframes')
  if (!res.ok) return []
  const json = await res.json()
  return (json.data ?? []).map((t: any) => ({ id: t.id, label: t.name }))
}

export function useFilterOptions() {
  const { users: rawUsers } = useUsersForSelection()
  const { timeframes: rawTimeframes } = useTimeframes()

  const deptQuery = useQuery({
    queryKey: ['filter-options', 'departments'],
    queryFn: fetchDepartments,
    staleTime: 60_000,
  })

  const users = rawUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))
  const timeframes = rawTimeframes.map((t) => ({ id: t.id, label: t.name }))
  const departments = deptQuery.data ?? []
  const plans = timeframes // plans are timeframes in this system

  return { users, departments, timeframes, plans }
}
