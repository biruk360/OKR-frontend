import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StatCard, StatGrid } from '@/components/ui'

export default async function AnalyticsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const objectives = await prisma.objective.findMany({
    where: { status: 'ACTIVE' },
    include: {
      keyResults: true,
      timeframe: true,
      department: { select: { id: true, name: true } },
    },
  })

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: { _count: { select: { objectives: true } } },
  })

  const successRate = objectives.length > 0
    ? Math.round((objectives.filter((obj) => obj.progress >= 75).length / objectives.length) * 100)
    : 0
  const avgProgress = objectives.length > 0
    ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
    : 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Advanced analytics and insights for your OKR system.
      </p>

      <StatGrid columns={4}>
        <StatCard label="Total OKRs" value={objectives.length} iconText="📊" tone="blue" />
        <StatCard label="Success Rate" value={`${successRate}%`} iconText="🎯" tone="green" />
        <StatCard label="Avg Progress" value={`${avgProgress}%`} iconText="📈" tone="yellow" />
        <StatCard label="Departments" value={departments.length} iconText="🏢" tone="purple" />
      </StatGrid>

      {/* Department Performance */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Department Performance
          </h3>
          <div className="space-y-4">
            {departments.map((department) => {
              const deptObjectives = objectives.filter((obj) => obj.departmentId === department.id)
              const deptAvgProgress = deptObjectives.length > 0
                ? Math.round(deptObjectives.reduce((sum, obj) => sum + obj.progress, 0) / deptObjectives.length)
                : 0

              return (
                <div key={department.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900">{department.name}</h4>
                    <span className="text-sm text-gray-500">{deptAvgProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className={`h-2 rounded-full ${
                        deptAvgProgress >= 75 ? 'bg-green-500' :
                        deptAvgProgress >= 25 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${deptAvgProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500">{deptObjectives.length} Objectives</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* OKR Level Distribution */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            OKR Level Distribution
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {objectives.filter((obj) => obj.level === 'COMPANY').length}
              </div>
              <div className="text-sm text-gray-500">Company Level</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {objectives.filter((obj) => obj.level === 'DEPARTMENT').length}
              </div>
              <div className="text-sm text-gray-500">Department Level</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {objectives.filter((obj) => obj.level === 'INDIVIDUAL').length}
              </div>
              <div className="text-sm text-gray-500">Individual Level</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
