import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  User,
  Target,
  Building2,
  ChevronRight,
} from 'lucide-react'
import { canViewObjective, type UserRole } from '@/lib/permissions'

interface PageProps {
  params: { id: string }
}

export default async function UserObjectivesPage({ params }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  const profileUser = await prisma.user.findUnique({
    where: { id: params.id, isActive: true },
    include: {
      departmentMemberships: {
        include: { department: { select: { id: true, name: true } } },
      },
    },
  })

  if (!profileUser) notFound()

  const ownedObjectives = await prisma.objective.findMany({
    where: { ownerId: profileUser.id, status: 'ACTIVE' },
    include: {
      timeframe: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          targetValue: true,
          unit: true,
          currentValue: true,
          progress: true,
        },
      },
      parentObjective: { select: { id: true, title: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const visibleOwned: typeof ownedObjectives = []
  for (const obj of ownedObjectives) {
    const { canView } = await canViewObjective(
      session.user.role as UserRole,
      session.user.id,
      {
        level: obj.level,
        ownerId: obj.ownerId,
        departmentId: obj.departmentId,
        isPrivate: obj.isPrivate,
      }
    )
    if (canView) visibleOwned.push(obj)
  }

  const keyResultsElsewhere = await prisma.keyResult.findMany({
    where: {
      ownerId: profileUser.id,
      status: 'ACTIVE',
      objective: { ownerId: { not: profileUser.id }, status: 'ACTIVE' },
    },
    include: {
      objective: {
        select: {
          id: true,
          title: true,
          level: true,
          ownerId: true,
          departmentId: true,
          isPrivate: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const visibleKR: typeof keyResultsElsewhere = []
  for (const kr of keyResultsElsewhere) {
    const { canView } = await canViewObjective(
      session.user.role as UserRole,
      session.user.id,
      {
        level: kr.objective.level,
        ownerId: kr.objective.ownerId,
        departmentId: kr.objective.departmentId,
        isPrivate: kr.objective.isPrivate,
      }
    )
    if (canView) visibleKR.push(kr)
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/org/users"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to directory
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
            <User className="h-7 w-7 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {profileUser.name}
            </h1>
            <p className="text-sm text-gray-500 truncate">{profileUser.email}</p>
            <span className="inline-flex mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {profileUser.role}
            </span>
            {profileUser.departmentMemberships.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {profileUser.departmentMemberships.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                  >
                    <Building2 className="h-3 w-3 mr-1" />
                    {m.department.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-600" />
          Objectives & key results
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Open an objective for the full page (progress, edit actions, todos). Only
          goals you are allowed to see are listed.
        </p>

        {visibleOwned.length === 0 && visibleKR.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 text-sm">
            No visible objectives or key results for this user.
          </div>
        ) : null}

        <div className="space-y-4">
          {visibleOwned.map((obj) => (
            <div
              key={obj.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              <Link
                href={`/dashboard/objectives/${obj.id}`}
                className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 group"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        obj.level === 'COMPANY'
                          ? 'bg-blue-100 text-blue-800'
                          : obj.level === 'DEPARTMENT'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {obj.level}
                    </span>
                    {obj.timeframe && (
                      <span className="text-xs text-gray-500">
                        {obj.timeframe.name}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 mt-1 group-hover:text-blue-700">
                    {obj.title}
                  </p>
                  {obj.parentObjective && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Aligned to: {obj.parentObjective.title}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
              </Link>
              {obj.keyResults.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {obj.keyResults.map((kr) => (
                    <li key={kr.id} className="px-4 py-2.5 text-sm">
                      <Link
                        href={`/dashboard/objectives/${obj.id}`}
                        className="text-gray-800 hover:text-blue-600 hover:underline"
                      >
                        {kr.title}
                      </Link>
                      <span className="text-gray-400 ml-2 text-xs">
                        {kr.currentValue} / {kr.targetValue} {kr.unit} ·{' '}
                        {Math.round(kr.progress)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-gray-500">No key results yet.</p>
              )}
            </div>
          ))}
        </div>

        {visibleKR.length > 0 && (
          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-2">
              Key results on others&apos; objectives
            </h3>
            <ul className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {visibleKR.map((kr) => (
                <li key={kr.id} className="px-4 py-3 text-sm">
                  <Link
                    href={`/dashboard/objectives/${kr.objective.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {kr.title}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Objective: {kr.objective.title}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
