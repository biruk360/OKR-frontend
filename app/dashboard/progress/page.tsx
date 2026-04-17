import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { User } from 'lucide-react'
import { StatCard, StatGrid } from '@/components/ui'

export default async function ProgressTrackingPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  let objectives: any[] = []

  if (session.user.role === 'EMPLOYEE') {
    objectives = await prisma.objective.findMany({
      where: { ownerId: session.user.id, status: 'ACTIVE' },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        keyResults: { include: { todos: true } },
        timeframe: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
  } else if (session.user.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const departmentIds = userDepartments.map((d) => d.departmentId)

    objectives = await prisma.objective.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ ownerId: session.user.id }, { departmentId: { in: departmentIds } }],
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        keyResults: { include: { todos: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  } else {
    objectives = await prisma.objective.findMany({
      where: { status: 'ACTIVE' },
      include: {
        keyResults: { include: { todos: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  const onTrack = objectives.filter((obj) => obj.progress >= 75).length
  const atRisk = objectives.filter((obj) => obj.progress >= 25 && obj.progress < 75).length
  const offTrack = objectives.filter((obj) => obj.progress < 25).length
  const avgProgress = objectives.length > 0
    ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
    : 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Monitor progress across all your objectives and key results.
      </p>

      <StatGrid columns={4}>
        <StatCard label="On Track" value={onTrack} iconText="✓" tone="green" />
        <StatCard label="At Risk" value={atRisk} iconText="⚠" tone="yellow" />
        <StatCard label="Off Track" value={offTrack} iconText="✗" tone="red" />
        <StatCard label="Avg Progress" value={`${avgProgress}%`} iconText="%" tone="blue" />
      </StatGrid>

      <div className="bg-card shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-foreground mb-4">Detailed Progress</h3>
          <div className="space-y-4">
            {objectives.map((objective) => (
              <div key={objective.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-foreground">{objective.title}</h4>
                  <span className="text-sm text-muted-foreground">{objective.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full ${
                      objective.progress >= 75 ? 'bg-green-500' :
                      objective.progress >= 25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${objective.progress}%` }}
                  />
                </div>
                <div className="flex items-center space-x-3 text-xs">
                  <div className="flex items-center bg-muted px-2 py-1 rounded-md border border-border">
                    {objective.owner?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={objective.owner.avatar}
                        alt={objective.owner?.name || 'Owner'}
                        className="h-4 w-4 rounded-full mr-1.5"
                      />
                    ) : (
                      <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center mr-1.5">
                        <User className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                    <span className="font-medium text-muted-foreground">{objective.owner?.name || 'Unknown'}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {objective.keyResults.length} Key Results • {objective.timeframe.name}
                    {objective.timeframe.type && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 rounded">
                        {objective.timeframe.type === 'MONTHLY' ? 'Monthly' :
                         objective.timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                         objective.timeframe.type === 'SIX_MONTH' ? '6-Month' :
                         objective.timeframe.type === 'YEARLY' ? 'Yearly' : ''}
                      </span>
                    )}
                    {objective.department && ` • ${objective.department.name}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
