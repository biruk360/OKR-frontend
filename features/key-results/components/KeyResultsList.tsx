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
  // Show archived KRs by default, appended at the end of the active list.
  const [showArchived, setShowArchived] = useState(true)
  const [perm, setPerm] = useState<KeyResultPermissions | null>(null)

  // Fetch shared users list only when the parent didn't supply one (cached via React Query).
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
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
      <div className="flex items-center flex-wrap gap-1">
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
        {/* Overflow menu surfaces the newer actions (mark complete, request check-in,
            audit log, download chart) without duplicating the inline buttons above. */}
        <KeyResultActionsMenu
          keyResult={kr}
          extrasOnly
          chartElementId={`kr-chart-${kr.id}`}
          onChanged={afterMutation}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">
            Active Key Results ({activeKeyResults.length})
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
          <ul className="space-y-3">
            {activeKeyResults.map((kr) => {
              const confidence = kr.confidence ?? 'ON_TRACK'
              return (
              <li key={kr.id} className="bg-muted p-4 rounded-md border border-border">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <Link
                        href={`/dashboard/key-results/${kr.id}`}
                        className="font-medium text-foreground hover:text-blue-700 hover:underline"
                      >
                        {kr.title}
                      </Link>
                      {perm ? renderKeyResultActions(kr) : null}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Target: {kr.targetValue} {kr.unit} • Current: {kr.currentValue} {kr.unit}
                    </div>
                    <div className="flex items-center space-x-4 text-xs">
                      <div className="flex items-center bg-muted px-2 py-1 rounded-md border border-border">
                        {kr.owner?.avatar ? (
                          <img
                            src={kr.owner.avatar}
                            alt={kr.owner?.name || 'Owner'}
                            className="h-4 w-4 rounded-full mr-1.5"
                          />
                        ) : (
                          <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center mr-1.5">
                            <User className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                        <span className="font-medium text-muted-foreground">{kr.owner?.name || 'Unknown'}</span>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          confidence === 'ON_TRACK'
                            ? 'bg-green-100 text-green-800'
                            : confidence === 'AT_RISK'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {confidence.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className={`font-semibold ${getProgressColor(safeProgressPercent(kr.progress))}`}>
                          {Math.round(safeProgressPercent(kr.progress))}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            getProgressColor(safeProgressPercent(kr.progress)).split(' ')[0].replace('text-', 'bg-')
                          }`}
                          style={{ width: `${safeProgressPercent(kr.progress)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <ToDoList keyResultId={kr.id} keyResult={kr} users={users} variant="embedded" onChanged={afterMutation} />
              </li>
              )
            })}
          </ul>
        )}
      </div>

      {archivedKeyResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-foreground">
              Archived Key Results ({archivedKeyResults.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="text-sm text-muted-foreground hover:text-muted-foreground flex items-center"
            >
              <Archive className="h-4 w-4 mr-1" />
              {showArchived ? 'Hide' : 'Show'} Archived
            </button>
          </div>

          {showArchived && (
            <ul className="space-y-3">
              {archivedKeyResults.map((kr) => (
                <li key={kr.id} className="bg-orange-50 p-4 rounded-md border border-orange-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Archive className="h-4 w-4 text-orange-600" />
                        <Link
                          href={`/dashboard/key-results/${kr.id}`}
                          className="font-medium text-foreground line-through hover:text-blue-700 hover:no-underline"
                        >
                          {kr.title}
                        </Link>
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                          Archived
                        </span>
                        {perm ? (
                          <div className="flex items-center space-x-1">
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
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        Target: {kr.targetValue} {kr.unit} • Current: {kr.currentValue} {kr.unit}
                      </div>
                      <div className="flex items-center space-x-4 text-xs">
                        <div className="flex items-center bg-muted px-2 py-1 rounded-md border border-border">
                          {kr.owner?.avatar ? (
                            <img
                              src={kr.owner.avatar}
                              alt={kr.owner?.name || 'Owner'}
                              className="h-4 w-4 rounded-full mr-1.5"
                            />
                          ) : (
                            <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center mr-1.5">
                              <User className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                          <span className="font-medium text-muted-foreground">{kr.owner?.name || 'Unknown'}</span>
                        </div>
                        <span className="text-muted-foreground">
                          Archived: {new Date(kr.archivedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Progress (at time of archiving)</span>
                          <span className={`font-semibold ${getProgressColor(safeProgressPercent(kr.progress))}`}>
                            {Math.round(safeProgressPercent(kr.progress))}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              getProgressColor(safeProgressPercent(kr.progress)).split(' ')[0].replace('text-', 'bg-')
                            }`}
                            style={{ width: `${safeProgressPercent(kr.progress)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <ToDoList keyResultId={kr.id} keyResult={kr} users={users} variant="embedded" onChanged={afterMutation} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {list.length === 0 && (
        <div className="text-center py-8">
          <Target className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No key results</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No key results have been defined for this objective yet.
          </p>
          {perm && (
            <div className="mt-4 flex justify-center">
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
