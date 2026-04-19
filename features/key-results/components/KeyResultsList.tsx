'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Target, User, Archive } from 'lucide-react'
import { getProgressColor } from '@/lib/utils'
import ArchiveKeyResultButton from './ArchiveKeyResultButton'
import UnarchiveKeyResultButton from './UnarchiveKeyResultButton'
import AddKeyResultButton from './AddKeyResultButton'
import EditKeyResultButton from './EditKeyResultButton'
import DeleteKeyResultButton from './DeleteKeyResultButton'
import CloneKeyResultButton from './CloneKeyResultButton'
import CreateCheckInButton from './CreateCheckInButton'
import { ToDoList } from '@/features/todos'
import { useUsersForSelection } from '@/hooks'
import KeyResultActionsMenu from './KeyResultActionsMenu'

function safeProgressPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), 100)
}

function getInitials(name?: string) {
  if (!name) return '?'
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const CONFIDENCE_DOT: Record<string, string> = {
  ON_TRACK: 'bg-green-500',
  AT_RISK: 'bg-yellow-500',
  OFF_TRACK: 'bg-red-500',
}

type KeyResultPermissions = {
  canCreate: boolean
  canEditByKeyResultId: Record<string, boolean>
  canDeleteKeyResults: boolean
  canCloneKeyResults: boolean
}

interface KeyResultsListProps {
  keyResults: any[]
  objectiveId: string
  objective: {
    id: string
    ownerId?: string
    level?: string
    departmentId?: string | null
    timeframe?: { startDate: string | Date; endDate: string | Date; name?: string } | null
  }
  users?: any[]
  onKeyResultsChange?: () => void
}

export default function KeyResultsList({
  keyResults,
  objectiveId: _objectiveId,
  objective,
  users: usersFromProps,
  onKeyResultsChange,
}: KeyResultsListProps) {
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(true)
  const [perm, setPerm] = useState<KeyResultPermissions | null>(null)

  const shouldFetchUsers = !usersFromProps || usersFromProps.length === 0
  const { users: fetchedUsers } = useUsersForSelection({ enabled: shouldFetchUsers })

  const list = keyResults ?? []

  const loadPermissions = useCallback(async () => {
    if (!objective?.id) return
    try {
      const res = await fetch(`/api/objectives/${objective.id}/key-result-permissions`)
      const json = await res.json()
      if (!json.success) return
      const data = json.data ?? {}
      setPerm({
        canCreate: data.canCreate,
        canEditByKeyResultId: data.canEditByKeyResultId ?? {},
        canDeleteKeyResults: data.canDeleteKeyResults,
        canCloneKeyResults: data.canCloneKeyResults,
      })
    } catch {
      setPerm({
        canCreate: false,
        canEditByKeyResultId: {},
        canDeleteKeyResults: false,
        canCloneKeyResults: false,
      })
    }
  }, [objective?.id])

  useEffect(() => {
    if (!objective?.id) return
    loadPermissions()
  }, [objective?.id, loadPermissions])

  const users =
    usersFromProps && usersFromProps.length > 0 ? usersFromProps : fetchedUsers

  const afterMutation = useCallback(() => {
    onKeyResultsChange?.()
    router.refresh()
    void loadPermissions()
  }, [onKeyResultsChange, loadPermissions, router])

  if (!objective?.id) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Key results are unavailable (missing objective).
      </div>
    )
  }

  const activeKeyResults = list.filter((kr) => kr.status === 'ACTIVE')
  const archivedKeyResults = list.filter((kr) => kr.status === 'ARCHIVED')

  const renderKeyResultActions = (kr: any) => {
    const canEdit = perm?.canEditByKeyResultId[kr.id] === true
    const canClone = perm?.canCloneKeyResults === true
    const canDelete = perm?.canDeleteKeyResults === true
    const canArchive = canEdit

    return (
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <CreateCheckInButton
          keyResult={kr}
          objective={objective}
          canEdit={canEdit}
          onSaved={afterMutation}
        />
        <CloneKeyResultButton
          keyResult={kr}
          users={users}
          canClone={canClone}
          onCloned={afterMutation}
        />
        <EditKeyResultButton
          keyResult={kr}
          users={users}
          canEdit={canEdit}
          onUpdated={afterMutation}
        />
        <ArchiveKeyResultButton
          keyResult={kr}
          canArchive={canArchive}
          onArchived={afterMutation}
        />
        <DeleteKeyResultButton
          keyResult={kr}
          canDelete={canDelete}
          onDeleted={afterMutation}
        />
        <KeyResultActionsMenu
          keyResult={kr}
          extrasOnly
          chartElementId={`kr-chart-${kr.id}`}
          onChanged={afterMutation}
        />
      </div>
    )
  }

  const renderActiveRow = (kr: any) => {
    const confidence = kr.confidence ?? 'ON_TRACK'
    const progress = safeProgressPercent(kr.progress)
    const progressBar = getProgressColor(progress).split(' ')[0].replace('text-', 'bg-')
    const ownerName = kr.owner?.name || 'Unknown'

    return (
      <li key={kr.id} className="group rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${CONFIDENCE_DOT[confidence] ?? 'bg-gray-300'}`}
            title={confidence.replace(/_/g, ' ')}
          />

          <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

          <Link
            href={`/dashboard/key-results/${kr.id}`}
            className="text-sm font-medium text-foreground hover:text-blue-700 hover:underline truncate"
          >
            {kr.title}
          </Link>

          <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
            {kr.currentValue}/{kr.targetValue}{kr.unit ? ` ${kr.unit}` : ''}
          </span>

          <span className="ml-auto flex items-center gap-2 shrink-0">
            <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${progressBar}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={`text-xs font-semibold tabular-nums w-9 text-right ${getProgressColor(progress)}`}>
              {Math.round(progress)}%
            </span>

            {kr.owner?.avatar ? (
              <img
                src={kr.owner.avatar}
                alt={ownerName}
                title={ownerName}
                className="h-5 w-5 rounded-full"
              />
            ) : (
              <div
                className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-[9px] font-semibold text-white"
                title={ownerName}
              >
                {getInitials(ownerName)}
              </div>
            )}

            {perm ? renderKeyResultActions(kr) : null}
          </span>
        </div>

        <ToDoList
          keyResultId={kr.id}
          keyResult={kr}
          users={users}
          variant="embedded"
          defaultExpanded={false}
          onChanged={afterMutation}
        />
      </li>
    )
  }

  const renderArchivedRow = (kr: any) => {
    const progress = safeProgressPercent(kr.progress)
    const progressBar = getProgressColor(progress).split(' ')[0].replace('text-', 'bg-')
    const ownerName = kr.owner?.name || 'Unknown'

    return (
      <li key={kr.id} className="group rounded-md px-2 py-1.5 bg-orange-50/40 hover:bg-orange-50 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <Archive className="h-3.5 w-3.5 shrink-0 text-orange-600" />
          <Link
            href={`/dashboard/key-results/${kr.id}`}
            className="text-sm font-medium text-foreground line-through hover:text-blue-700 truncate"
          >
            {kr.title}
          </Link>
          <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
            {kr.currentValue}/{kr.targetValue}{kr.unit ? ` ${kr.unit}` : ''}
          </span>
          <span className="hidden lg:inline text-[10px] text-orange-800 bg-orange-100 px-1.5 py-0.5 rounded">
            Archived {new Date(kr.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>

          <span className="ml-auto flex items-center gap-2 shrink-0">
            <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full ${progressBar}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={`text-xs font-semibold tabular-nums w-9 text-right ${getProgressColor(progress)}`}>
              {Math.round(progress)}%
            </span>
            {kr.owner?.avatar ? (
              <img src={kr.owner.avatar} alt={ownerName} title={ownerName} className="h-5 w-5 rounded-full" />
            ) : (
              <div
                className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-[9px] font-semibold text-white"
                title={ownerName}
              >
                {getInitials(ownerName)}
              </div>
            )}
            {perm ? (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <CloneKeyResultButton
                  keyResult={kr}
                  users={users}
                  canClone={perm.canCloneKeyResults}
                  onCloned={afterMutation}
                />
                <EditKeyResultButton
                  keyResult={kr}
                  users={users}
                  canEdit={perm.canEditByKeyResultId[kr.id] === true}
                  onUpdated={afterMutation}
                />
                <UnarchiveKeyResultButton
                  keyResult={kr}
                  canUnarchive={perm.canEditByKeyResultId[kr.id] === true}
                  onDone={afterMutation}
                />
                <DeleteKeyResultButton
                  keyResult={kr}
                  canDelete={perm.canDeleteKeyResults}
                  onDeleted={afterMutation}
                />
              </div>
            ) : null}
          </span>
        </div>

        <ToDoList
          keyResultId={kr.id}
          keyResult={kr}
          users={users}
          variant="embedded"
          defaultExpanded={false}
          onChanged={afterMutation}
        />
      </li>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Key Results · {activeKeyResults.length}
          </h3>
          {perm && (
            <AddKeyResultButton
              objective={objective}
              users={users}
              canCreate={perm.canCreate}
              onCreated={afterMutation}
            />
          )}
        </div>
        {activeKeyResults.length > 0 && (
          <ul className="divide-y divide-border/60">
            {activeKeyResults.map(renderActiveRow)}
          </ul>
        )}
      </div>

      {archivedKeyResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Archived · {archivedKeyResults.length}
            </h3>
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Archive className="h-3 w-3" />
              {showArchived ? 'Hide' : 'Show'}
            </button>
          </div>

          {showArchived && (
            <ul className="divide-y divide-border/60">
              {archivedKeyResults.map(renderArchivedRow)}
            </ul>
          )}
        </div>
      )}

      {list.length === 0 && (
        <div className="text-center py-6">
          <Target className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No key results yet.</p>
          {perm && (
            <div className="mt-3 flex justify-center">
              <AddKeyResultButton
                objective={objective}
                users={users}
                canCreate={perm.canCreate}
                onCreated={afterMutation}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
