'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Target } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { NestedObjectivesList, CreateIndividualObjectiveButton } from '@/features/objectives'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import toast from 'react-hot-toast'
import { useTimeframes, useDepartments } from '@/hooks'

interface Objective {
  id: string
  title: string
  description?: string
  level: string
  progress: number
  status: string
  ownerId: string
  timeframeId: string
  departmentId?: string
  parentObjectiveId?: string
  createdAt: string
  updatedAt: string
  owner: { id: string; name: string; avatar?: string }
  timeframe: { id: string; name: string; startDate: string; endDate: string }
  department?: { id: string; name: string }
  parentObjective?: { id: string; title: string }
  keyResults?: any[]
  _count?: { keyResults: number; childObjectives: number }
}

interface Timeframe {
  id: string; name: string; type?: string
  startDate: string; endDate: string; isActive: boolean
}

interface Department { id: string; name: string }

export default function MyOKRsPage() {
  const { data: session } = useSession()
  const [objectives, setObjectives] = useState<Objective[]>([])
  const { timeframes } = useTimeframes()
  const { departments } = useDepartments() as { departments: Department[] }
  const [userDepartments, setUserDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({ level: 'ALL', timeframe: '', search: '' })
  const debouncedSearch = useDebounce(filters.search, 300)

  const fetchObjectives = useCallback(async () => {
    if (!session?.user?.id) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ status: 'ACTIVE', limit: '500' })
      if (filters.level && filters.level !== 'ALL') {
        params.append('level', filters.level)
      } else if (session.user.role === 'EMPLOYEE') {
        params.append('ownerId', session.user.id)
      }
      if (filters.timeframe) params.append('timeframeId', filters.timeframe)
      if (debouncedSearch) params.append('search', debouncedSearch)

      const res = await fetch(`/api/objectives?${params}`)
      const data = await res.json()
      if (data.success) setObjectives(data.data)
      else toast.error('Failed to load objectives')
    } catch {
      toast.error('Failed to load objectives')
    } finally {
      setIsLoading(false)
    }
  }, [session?.user?.id, session?.user?.role, filters.level, filters.timeframe, debouncedSearch])

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/users/me/departments')
        .then(r => r.json())
        .then(d => { if (d.success) setUserDepartments(d.data ?? d.departments ?? []) })
        .catch(() => {})
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) fetchObjectives()
  }, [session?.user?.id, fetchObjectives])

  useEffect(() => {
    if (filters.timeframe || timeframes.length === 0) return
    const current = pickCurrentTimeframe(timeframes as unknown as Timeframe[])
    if (current) setFilters(prev => ({ ...prev, timeframe: current.id }))
  }, [timeframes, filters.timeframe])

  const handleObjectiveCreated = useCallback(() => {
    if (!session?.user?.id) return
    setIsLoading(true)
    const params = new URLSearchParams({ ownerId: session.user.id, status: 'ACTIVE', limit: '100' })
    if (filters.level !== 'ALL') params.append('level', filters.level)
    if (debouncedSearch) params.append('search', debouncedSearch)
    fetch(`/api/objectives?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setObjectives(d.data ?? []) })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [session?.user?.id, filters.level, debouncedSearch])

  if (!session) return null

  const count = objectives.length

  const levels = [
    { id: 'ALL', label: 'All' },
    { id: 'COMPANY', label: 'Company' },
    { id: 'DEPARTMENT', label: 'Department' },
    { id: 'INDIVIDUAL', label: 'Individual' },
  ]

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4 flex items-start justify-between gap-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="min-w-0">
          <h1
            className="text-[24px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            My OKRs
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
            Objectives and key results owned by or aligned to you.
          </p>
        </div>
        <div className="shrink-0">
          <CreateIndividualObjectiveButton
            onObjectiveCreated={handleObjectiveCreated}
            userDepartments={userDepartments}
          />
        </div>
      </div>

      {/* Filter strip */}
      <div
        className="rounded-[14px] border bg-card px-3 py-2.5 flex flex-wrap items-center gap-2"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        {/* Level segmented */}
        <div
          className="inline-flex items-center rounded-[10px] p-0.5"
          style={{ background: 'var(--ap-bg-sunken)' }}
        >
          {levels.map((lv) => (
            <button
              key={lv.id}
              type="button"
              onClick={() => setFilters((p) => ({ ...p, level: lv.id }))}
              className="px-2.5 py-1 text-[12px] font-medium rounded-[8px] transition"
              style={{
                background: filters.level === lv.id ? 'var(--ap-bg-raised)' : 'transparent',
                color: filters.level === lv.id ? 'var(--ap-fg)' : 'var(--ap-fg-muted)',
                boxShadow: filters.level === lv.id ? 'var(--ap-shadow-sm)' : 'none',
              }}
            >
              {lv.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search…"
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            className="input pl-8 h-8 text-sm rounded-[10px]"
          />
        </div>

        {/* Timeframe */}
        <select
          value={filters.timeframe}
          onChange={(e) => setFilters((p) => ({ ...p, timeframe: e.target.value }))}
          className="input h-8 text-sm w-auto pr-7 rounded-[10px]"
        >
          <option value="">All timeframes</option>
          {timeframes.map((tf) => (
            <option key={tf.id} value={tf.id}>{tf.name}</option>
          ))}
        </select>

        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">
          {isLoading ? '…' : `${count} objective${count !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : objectives.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Target className="size-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium">No objectives found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filters.search || filters.timeframe
              ? 'Try adjusting your filters.'
              : 'Create your first objective to get started.'}
          </p>
        </div>
      ) : (
        <NestedObjectivesList
          objectives={objectives}
          timeframes={timeframes}
          departments={departments}
          userRole={session.user.role}
          showPersonalOnly
        />
      )}
    </div>
  )
}
