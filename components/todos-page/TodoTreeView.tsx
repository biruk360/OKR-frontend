'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronRight,
  ChevronDown,
  Target,
  Link2,
  Calendar,
  Plus,
  User as UserIcon,
} from 'lucide-react'
import type { TodoRow, UserOption } from './TodosPageClient'

interface Props {
  rows: TodoRow[]
  users: UserOption[]
  onToggle: (row: TodoRow) => void
  onOpen: (rowId: string) => void
  onStatusChange: (rowId: string, status: string) => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
  onDueDateChange: (rowId: string, dueDate: string | null) => void
}

interface TreeNode {
  type: 'objective' | 'kr' | 'standalone'
  id: string
  label: string
  level?: string
  todos: TodoRow[]
  children: TreeNode[]
}

export default function TodoTreeView({ rows, users, onToggle, onOpen, onStatusChange, onAssigneeChange, onDueDateChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Build tree: Objective → KR → Todos, plus a "standalone" bucket
  const tree = useMemo(() => {
    const objMap = new Map<string, TreeNode>()
    const krMap = new Map<string, TreeNode>()
    const standalone: TodoRow[] = []

    for (const row of rows) {
      if (row.keyResult) {
        const objId = row.keyResult.objective.id
        const krId = row.keyResult.id

        if (!objMap.has(objId)) {
          objMap.set(objId, {
            type: 'objective',
            id: objId,
            label: row.keyResult.objective.title,
            level: row.keyResult.objective.level,
            todos: [],
            children: [],
          })
        }
        if (!krMap.has(krId)) {
          const krNode: TreeNode = {
            type: 'kr',
            id: krId,
            label: row.keyResult.title,
            todos: [],
            children: [],
          }
          krMap.set(krId, krNode)
          objMap.get(objId)!.children.push(krNode)
        }
        krMap.get(krId)!.todos.push(row)
      } else if (row.objective) {
        const objId = row.objective.id
        if (!objMap.has(objId)) {
          objMap.set(objId, {
            type: 'objective',
            id: objId,
            label: row.objective.title,
            level: row.objective.level,
            todos: [],
            children: [],
          })
        }
        objMap.get(objId)!.todos.push(row)
      } else {
        standalone.push(row)
      }
    }

    const result: TreeNode[] = Array.from(objMap.values())
    if (standalone.length > 0) {
      result.push({ type: 'standalone', id: '__standalone__', label: 'Personal to-dos', todos: standalone, children: [] })
    }
    return result
  }, [rows])

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }))
  }

  return (
    <div className="space-y-0.5">
      {tree.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">No to-dos to display.</div>
      )}
      {tree.map((node) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          users={users}
          onToggle={onToggle}
          onOpen={onOpen}
          onStatusChange={onStatusChange}
          onAssigneeChange={onAssigneeChange}
          onDueDateChange={onDueDateChange}
        />
      ))}
    </div>
  )
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  toggle,
  users,
  onToggle,
  onOpen,
  onStatusChange,
  onAssigneeChange,
  onDueDateChange,
}: {
  node: TreeNode
  depth: number
  expanded: Record<string, boolean>
  toggle: (id: string) => void
  users: UserOption[]
  onToggle: (row: TodoRow) => void
  onOpen: (rowId: string) => void
  onStatusChange: (rowId: string, status: string) => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
  onDueDateChange: (rowId: string, dueDate: string | null) => void
}) {
  const isOpen = expanded[node.id] ?? true
  const hasChildren = node.children.length > 0 || node.todos.length > 0
  const totalTodos = node.todos.length + node.children.reduce((s, c) => s + c.todos.length, 0)
  const completedTodos = node.todos.filter((t) => t.status === 'COMPLETED').length +
    node.children.reduce((s, c) => s + c.todos.filter((t) => t.status === 'COMPLETED').length, 0)

  const levelBadge = node.type === 'objective'
    ? node.level === 'COMPANY' ? 'bg-[color:#dbeafe] text-primary-500'
      : node.level === 'DEPARTMENT' ? 'bg-[color:#ede9fe] text-purple-600'
      : 'bg-[color:#ebecf0] text-muted-foreground'
    : null

  const icon = node.type === 'objective' ? <Target className="h-3.5 w-3.5" />
    : node.type === 'kr' ? <Link2 className="h-3.5 w-3.5" />
    : null

  const progressPct = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0

  return (
    <div>
      {/* Node header */}
      <div
        className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted transition cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && toggle(node.id)}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        <span className="text-[13px] font-medium text-foreground truncate flex-1">
          {node.label}
        </span>
        {levelBadge && (
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${levelBadge}`}>
            {node.level?.toLowerCase()}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums ml-2">
          {completedTodos}/{totalTodos}
        </span>
        <div className="w-12 h-1 w-full bg-muted rounded-full overflow-hidden ml-1">
          <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Children */}
      {isOpen && (
        <>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              users={users}
              onToggle={onToggle}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              onAssigneeChange={onAssigneeChange}
              onDueDateChange={onDueDateChange}
            />
          ))}
          {node.todos.map((todo) => (
            <TodoLeafRow
              key={todo.id}
              todo={todo}
              depth={depth + (node.children.length > 0 ? 2 : 1)}
              users={users}
              onToggle={onToggle}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              onAssigneeChange={onAssigneeChange}
              onDueDateChange={onDueDateChange}
            />
          ))}
        </>
      )}
    </div>
  )
}

function TodoLeafRow({
  todo,
  depth,
  users,
  onToggle,
  onOpen,
  onStatusChange,
  onAssigneeChange,
  onDueDateChange,
}: {
  todo: TodoRow
  depth: number
  users: UserOption[]
  onToggle: (row: TodoRow) => void
  onOpen: (rowId: string) => void
  onStatusChange: (rowId: string, status: string) => void
  onAssigneeChange: (rowId: string, assigneeId: string) => void
  onDueDateChange: (rowId: string, dueDate: string | null) => void
}) {
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const isDone = todo.status === 'COMPLETED'
  const overdue = !isDone && todo.dueDate && new Date(todo.dueDate).getTime() < Date.now()

  return (
    <div
      className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted transition"
      style={{ paddingLeft: `${depth * 20 + 8}px` }}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(todo)}
        className="appearance-none w-3.5 h-3.5 rounded border border-border"
        onClick={(e) => e.stopPropagation()}
      />
      <span
        className={`flex-1 text-[13px] truncate cursor-pointer ${
          isDone ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}
        onClick={() => onOpen(todo.id)}
      >
        {todo.title}
      </span>

      {/* Inline assignee */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setEditingAssignee(!editingAssignee) }}
          className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-xs font-semibold"
          style={{ width: 20, height: 20, fontSize: 9 }}
          title={todo.assignee?.name ?? 'Unassigned'}
        >
          {todo.assignee ? todo.assignee.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : '—'}
        </button>
        {editingAssignee && (
          <div className="absolute right-0 top-6 z-20 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[200px] max-h-[200px] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {users.map((u) => (
              <button
                key={u.id}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer"
                onClick={() => { onAssigneeChange(todo.id, u.id); setEditingAssignee(false) }}
              >
                <span className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-xs font-semibold" style={{ width: 16, height: 16, fontSize: 8 }}>
                  {u.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inline status */}
      <select
        value={todo.status}
        onChange={(e) => { e.stopPropagation(); onStatusChange(todo.id, e.target.value) }}
        onClick={(e) => e.stopPropagation()}
        className="input input text-[11px] w-[90px] h-5 px-1 py-0"
        style={{ fontSize: 11 }}
      >
        <option value="PENDING">To do</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="COMPLETED">Done</option>
        <option value="CANCELLED">Cancelled</option>
      </select>

      {/* Inline due date */}
      <div className="relative">
        {editingDate ? (
          <input
            autoFocus
            type="date"
            defaultValue={todo.dueDate?.slice(0, 10) || ''}
            onChange={(e) => { onDueDateChange(todo.id, e.target.value || null); setEditingDate(false) }}
            onBlur={() => setEditingDate(false)}
            onClick={(e) => e.stopPropagation()}
            className="input text-[11px] w-[110px] h-5 px-1 py-0"
          />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setEditingDate(true) }}
            className={`text-[11px] inline-flex items-center gap-0.5 ${
              overdue ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            <Calendar className="h-2.5 w-2.5" />
            {todo.dueDate
              ? new Date(todo.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'No date'}
          </button>
        )}
      </div>
    </div>
  )
}
