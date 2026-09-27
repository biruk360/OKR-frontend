'use client'

/**
 * Card modal checklists: progress, hide-checked toggle, per-item complete /
 * rename / due date / assignee / delete, and the add-item row. State and API
 * calls stay in TodoCardModal; this renders them. Split out of
 * TodoCardModal.tsx; behaviour unchanged.
 */

import type { Dispatch, SetStateAction } from 'react'
import { Check, Trash2, Users, Calendar, MoreHorizontal, CheckSquare, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { UserForSelection } from '@/hooks/useUsersForSelection'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { AppleDatePicker, toIso } from '@/components/ui/date-picker'
import { PersonTooltip } from '@/components/shared/UserAvatar'
import { Avatar, ChecklistProgress } from './CardModalBits'
import type { TodoCardData } from './cardModalTypes'

export type EditingChecklistItem = { checklistId: string; itemId: string; title: string } | null

export interface CardChecklistsProps {
  todo: TodoCardData
  users: UserForSelection[]
  hideChecked: Record<string, boolean>
  setHideChecked: Dispatch<SetStateAction<Record<string, boolean>>>
  editingItem: EditingChecklistItem
  setEditingItem: (v: EditingChecklistItem) => void
  newItemTitles: Record<string, string>
  setNewItemTitles: Dispatch<SetStateAction<Record<string, string>>>
  deleteChecklist: (checklistId: string) => void
  toggleChecklistItem: (checklistId: string, itemId: string, completed: boolean) => void
  patchChecklistItem: (
    checklistId: string,
    itemId: string,
    data: { title?: string; completed?: boolean; assigneeId?: string | null; dueDate?: string | null },
  ) => Promise<boolean>
  deleteChecklistItem: (checklistId: string, itemId: string) => void
  addChecklistItem: (checklistId: string) => void
}

export function CardChecklists({
  todo, users, hideChecked, setHideChecked, editingItem, setEditingItem, newItemTitles, setNewItemTitles,
  deleteChecklist, toggleChecklistItem, patchChecklistItem, deleteChecklistItem, addChecklistItem,
}: CardChecklistsProps) {
  return (
    <>
      {todo.checklists.map((cl) => (
        <div key={cl.id} className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckSquare className="h-[15px] w-[15px] shrink-0 text-[var(--ap-fg-subtle)]" />
              <h3 className="truncate text-sm font-semibold text-[var(--ap-fg)]">{cl.title}</h3>
              <span className="shrink-0 font-mono text-caption text-[var(--ap-fg-subtle)]">
                {cl.items.filter((i) => i.completed).length}/{cl.items.length}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
            {cl.items.some((i) => i.completed) && (
              <button
                onClick={() => setHideChecked((h) => ({ ...h, [cl.id]: !h[cl.id] }))}
                aria-pressed={!!hideChecked[cl.id]}
                className="inline-flex h-7 items-center rounded-[var(--ap-radius-sm)] bg-[var(--ap-bg-sunken)] px-2.5 text-caption font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
              >
                {hideChecked[cl.id] ? 'Show checked' : 'Hide checked'}
              </button>
            )}
            <button
              onClick={() => deleteChecklist(cl.id)}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 text-caption font-semibold text-[var(--ap-fg-muted)] hover:border-[var(--ap-danger)] hover:bg-[var(--ap-danger-bg)] hover:text-[var(--ap-danger)] transition-all"
            >
              Delete
            </button>
            </div>
          </div>
          <ChecklistProgress items={cl.items} />
          <div className="space-y-0.5">
            {cl.items.filter((i) => !(hideChecked[cl.id] && i.completed)).map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2 py-1.5 hover:bg-[var(--ap-bg-hover)] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleChecklistItem(cl.id, item.id, !item.completed)}
                  className={cn(
                    'flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
                    item.completed
                      ? 'border-[var(--ap-ok)] bg-[var(--ap-ok)]'
                      : 'border-[var(--ap-border-strong)] bg-transparent hover:border-[var(--ap-fg-muted)]',
                  )}
                >
                  {item.completed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </button>
                {editingItem?.itemId === item.id ? (
                  <input
                    autoFocus
                    value={editingItem.title}
                    onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    onBlur={() => {
                      const next = editingItem.title.trim()
                      if (next && next !== item.title) patchChecklistItem(cl.id, item.id, { title: next })
                      setEditingItem(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
                      if (e.key === 'Escape') setEditingItem(null)
                    }}
                    aria-label="Checklist item title"
                    className="flex-1 min-w-0 rounded-[var(--ap-radius-xs)] border px-1.5 py-0.5 text-body-sm outline-none"
                    style={{ borderColor: 'var(--ap-accent)', background: 'var(--ap-bg-raised)' }}
                  />
                ) : (
                  <span className={cn(
                    'flex-1 text-body-sm leading-snug min-w-0',
                    item.completed && 'line-through text-[var(--ap-fg-subtle)]',
                  )}>
                    {item.title}
                  </span>
                )}
                {item.dueDate && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-[2px] text-micro font-semibold text-[var(--ap-fg-muted)]">
                    <Calendar className="h-2.5 w-2.5" />
                    {format(new Date(item.dueDate), 'MMM d')}
                  </span>
                )}
                {item.assignee && (
                  <Avatar id={item.assignee.id} name={item.assignee.name} avatar={item.assignee.avatar} size={20} tooltip detail="Assigned to this item" />
                )}
                {/* Per-item actions. Focus-within keeps them reachable by
                    keyboard; group-hover alone would hide them from tab users.
                    They fade rather than mount: `hidden → flex` put three 24px
                    buttons into the flow on hover, so every row visibly jumped
                    as the pointer crossed it. Reserving the space costs ~80px
                    of title width and removes the reflow entirely. */}
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={item.dueDate ? `Change due date for ${item.title}` : `Set due date for ${item.title}`}
                        className="flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                      >
                        <Calendar className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent label="Checklist item due date" heading="Due date" align="end" className="w-[260px]">
                      <AppleDatePicker
                        value={item.dueDate ? toIso(new Date(item.dueDate)) : null}
                        onChange={(iso) => patchChecklistItem(cl.id, item.id, { dueDate: iso })}
                        placeholder="Pick a date"
                      />
                      {item.dueDate && (
                        <button
                          type="button"
                          onClick={() => patchChecklistItem(cl.id, item.id, { dueDate: null })}
                          className="mt-2 w-full rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-xs font-semibold text-[var(--ap-danger-fg)] hover:bg-[var(--ap-danger-bg)] transition-colors"
                        >
                          Remove due date
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Assign ${item.title}`}
                        className="flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                      >
                        <Users className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent label="Assign checklist item" heading="Assign" align="end" className="w-[260px]">
                      <div className="max-h-[220px] space-y-0.5 overflow-y-auto">
                        {item.assignee && (
                          <button
                            type="button"
                            onClick={() => patchChecklistItem(cl.id, item.id, { assigneeId: null })}
                            className="flex w-full items-center gap-2 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--ap-danger-fg)] hover:bg-[var(--ap-bg-hover)]"
                          >
                            Unassign
                          </button>
                        )}
                        {users.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => patchChecklistItem(cl.id, item.id, { assigneeId: u.id })}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-[var(--ap-bg-hover)]',
                              item.assignee?.id === u.id && 'bg-[var(--ap-bg-hover)] font-semibold',
                            )}
                          >
                            <Avatar id={u.id} name={u.name ?? u.email} avatar={null} size={20} />
                            <PersonTooltip person={u} whenTruncated side="left"><span className="truncate">{u.name ?? u.email}</span></PersonTooltip>
                            {item.assignee?.id === u.id && (
                              <Check className="ml-auto h-3 w-3 text-[var(--ap-accent)]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <ActionsMenu
                    label={`More actions for ${item.title}`}
                    className="flex h-6 w-6 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] transition-colors"
                    trigger={<MoreHorizontal className="h-3 w-3" />}
                    items={[
                      {
                        key: 'rename',
                        label: 'Rename',
                        icon: Pencil,
                        onSelect: () => setEditingItem({ checklistId: cl.id, itemId: item.id, title: item.title }),
                      },
                      {
                        key: 'delete',
                        label: 'Delete item',
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => deleteChecklistItem(cl.id, item.id),
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pl-7">
            <input
              value={newItemTitles[cl.id] ?? ''}
              onChange={(e) => setNewItemTitles((p) => ({ ...p, [cl.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(cl.id) }}
              placeholder="Add an item"
              className="flex-1 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 h-8 text-body-sm outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-transparent transition-all"
            />
            <button
              onClick={() => addChecklistItem(cl.id)}
              disabled={!newItemTitles[cl.id]?.trim()}
              className="ap-btn ap-btn-primary ap-btn-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
