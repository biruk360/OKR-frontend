'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Target, User, Calendar, Building2, Search } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { NestedObjectivesList, CreateIndividualObjectiveButton } from '@/features/objectives'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import toast from 'react-hot-toast'
import { StatCard, StatGrid } from '@/components/ui'
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
  owner: {
    id: string
    name: string
    avatar?: string
  }
  timeframe: {
    id: string
    name: string
    startDate: string
    endDate: string
  }
  department?: {
    id: string
    name: string
  }
  parentObjective?: {
    id: string
    title: string
  }
  keyResults?: any[]
  _count?: {
    keyResults: number
    childObjectives: number
  }
}

interface Timeframe {
  id: string
  name: string
  type?: string
  startDate: string
  endDate: string
  isActive: boolean
}

interface Department {
  id: string
  name: string
}

export default function MyOKRsPage() {
  const { data: session } = useSession()
  const [objectives, setObjectives] = useState<Objective[]>([])
  const { timeframes } = useTimeframes()
  const { departments } = useDepartments() as { departments: Department[] }
  const [userDepartments, setUserDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    level: 'ALL', // Default to All levels for My OKRs
    timeframe: '', // Will be set to current period
    search: ''
  })
  
  // Debounced search term
  const debouncedSearch = useDebounce(filters.search, 300)

  // Define fetchObjectives before useEffect that uses it
  const fetchObjectives = useCallback(async () => {
    if (!session?.user?.id) return

    setIsLoading(true)
    try {
      // For nested hierarchy, we need to fetch all objectives in the timeframe
      // not just user's objectives, so we can show the full hierarchy
      const params = new URLSearchParams({
        status: 'ACTIVE',
        limit: '500' // Increase limit to get all objectives for hierarchy
      })

      // If filtering by level, still apply it
      if (filters.level && filters.level !== 'ALL') {
        params.append('level', filters.level)
      } else {
        // For nested view, we want to show all levels to build hierarchy
        // But still filter by user's objectives if they're not admin/executive
        if (session.user.role === 'EMPLOYEE') {
          // Employees see their own objectives plus parent objectives
          params.append('ownerId', session.user.id)
        }
        // For DEPARTMENT_LEAD, ADMIN, EXECUTIVE - show all objectives in timeframe
      }

      if (filters.timeframe) {
        params.append('timeframeId', filters.timeframe)
      }

      if (debouncedSearch) {
        params.append('search', debouncedSearch)
      }

      const response = await fetch(`/api/objectives?${params}`)
      const data = await response.json()

      if (data.success) {
        setObjectives(data.data)
      } else {
        toast.error('Failed to load objectives')
      }
    } catch (error) {
      console.error('Error fetching objectives:', error)
      toast.error('Failed to load objectives')
    } finally {
      setIsLoading(false)
    }
  }, [session?.user?.id, filters.level, filters.timeframe, debouncedSearch])

  // Fetch initial data
  useEffect(() => {
    if (session?.user?.id) {
      fetchInitialData()
    }
  }, [session?.user?.id])

  // Fetch objectives when filters change
  useEffect(() => {
    if (session?.user?.id) {
      fetchObjectives()
    }
  }, [session?.user?.id, fetchObjectives])

  const fetchInitialData = async () => {
    try {
      const res = await fetch('/api/users/me/departments')
      const data = await res.json()
      if (data.success) {
        // Route returns `{ success, data: [...] }` (or legacy `.departments` — defensive).
        setUserDepartments(data.data ?? data.departments ?? [])
      }
    } catch (error) {
      console.error('Error fetching user departments:', error)
      toast.error('Failed to load user departments')
    }
  }

  // When timeframes load via the shared hook, default to the current period once.
  useEffect(() => {
    if (filters.timeframe || timeframes.length === 0) return
    const current = pickCurrentTimeframe(timeframes as unknown as Timeframe[])
    if (current) {
      setFilters((prev) => ({ ...prev, timeframe: current.id }))
    }
  }, [timeframes, filters.timeframe])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleObjectiveCreated = useCallback(() => {
    // Refresh objectives list - temporarily clear timeframe filter to ensure new objective appears
    // This handles the case where user creates objective in different timeframe than current filter
    if (!session?.user?.id) return

    setIsLoading(true)
    const params = new URLSearchParams({
      ownerId: session.user.id,
      status: 'ACTIVE',
      limit: '100' // Increase limit to ensure new objective appears
    })

    // Keep level filter if set
    if (filters.level && filters.level !== 'ALL') {
      params.append('level', filters.level)
    }

    // Don't apply timeframe filter on refresh - show all objectives so new one appears
    // User can reapply timeframe filter if needed
    if (debouncedSearch) {
      params.append('search', debouncedSearch)
    }

    fetch(`/api/objectives?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setObjectives(data.data || [])
          toast.success('Objective created! Refreshing list...')
        } else {
          console.error('Failed to refresh objectives:', data)
          toast.error('Failed to refresh objectives')
        }
      })
      .catch(error => {
        console.error('Error fetching objectives:', error)
        toast.error('Failed to refresh objectives')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [session?.user?.id, filters.level, debouncedSearch])

  // Calculate stats
  const stats = {
    totalObjectives: objectives.length,
    totalKeyResults: objectives.reduce((sum, obj) => {
      // Use _count.keyResults if available, otherwise fallback to keyResults array length or 0
      if (obj._count?.keyResults !== undefined) {
        return sum + obj._count.keyResults
      }
      if (Array.isArray(obj.keyResults)) {
        return sum + obj.keyResults.length
      }
      return sum
    }, 0),
    avgProgress: objectives.length > 0 
      ? Math.round(objectives.reduce((sum, obj) => sum + (obj.progress || 0), 0) / objectives.length)
      : 0,
    completed: objectives.filter(obj => obj.progress === 100).length
  }

  if (!session) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage and track your personal objectives and key results.
          </p>
        </div>
            <CreateIndividualObjectiveButton 
              onObjectiveCreated={handleObjectiveCreated}
              userDepartments={userDepartments}
            />
      </div>

      {/* Stats Cards */}
      <StatGrid columns={4}>
        <StatCard label="Total Objectives" value={stats.totalObjectives} iconText="O" tone="blue" />
        <StatCard label="Key Results" value={stats.totalKeyResults} iconText="KR" tone="green" />
        <StatCard label="Avg Progress" value={`${stats.avgProgress}%`} iconText="%" tone="yellow" />
        <StatCard label="Completed" value={stats.completed} iconText="✓" tone="purple" />
      </StatGrid>

      {/* Filter Bar */}
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search objectives..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10 input"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Level</label>
            <select
              value={filters.level}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="input"
            >
              <option value="ALL">All Levels</option>
              <option value="COMPANY">Company</option>
              <option value="DEPARTMENT">Department</option>
              <option value="INDIVIDUAL">Individual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Timeframe</label>
            <select
              value={filters.timeframe}
              onChange={(e) => handleFilterChange('timeframe', e.target.value)}
              className="input"
            >
              <option value="">All Timeframes</option>
              {timeframes.map((timeframe) => {
                const typeLabel = timeframe.type === 'MONTHLY' ? 'Monthly' :
                                 timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                                 timeframe.type === 'SIX_MONTH' ? '6-Month' :
                                 timeframe.type === 'YEARLY' ? 'Yearly' : 'Quarterly'
                return (
                  <option key={timeframe.id} value={timeframe.id}>
                    {timeframe.name} ({typeLabel})
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Objectives List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-muted-foreground">Loading objectives...</span>
        </div>
      ) : objectives.length === 0 ? (
        <div className="text-center py-12">
          <Target className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No objectives found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {filters.search || filters.timeframe
              ? "Try adjusting your filters to see more results."
              : "Get started by creating your first objective."
            }
          </p>
        </div>
      ) : (
        <NestedObjectivesList 
          objectives={objectives}
          timeframes={timeframes}
          departments={departments}
          userRole={session.user.role}
          showPersonalOnly={true}
        />
      )}
    </div>
  )
}
