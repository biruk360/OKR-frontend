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

  return (
    <div className="space-y-3">
      {/* Toolbar: count + filters + create button */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search…"
            value={filters.search}
            onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
            className="input pl-8 h-8 text-sm"
          />
        </div>

        {/* Level */}
        <select
          value={filters.level}
          onChange={e => setFilters(p => ({ ...p, level: e.target.value }))}
          className="input h-8 text-sm w-auto pr-7"
        >
          <option value="ALL">All levels</option>
          <option value="COMPANY">Company</option>
          <option value="DEPARTMENT">Department</option>
          <option value="INDIVIDUAL">Individual</option>
        </select>

        {/* Timeframe */}
        <select
          value={filters.timeframe}
          onChange={e => setFilters(p => ({ ...p, timeframe: e.target.value }))}
          className="input h-8 text-sm w-auto pr-7"
        >
          <option value="">All timeframes</option>
          {timeframes.map(tf => (
            <option key={tf.id} value={tf.id}>{tf.name}</option>
          ))}
        </select>

        {/* Spacer + count */}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
          {isLoading ? '…' : `${count} objective${count !== 1 ? 's' : ''}`}
        </span>

        <CreateIndividualObjectiveButton
          onObjectiveCreated={handleObjectiveCreated}
          userDepartments={userDepartments}
        />
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
