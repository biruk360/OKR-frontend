import Link from 'next/link'
import { Target, ListTodo } from 'lucide-react'

type ColumnKey = 'TODO' | 'IN_PROGRESS' | 'DONE'

interface WorkItem {
  id: string
  title: string
  kind: 'KR' | 'INITIATIVE'
  column: ColumnKey
  href: string
  meta?: string
}

export interface WorkItemsKanbanProps {
  keyResults?: Array<{
    id: string
    title: string
    progress: number
    confidence: string
    status: string
  }>
  initiatives?: Array<{
    id: string
    title: string
    status: string // PENDING | IN_PROGRESS | COMPLETED | CANCELLED
    keyResultId?: string | null
  }>
  title?: string
}

/**
 * Three-column board (To Do · In Progress · Done) that folds KR and initiative
 * work into a single view. KR column is derived from progress:
 *   - 0%         → To Do
 *   - 1%..99%    → In Progress
 *   - 100% / CLOSED / completed → Done
 * Initiatives use their own `status` field. Cancelled initiatives are hidden.
 */
export default function WorkItemsKanban({
  keyResults = [],
  initiatives = [],
  title = 'Work items',
}: WorkItemsKanbanProps) {
  const items: WorkItem[] = []

  for (const kr of keyResults) {
    if (kr.status === 'DELETED') continue
    let column: ColumnKey
    if (kr.progress >= 100 || kr.status === 'ARCHIVED') column = 'DONE'
    else if (kr.progress > 0) column = 'IN_PROGRESS'
    else column = 'TODO'
    items.push({
      id: `kr:${kr.id}`,
      title: kr.title,
      kind: 'KR',
      column,
      href: `/dashboard/key-results/${kr.id}`,
      meta: `${Math.round(kr.progress)}% · ${kr.confidence.replace(/_/g, ' ').toLowerCase()}`,
    })
  }

  for (const t of initiatives) {
    if (t.status === 'CANCELLED') continue
    let column: ColumnKey
    if (t.status === 'COMPLETED') column = 'DONE'
    else if (t.status === 'IN_PROGRESS') column = 'IN_PROGRESS'
    else column = 'TODO'
    items.push({
      id: `i:${t.id}`,
      title: t.title,
      kind: 'INITIATIVE',
      column,
      href: t.keyResultId ? `/dashboard/key-results/${t.keyResultId}` : '/dashboard/todos',
      meta: t.status.replace(/_/g, ' ').toLowerCase(),
    })
  }

  const columns: Array<{ key: ColumnKey; label: string; tint: string }> = [
    { key: 'TODO', label: 'To do', tint: 'bg-slate-50 border-slate-200' },
    { key: 'IN_PROGRESS', label: 'In progress', tint: 'bg-amber-50 border-amber-200' },
    { key: 'DONE', label: 'Done', tint: 'bg-emerald-50 border-emerald-200' },
  ]

  return (
    <section className="bg-white shadow rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map((col) => {
          const colItems = items.filter((i) => i.column === col.key)
          return (
            <div key={col.key} className={`rounded-md border ${col.tint} p-2 min-h-[120px]`}>
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{col.label}</h4>
                <span className="text-xs text-gray-500 tabular-nums">{colItems.length}</span>
              </div>
              {colItems.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">No items</p>
              ) : (
                <ul className="space-y-2">
                  {colItems.map((it) => {
                    const Icon = it.kind === 'KR' ? Target : ListTodo
                    const chipColour =
                      it.kind === 'KR'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    return (
                      <li
                        key={it.id}
                        className="rounded-md bg-white border border-gray-200 p-2 text-sm hover:shadow-sm"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${chipColour}`}>
                            <Icon className="h-3 w-3" />
                            {it.kind === 'KR' ? 'KR' : 'Init'}
                          </span>
                          {it.meta && (
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide">{it.meta}</span>
                          )}
                        </div>
                        <Link
                          href={it.href}
                          className="block text-sm text-gray-800 hover:text-blue-600 line-clamp-2"
                        >
                          {it.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
