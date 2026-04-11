'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Search, Calendar, Tag, User, Filter } from 'lucide-react'
import GoalsFilterBar from './GoalsFilterBar'
import GoalsSummaryDashboard from './GoalsSummaryDashboard'
import GoalsTable from './GoalsTable'
import GoalsFeedView from './GoalsFeedView'
import CreateGoalModal from './CreateGoalModal'
import toast from 'react-hot-toast'

interface GoalsListViewProps {
  tab: string
  viewMode: 'list' | 'feed'
}

export default function GoalsListView({ tab, viewMode }: GoalsListViewProps) {
  const { data: session } = useSession()
  const [objectives, setObjectives] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
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

  useEffect(() => {
    let cancelled = false
    fetch('/api/users/for-selection')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success && d.users) setUsers(d.users)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
    <div className="space-y-4">
      {/* Header with New Goal Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">
            Manage and track your organization's goals and key results.
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Goal
        </button>
      </div>

      {/* Filter Bar */}
      <GoalsFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
      />

      {/* Summary Dashboard */}
      <GoalsSummaryDashboard stats={stats} />

      {/* Goals Table or Feed View */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading goals...</span>
        </div>
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

