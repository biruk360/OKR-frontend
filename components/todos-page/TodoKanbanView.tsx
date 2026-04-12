'use client'

import { useRef, useCallback } from 'react'
import { Calendar, Link2, Target, User as UserIcon } from 'lucide-react'
import type { TodoRow, UserOption } from './TodosPageClient'

const COLUMNS: Array<{ key: string; label: string; color: string }> = [
  { key: 'PENDING', label: 'To do', color: 'var(--atlas-n40)' },
  { key: 'IN_PROGRESS', label: 'In progress', color: 'var(--atlas-primary)' },
  { key: 'COMPLETED', label: 'Done', color: 'var(--atlas-success)' },
  { key: 'CANCELLED', label: 'Cancelled', color: 'var(--atlas-n50)' },
]

interface Props {
  rows: TodoRow[]
  users: UserOption[]
  onToggle: (row: TodoRow) => void
  onStatusChange: (rowId: string, status: string) => void
  onOpen: (rowId: string) => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
}

export default function TodoKanbanView({ rows, users, onToggle, onStatusChange, onOpen, onAssigneeChange }: Props) {
  const dragRef = useRef<{ id: string; fromStatus: string } | null>(null)

  const onDragStart = useCallback((id: string, fromStatus: string) => {
    dragRef.current = { id, fromStatus }
  }, [])

  const onDrop = useCallback(
    (targetStatus: string) => {
      const dragged = dragRef.current
      if (!dragged || dragged.fromStatus === targetStatus) return
      dragRef.current = null
      onStatusChange(dragged.id, targetStatus)
    },
    [onStatusChange]
  )

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[400px]">
      {COLUMNS.map((col) => {
        const colRows = rows.filter((r) => r.status === col.key)
        return (
          <div
            key={col.key}
            className="w-[260px] flex-shrink-0 rounded-md bg-[color:var(--atlas-n10)] border border-[color:var(--atlas-n30)]"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={(e) => { e.preventDefault(); onDrop(col.key) }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--atlas-n30)]">
              <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
              <span className="text-[12px] font-semibold text-[color:var(--atlas-n700)] uppercase tracking-wide">
                {col.label}
              </span>
              <span className="ml-auto text-[11px] text-[color:var(--atlas-n100)]">{colRows.length}</span>
            </div>
            <div className="p-1.5 space-y-1.5 min-h-[60px]">
              {colRows.map((row) => (
                <KanbanCard
                  key={row.id}
                  row={row}
                  users={users}
                  onDragStart={() => onDragStart(row.id, row.status)}
                  onOpen={() => onOpen(row.id)}
                  onAssigneeChange={onAssigneeChange}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanCard({
  row,
  users,
  onDragStart,
  onOpen,
  onAssigneeChange,
}: {
  row: TodoRow
  users: UserOption[]
  onDragStart: () => void
  onOpen: () => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
}) {
  const overdue = row.dueDate && row.status !== 'COMPLETED' && new Date(row.dueDate).getTime() < Date.now()

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onClick={onOpen}
      className="atlas-card p-2 cursor-pointer hover:border-[color:var(--atlas-n40)] transition"
    >
      <div className="text-[13px] font-medium text-[color:var(--atlas-n800)] break-words">{row.title}</div>
      {(row.keyResult || row.objective) && (
        <div className="mt-1 text-[11px] text-[color:var(--atlas-n100)] truncate">
          {row.keyResult ? (
            <span className="inline-flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" /> {row.keyResult.title}</span>
          ) : row.objective ? (
            <span className="inline-flex items-center gap-0.5"><Target className="h-2.5 w-2.5" /> {row.objective.title}</span>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="atlas-avatar" style={{ width: 20, height: 20, fontSize: 9 }} title={row.assignee.name}>
          {row.assignee.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.assignee.avatar} alt="" />
          ) : (
            row.assignee.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
          )}
        </span>
        {row.dueDate && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] ${
              overdue ? 'text-[color:var(--atlas-danger)] font-medium' : 'text-[color:var(--atlas-n100)]'
            }`}
          >
            <Calendar className="h-2.5 w-2.5" />
            {new Date(row.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  )
}
