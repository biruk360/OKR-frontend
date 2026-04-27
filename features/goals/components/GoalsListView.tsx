'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Search, Calendar, Tag, User, Filter } from 'lucide-react'
import GoalsFilterBar from './GoalsFilterBar'
import GoalsSummaryDashboard from './GoalsSummaryDashboard'
import GoalsTable from './GoalsTable'
import GoalsFeedView from './GoalsFeedView'
import CreateGoalModal from './CreateGoalModal'
import { EmptyState } from '@/components/ui/EmptyState'
import toast from 'react-hot-toast'
import { useUsersForSelection } from '@/hooks'

interface GoalsListViewProps {
  tab: string
  viewMode: 'list' | 'feed'
}

export default function GoalsListView({ tab, viewMode }: GoalsListViewProps) {
  const { data: session } = useSession()
  const [objectives, setObjectives] = useState<any[]>([])
  const { users } = useUsersForSelection()
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [filters, setFilters] = useState({
    timeframe: '',
    startDate: '',
    endDate: '',
    labels: [] as string[],
    owner: '',
    search: ''
  })

  const fetchObjectives = useCallback(async () => {
    if (!session?.user?.id) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        status: 'ACTIVE',
        limit: '500'
      })

      // Apply tab-based filtering
      if (tab === 'my-goals') {
        params.append('ownerId', session.user.id)
      } else if (tab === 'department') {
        params.append('level', 'DEPARTMENT')
      } else if (tab === 'company-goals') {
        params.append('level', 'COMPANY')
      }

      if (filters.timeframe) {
        params.append('timeframeId', filters.timeframe)
      }

      if (filters.search) {
        params.append('search', filters.search)
      }

      const response = await fetch(`/api/objectives?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to load objectives:', errorData)
        toast.error(errorData.error || `Failed to load objectives (${response.status})`)
        setObjectives([])
        return
      }
      
      const data = await response.json()

      if (data.success) {
        setObjectives(data.data || [])
      } else {
        console.error('Failed to load objectives:', data)
        toast.error(data.error || 'Failed to load objectives')
        setObjectives([])
      }
    } catch (error) {
      console.error('Error fetching objectives:', error)
      toast.error('Failed to load objectives')
    } finally {
      setIsLoading(false)
    }
  }, [session?.user?.id, tab, filters.timeframe, filters.search])

  useEffect(() => {
    fetchObjectives()
  }, [fetchObjectives])

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleGoalCreated = () => {
    fetchObjectives()
    setIsCreateModalOpen(false)
  }

  // Calculate stats for summary dashboard
  const stats = {
    total: objectives.length,
    onTrack: objectives.filter(obj => (obj.goalStatus || obj.status) === 'ON_TRACK').length,
    atRisk: objectives.filter(obj => (obj.goalStatus || obj.status) === 'AT_RISK').length,
    offTrack: objectives.filter(obj => (obj.goalStatus || obj.status) === 'OFF_TRACK').length,
    closed: objectives.filter(obj => (obj.goalStatus || obj.status) === 'CLOSED').length,
    noStatus: objectives.filter(obj => !obj.goalStatus && !obj.status).length,
    avgProgress: objectives.length > 0
      ? Math.round(objectives.reduce((sum, obj) => sum + (obj.progress || 0), 0) / objectives.length)
      : 0
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] truncate" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
          Manage and track your organization's goals and key results.
        </p>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="ap-btn ap-btn-primary ap-focus-ring inline-flex shrink-0 items-center justify-center h-8 px-3 text-[12px] font-semibold rounded-[10px] text-white"
          style={{ background: 'var(--ap-accent, #007aff)' }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Goal
        </button>
      </div>

      <GoalsFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
      />

      <GoalsSummaryDashboard stats={stats} />

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: 'var(--ap-accent, #007aff)' }}></div>
          <span className="ml-2 text-sm" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>Loading goals…</span>
        </div>
      ) : objectives.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Create your first goal to start tracking progress."
          action={{ label: 'New Goal', onClick: () => setIsCreateModalOpen(true) }}
        />
      ) : viewMode === 'feed' ? (
        <GoalsFeedView
          objectives={objectives}
          onRefresh={fetchObjectives}
        />
      ) : (
        <GoalsTable
          objectives={objectives}
          onRefresh={fetchObjectives}
          users={users}
        />
      )}

      {/* Create Goal Modal */}
      {isCreateModalOpen && (
        <CreateGoalModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onGoalCreated={handleGoalCreated}
        />
      )}
    </div>
  )
}

