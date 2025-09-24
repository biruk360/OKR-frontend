'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Target, User, Calendar, Building2, Search } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import ObjectivesList from '@/components/objectives/ObjectivesList'
import CreateIndividualObjectiveButton from '@/components/objectives/CreateIndividualObjectiveButton'
import toast from 'react-hot-toast'

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
  keyResults: any[]
  _count: {
    keyResults: number
    childObjectives: number
  }
}

interface Timeframe {
  id: string
  name: string
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
  const [timeframes, setTimeframes] = useState<Timeframe[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [userDepartments, setUserDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    level: 'ALL', // Default to All levels for My OKRs
    timeframe: '', // Will be set to current period
    search: ''
  })
  
  // Debounced search term
  const debouncedSearch = useDebounce(filters.search, 300)

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
  }, [session?.user?.id, filters.level, filters.timeframe, debouncedSearch])

  const fetchInitialData = async () => {
    try {
      const [timeframesRes, departmentsRes, userDepartmentsRes] = await Promise.all([
        fetch('/api/timeframes'),
        fetch('/api/departments'),
        fetch('/api/users/me/departments')
      ])

      const [timeframesData, departmentsData, userDepartmentsData] = await Promise.all([
        timeframesRes.json(),
        departmentsRes.json(),
        userDepartmentsRes.json()
      ])

      if (timeframesData.success) {
        setTimeframes(timeframesData.data)
        // Set default timeframe to current active one
        const activeTimeframe = timeframesData.data.find((tf: Timeframe) => tf.isActive)
        if (activeTimeframe) {
          setFilters(prev => ({ ...prev, timeframe: activeTimeframe.id }))
        }
      }

      if (departmentsData.success) {
        setDepartments(departmentsData.data)
      }

      if (userDepartmentsData.success) {
        setUserDepartments(userDepartmentsData.data)
      }
    } catch (error) {
      console.error('Error fetching initial data:', error)
      toast.error('Failed to load page data')
    }
  }

  const fetchObjectives = async () => {
    if (!session?.user?.id) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        ownerId: session.user.id,
        status: 'ACTIVE'
      })

      if (filters.level && filters.level !== 'ALL') {
        params.append('level', filters.level)
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
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleObjectiveCreated = () => {
    // Refresh objectives list
    fetchObjectives()
    toast.success('Objective created successfully!')
  }

  // Calculate stats
  const stats = {
    totalObjectives: objectives.length,
    totalKeyResults: objectives.reduce((sum, obj) => sum + obj.keyResults.length, 0),
    avgProgress: objectives.length > 0 
      ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
      : 0,
    completed: objectives.filter(obj => obj.progress === 100).length
  }

  if (!session) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My OKRs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and track your personal objectives and key results.
          </p>
        </div>
            <CreateIndividualObjectiveButton 
              onObjectiveCreated={handleObjectiveCreated}
              userDepartments={userDepartments}
            />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">O</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Objectives</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalObjectives}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">KR</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Key Results</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalKeyResults}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">%</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Progress</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.avgProgress}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">✓</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.completed}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe</label>
            <select
              value={filters.timeframe}
              onChange={(e) => handleFilterChange('timeframe', e.target.value)}
              className="input"
            >
              <option value="">All Timeframes</option>
              {timeframes.map((timeframe) => (
                <option key={timeframe.id} value={timeframe.id}>
                  {timeframe.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Objectives List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading objectives...</span>
        </div>
      ) : objectives.length === 0 ? (
        <div className="text-center py-12">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No objectives found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filters.search || filters.timeframe
              ? "Try adjusting your filters to see more results."
              : "Get started by creating your first objective."
            }
          </p>
        </div>
      ) : (
        <ObjectivesList 
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
