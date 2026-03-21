'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, User } from 'lucide-react'
import CreateGoalModal from './CreateGoalModal'
import toast from 'react-hot-toast'

export default function MyTeamView() {
  const { data: session } = useSession()
  const [directReports, setDirectReports] = useState<any[]>([])
  const [teamObjectives, setTeamObjectives] = useState<Record<string, any[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user?.id) {
      fetchTeamData()
    }
  }, [session?.user?.id])

  const fetchTeamData = async () => {
    setIsLoading(true)
    try {
      // Fetch direct reports
      const reportsRes = await fetch(`/api/users/me/direct-reports`)
      const reportsData = await reportsRes.json()

      if (reportsData.success) {
        setDirectReports(reportsData.data)
        
        // Fetch objectives for each direct report
        const objectivesMap: Record<string, any[]> = {}
        await Promise.all(
          reportsData.data.map(async (user: any) => {
            const objRes = await fetch(`/api/objectives?ownerId=${user.id}&status=ACTIVE`)
            const objData = await objRes.json()
            if (objData.success) {
              objectivesMap[user.id] = objData.data
            }
          })
        )
        setTeamObjectives(objectivesMap)
      }
    } catch (error) {
      console.error('Error fetching team data:', error)
      toast.error('Failed to load team data')
    } finally {
      setIsLoading(false)
    }
  }

  const calculateUserStats = (userId: string) => {
    const objectives = teamObjectives[userId] || []
    return {
      total: objectives.length,
      onTrack: objectives.filter((o: any) => o.goalStatus === 'ON_TRACK').length,
      atRisk: objectives.filter((o: any) => o.goalStatus === 'AT_RISK').length,
      offTrack: objectives.filter((o: any) => o.goalStatus === 'OFF_TRACK').length,
      avgProgress: objectives.length > 0
        ? Math.round(objectives.reduce((sum: number, o: any) => sum + (o.progress || 0), 0) / objectives.length)
        : 0
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading team data...</span>
      </div>
    )
  }

  if (directReports.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <User className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No direct reports</h3>
        <p className="mt-1 text-sm text-gray-500">
          You don't have any direct reports assigned to you.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {directReports.map((user) => {
          const stats = calculateUserStats(user.id)
          const circumference = 2 * Math.PI * 40
          const offset = circumference - (stats.avgProgress / 100) * circumference

          return (
            <div key={user.id} className="bg-white rounded-lg border border-gray-200 p-6">
              {/* User Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">{user.name}</h3>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedUserId(user.id)
                    setCreateModalOpen(true)
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Create goal for this team member"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Progress Donut */}
              <div className="flex justify-center mb-4">
                <div className="relative w-24 h-24">
                  <svg className="transform -rotate-90 w-24 h-24">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="transparent"
                      className="text-gray-200"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      className="text-blue-600 transition-all duration-500"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-900">{stats.avgProgress}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Summary */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{stats.onTrack}</div>
                  <div className="text-xs text-gray-500">On Track</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-600">{stats.atRisk}</div>
                  <div className="text-xs text-gray-500">At Risk</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{stats.offTrack}</div>
                  <div className="text-xs text-gray-500">Off Track</div>
                </div>
              </div>

              {/* Goals List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {teamObjectives[user.id]?.length > 0 ? (
                  teamObjectives[user.id].map((objective: any) => (
                    <a
                      key={objective.id}
                      href={`/dashboard/objectives/${objective.id}`}
                      className="block p-2 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900 line-clamp-1">
                        {objective.title}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full"
                            style={{ width: `${Math.min(objective.progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(objective.progress)}%</span>
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No goals yet</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Goal Modal */}
      {createModalOpen && selectedUserId && (
        <CreateGoalModal
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false)
            setSelectedUserId(null)
          }}
          onGoalCreated={() => {
            fetchTeamData()
            setCreateModalOpen(false)
            setSelectedUserId(null)
          }}
          defaultOwnerId={selectedUserId}
        />
      )}
    </div>
  )
}

