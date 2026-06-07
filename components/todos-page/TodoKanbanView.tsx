'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { Calendar, Inbox, Link2, Target } from 'lucide-react'
import { KanbanDropLine } from '@/components/shared/KanbanDropLine'
import type { TodoRow, UserOption } from './TodosPageClient'

const COLUMNS: Array<{ key: string; label: string; color: string }> = [
  { key: 'PENDING',     label: 'To do',       color: '#c1c7d0' },
  { key: 'IN_PROGRESS', label: 'In progress', color: '#2563eb' },
  { key: 'COMPLETED',   label: 'Done',        color: '#059669' },
  { key: 'CANCELLED',   label: 'Cancelled',   color: '#a5adba' },
]

interface Props {
  rows: TodoRow[]
  users: UserOption[]
  onToggle: (row: TodoRow) => void
  onStatusChange: (rowId: string, status: string) => void
  onReorder: (columnOrders: Record<string, string[]>) => void
  onOpen: (rowId: string) => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
}

export default function TodoKanbanView({
  rows, users, onToggle, onStatusChange, onReorder, onOpen, onAssigneeChange,
}: Props) {
  // Local column state for optimistic updates during drag
  const [localRows, setLocalRows] = useState<TodoRow[]>(rows)
  useEffect(() => { setLocalRows(rows) }, [rows])

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const indicatorRef = useRef<{ colKey: string; afterIndex: number } | null>(null)
  const [indicator, setIndicator] = useState<{ colKey: string; afterIndex: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  const updateIndicator = useCallback((colKey: string, afterIndex: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (
        indicatorRef.current?.colKey === colKey &&
        indicatorRef.current?.afterIndex === afterIndex
      ) return
      indicatorRef.current = { colKey, afterIndex }
      setIndicator({ colKey, afterIndex })
    })
  }, [])

  const clearIndicator = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    indicatorRef.current = null
    setIndicator(null)
  }, [])

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[400px]">
      {COLUMNS.map((col) => {
        const colRows = localRows.filter((r) => r.status === col.key)
        const isEmpty = colRows.length === 0

        return (
          <div
            key={col.key}
            className="w-[260px] flex-shrink-0 rounded-md bg-muted border border-border"
            onDragOver={(e) => {
              e.preventDefault()
              const cardEls = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>('[data-todo-card]')
              )
              let afterIndex = colRows.length - 1
              for (let i = 0; i < cardEls.length; i++) {
                const rect = cardEls[i].getBoundingClientRect()
                if (e.clientY < rect.top + rect.height / 2) {
                  afterIndex = i - 1
                  break
                }
              }
              updateIndicator(col.key, afterIndex)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) clearIndicator()
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (!draggedId) return
              const ind = indicatorRef.current
              clearIndicator()
              setDraggedId(null)

              const sourceRow = localRows.find((r) => r.id === draggedId)
              if (!sourceRow) return

              const insertAfter = ind?.colKey === col.key ? ind.afterIndex : colRows.length - 1
              const destRows = colRows.filter((r) => r.id !== draggedId)
              const insertIdx = insertAfter + 1
              const newColOrder = [
                ...destRows.slice(0, insertIdx),
                { ...sourceRow, status: col.key },
                ...destRows.slice(insertIdx),
              ]

              // Optimistic update
              setLocalRows((prev) => {
                const rest = prev.filter((r) => r.id !== draggedId)
                const targetColRows = rest.filter((r) => r.status === col.key)
                const otherRows = rest.filter((r) => r.status !== col.key)
                const idx = insertAfter + 1
                const updated = [
                  ...targetColRows.slice(0, idx),
                  { ...sourceRow, status: col.key },
                  ...targetColRows.slice(idx),
                ]
                return [...otherRows, ...updated]
              })

              // Persist order
              const columnOrders: Record<string, string[]> = {
                [col.key]: newColOrder.map((r) => r.id),
              }
              if (sourceRow.status !== col.key) {
                columnOrders[sourceRow.status] = localRows
                  .filter((r) => r.status === sourceRow.status && r.id !== draggedId)
                  .map((r) => r.id)
                onStatusChange(draggedId, col.key)
              }
              onReorder(columnOrders)
            }}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
              <span className="text-[12px] font-semibold text-foreground uppercase tracking-wide">
                {col.label}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">{colRows.length}</span>
            </div>

            {/* Cards */}
            <div className="p-1.5 space-y-0 min-h-[60px]">
              {/* Drop indicator before first card */}
              <KanbanDropLine active={!!indicator && indicator.colKey === col.key && indicator.afterIndex === -1} />

              {isEmpty && indicator?.colKey === col.key ? (
                <div className="flex min-h-[60px] items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-[11px] text-primary">
                  Drop here
                </div>
              ) : isEmpty ? (
                <div className="flex flex-col items-center gap-1 py-6 text-[11px] text-muted-foreground">
                  <Inbox className="size-4 opacity-60" />
                  <span>No items</span>
                </div>
              ) : (
                colRows.map((row, cardIdx) => (
                  <div key={row.id} data-todo-card>
                    <KanbanCard
                      row={row}
                      users={users}
                      isDragging={draggedId === row.id}
                      onDragStart={() => setDraggedId(row.id)}
                      onDragEnd={() => { clearIndicator(); setDraggedId(null) }}
                      onOpen={() => onOpen(row.id)}
                      onAssigneeChange={onAssigneeChange}
                    />
                    <KanbanDropLine
                      active={!!indicator && indicator.colKey === col.key && indicator.afterIndex === cardIdx}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanCard({
  row, users, isDragging, onDragStart, onDragEnd, onOpen, onAssigneeChange,
}: {
  row: TodoRow
  users: UserOption[]
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onOpen: () => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
}) {
  const overdue = row.dueDate && row.status !== 'COMPLETED' && new Date(row.dueDate).getTime() < Date.now()

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="mt-1.5 rounded-lg border border-border bg-card p-2 cursor-pointer hover:border-[color:#c1c7d0] transition"
      style={{ opacity: isDragging ? 0.4 : undefined }}
    >
      <div className="text-[13px] font-medium text-foreground break-words">{row.title}</div>
      {(row.keyResult || row.objective) && (
        <div className="mt-1 text-[11px] text-muted-foreground truncate">
          {row.keyResult ? (
            <span className="inline-flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" /> {row.keyResult.title}</span>
          ) : row.objective ? (
            <span className="inline-flex items-center gap-0.5"><Target className="h-2.5 w-2.5" /> {row.objective.title}</span>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="inline-flex items-center justify-center rounded-full bg-muted text-xs font-semibold"
          style={{ width: 20, height: 20, fontSize: 9 }}
          title={row.assignee?.name ?? 'Unassigned'}
        >
          {row.assignee?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.assignee.avatar} alt="" className="rounded-full w-full h-full object-cover" />
          ) : row.assignee ? (
            row.assignee.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
          ) : '—'}
        </span>
        {row.dueDate && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] ${
              overdue ? 'text-destructive font-medium' : 'text-muted-foreground'
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
