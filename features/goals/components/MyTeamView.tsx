'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, User, Users } from 'lucide-react'
import CreateGoalModal from './CreateGoalModal'
import { EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

function getInitials(name?: string) {
  if (!name) return '?'
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function Sparkline({ values, color = 'var(--ap-accent, #007aff)' }: { values: number[]; color?: string }) {
  const w = 80
  const h = 24
  if (values.length === 0) {
    return (
      <svg width={w} height={h} className="opacity-40">
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="var(--ap-border, #e5e5ea)" strokeWidth={1} />
      </svg>
    )
  }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / range) * (h - 2) - 1
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
      const reportsRes = await fetch(`/api/users/me/direct-reports`)
      const reportsData = await reportsRes.json()

      if (reportsData.success) {
        setDirectReports(reportsData.data)
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
    const krProgresses: number[] = []
    objectives.forEach((o: any) => {
      ;(o.keyResults || []).forEach((kr: any) => krProgresses.push(Math.round(kr.progress || 0)))
    })
    const krAvg =
      krProgresses.length > 0
        ? Math.round(krProgresses.reduce((a, b) => a + b, 0) / krProgresses.length)
        : 0
    return {
      total: objectives.length,
      onTrack: objectives.filter((o: any) => o.goalStatus === 'ON_TRACK').length,
      atRisk: objectives.filter((o: any) => o.goalStatus === 'AT_RISK').length,
      offTrack: objectives.filter((o: any) => o.goalStatus === 'OFF_TRACK').length,
      avgProgress: objectives.length > 0
        ? Math.round(objectives.reduce((sum: number, o: any) => sum + (o.progress || 0), 0) / objectives.length)
        : 0,
      krAvg,
      sparkValues: krProgresses.length ? krProgresses.slice(0, 12) : objectives.map((o: any) => Math.round(o.progress || 0)),
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--ap-accent, #007aff)' }}></div>
        <span className="ml-2" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>Loading team data...</span>
      </div>
    )
  }

  if (directReports.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No direct reports"
        description="You don't have any direct reports assigned to you."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {directReports.map((user) => {
          const stats = calculateUserStats(user.id)
          const role = user.role || 'EMPLOYEE'
          const roleLabel =
            role === 'ADMIN' ? 'Admin' :
            role === 'EXECUTIVE' ? 'Executive' :
            role === 'DEPARTMENT_LEAD' ? 'Lead' : 'Employee'

          return (
            <div
              key={user.id}
              className={cn(
                'ap-hover-lift rounded-[14px] border p-4 transition-shadow',
              )}
              style={{
                background: 'var(--ap-bg, #fff)',
                borderColor: 'var(--ap-border, hsl(var(--border)))',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-full" />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold text-[13px]"
                      style={{ background: 'var(--ap-accent, #007aff)' }}
                    >
                      {user.name ? getInitials(user.name) : <User className="h-5 w-5" />}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold truncate" style={{ color: 'var(--ap-fg, hsl(var(--foreground)))' }}>
                        {user.name}
                      </h3>
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: 'rgba(120,120,128,0.12)', color: 'var(--ap-fg-muted, #6b7280)' }}
                      >
                        {roleLabel}
                      </span>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedUserId(user.id)
                    setCreateModalOpen(true)
                  }}
                  className="p-1.5 rounded-[8px] transition-colors"
                  style={{ color: 'var(--ap-accent, #007aff)' }}
                  title="Create goal for this team member"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div
                className="grid grid-cols-3 gap-2 rounded-[10px] p-2.5 mb-3"
                style={{ background: 'rgba(120,120,128,0.04)' }}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
                    Objectives
                  </div>
                  <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--ap-fg, hsl(var(--foreground)))' }}>
                    {stats.total}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
                    KR Avg
                  </div>
                  <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--ap-accent, #007aff)' }}>
                    {stats.krAvg}%
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center">
                  <Sparkline values={stats.sparkValues} />
                </div>
              </div>

              <div className="flex items-center gap-3 text-[11px] mb-3">
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: 'var(--ap-green, #34c759)' }} />
                  <span className="tabular-nums font-semibold">{stats.onTrack}</span>
                  <span style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>on</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: 'var(--ap-orange, #ff9500)' }} />
                  <span className="tabular-nums font-semibold">{stats.atRisk}</span>
                  <span style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>risk</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: 'var(--ap-red, #ff3b30)' }} />
                  <span className="tabular-nums font-semibold">{stats.offTrack}</span>
                  <span style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>off</span>
                </span>
              </div>

              <div className="space-y-1 max-h-56 overflow-y-auto">
                {teamObjectives[user.id]?.length > 0 ? (
                  teamObjectives[user.id].map((objective: any) => (
                    <a
                      key={objective.id}
                      href={`/dashboard/objectives/${objective.id}`}
                      className="block p-2 rounded-[8px] transition-colors hover:bg-[rgba(120,120,128,0.06)]"
                    >
                      <div className="text-[12px] font-medium line-clamp-1" style={{ color: 'var(--ap-fg, hsl(var(--foreground)))' }}>
                        {objective.title}
                      </div>
                      <div className="flex items-center justify-between mt-1 gap-2">
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(120,120,128,0.18)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(objective.progress, 100)}%`,
                              background: 'var(--ap-accent, #007aff)',
                            }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums font-semibold" style={{ color: 'var(--ap-fg-muted, hsl(var(--muted-foreground)))' }}>
                          {Math.round(objective.progress)}%
                        </span>
                      </div>
                    </a>
                  ))
                ) : (
                  <EmptyState bare title="No goals yet" />
                )}
              </div>
            </div>
          )
        })}
      </div>

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
