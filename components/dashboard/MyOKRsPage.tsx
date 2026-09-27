'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Target } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
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

  // "My OKRs" is always the viewer's own objectives plus the ones they
  // contribute to, for every role — `ownerId` + `contributorId` are ORed by
  // /api/objectives. The level segment and timeframe/search only narrow that
  // set. Initial load and the post-create refetch share this one query.
  const requestSeq = useRef(0)
  const timeframeDefaulted = useRef(false)
  const fetchObjectives = useCallback(async () => {
    if (!session?.user?.id) return
    const seq = ++requestSeq.current
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        ownerId: session.user.id,
        contributorId: session.user.id,
        status: 'ACTIVE',
        limit: '500',
      })
      if (filters.level && filters.level !== 'ALL') params.append('level', filters.level)
      if (filters.timeframe) params.append('timeframeId', filters.timeframe)
      if (debouncedSearch) params.append('search', debouncedSearch)

      const res = await fetch(`/api/objectives?${params}`)
      const data = await res.json()
      if (seq !== requestSeq.current) return // a newer filter combination is in flight
      if (data.success) setObjectives(data.data ?? [])
      else toast.error('Failed to load objectives')
    } catch {
      if (seq === requestSeq.current) toast.error('Failed to load objectives')
    } finally {
      if (seq === requestSeq.current) setIsLoading(false)
    }
  }, [session?.user?.id, filters.level, filters.timeframe, debouncedSearch])

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

  // Default to the current timeframe once; "All timeframes" stays selectable afterwards.
  useEffect(() => {
    if (timeframeDefaulted.current || timeframes.length === 0) return
    timeframeDefaulted.current = true
    const current = pickCurrentTimeframe(timeframes as unknown as Timeframe[])
    if (current) setFilters(prev => (prev.timeframe ? prev : { ...prev, timeframe: current.id }))
  }, [timeframes])

  const handleObjectiveCreated = fetchObjectives

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
        className="rounded-[var(--ap-radius-md)] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <PageHeader
          className="mb-0"
          title="My OKRs"
          description="Objectives and key results you own or contribute to."
          actions={
            <CreateIndividualObjectiveButton
              onObjectiveCreated={handleObjectiveCreated}
              userDepartments={userDepartments}
            />
          }
        />
      </div>

      {/* Filter strip */}
      <div
        className="rounded-[var(--ap-radius-md)] border bg-card px-3 py-2.5 flex flex-wrap items-center gap-2"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        {/* Level segmented */}
        <div
          className="inline-flex items-center rounded-[var(--ap-radius-sm)] p-0.5"
          style={{ background: 'var(--ap-bg-sunken)' }}
        >
          {levels.map((lv) => (
            <button
              key={lv.id}
              type="button"
              aria-pressed={filters.level === lv.id}
              onClick={() => setFilters((p) => ({ ...p, level: lv.id }))}
              className="px-2.5 py-1 text-xs font-medium rounded-[8px] transition"
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
            aria-label="Search objectives"
            placeholder="Search…"
            value={filters.search}
            onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            className="input pl-8 h-8 text-sm rounded-[var(--ap-radius-sm)]"
          />
        </div>

        {/* Timeframe */}
        <FilterSelect
          label="Timeframe"
          placeholder="All timeframes"
          value={filters.timeframe || undefined}
          onValueChange={(v) => setFilters((p) => ({ ...p, timeframe: v ?? '' }))}
          options={timeframes.map((tf) => ({ value: tf.id, label: tf.name }))}
        />

        <span className="ml-auto text-caption text-muted-foreground tabular-nums shrink-0">
          {isLoading ? '…' : `${count} objective${count !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading objectives">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : objectives.length === 0 ? (
        <EmptyState
          bare
          icon={Target}
          title="No objectives found"
          description={
            filters.search || filters.timeframe
              ? 'Try adjusting your filters.'
              : 'Create your first objective to get started.'
          }
        />
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
