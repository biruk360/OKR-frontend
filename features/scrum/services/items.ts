import { prisma } from '@/lib/prisma'
import { stripHtml } from './prefill'

export type ScrumItemStatus = 'PENDING' | 'DONE' | 'CARRIED' | 'NOT_DONE'

export interface ScrumItem {
  id: string
  text: string
  todoId?: string
  objectiveId?: string
  keyResultId?: string
  status?: ScrumItemStatus
}

export interface ScrumContentJson {
  yesterdayItems?: ScrumItem[]
  todayItems?: ScrumItem[]
  blockerItems?: ScrumItem[]
  winItems?: ScrumItem[]
}

export function emptyContentJson(): ScrumContentJson {
  return { yesterdayItems: [], todayItems: [], blockerItems: [], winItems: [] }
}

export function normalizeContentJson(value: unknown): ScrumContentJson {
  if (!value || typeof value !== 'object') return emptyContentJson()
  const v = value as Record<string, unknown>
  return {
    yesterdayItems: normalizeItems(v.yesterdayItems),
    todayItems: normalizeItems(v.todayItems),
    blockerItems: normalizeItems(v.blockerItems),
    winItems: normalizeItems(v.winItems),
  }
}

function normalizeItems(items: unknown): ScrumItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((item): item is ScrumItem => item && typeof item === 'object' && typeof (item as ScrumItem).text === 'string' && (item as ScrumItem).text.trim().length > 0)
    .map((item) => ({
      ...item,
      id: item.id || `item-${Math.random().toString(36).slice(2, 9)}`,
      text: item.text.trim(),
    }))
}

export function parseHtmlToItems(htmlOrText: string, defaultStatus: ScrumItemStatus = 'PENDING'): ScrumItem[] {
  const text = stripHtml(htmlOrText)
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•\d.)\]]+\s*/, '').trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `item-${index}`, text, status: defaultStatus }))
}

export function serializeItemsToHtml(items: ScrumItem[] = []): string {
  const lines = items.map((item) => `• ${item.text}`).join('\n')
  return lines ? `<p>${lines.replace(/\n/g, '</p><p>')}</p>` : ''
}

export function buildYesterdayDoneHtml(items: ScrumItem[] = []): string {
  const done = items.filter((item) => item.status === 'DONE')
  return serializeItemsToHtml(done)
}

export function buildYesterdayStatusJson(items: ScrumItem[] = []): Record<string, ScrumItemStatus> | undefined {
  if (!items.length) return undefined
  const record: Record<string, ScrumItemStatus> = {}
  for (const item of items) {
    if (item.status && item.status !== 'PENDING') record[item.text] = item.status
  }
  return Object.keys(record).length ? record : undefined
}

export function collectLinkedIds(items: ScrumItem[] = []) {
  const objectiveIds = new Set<string>()
  const keyResultIds = new Set<string>()
  for (const item of items) {
    if (item.objectiveId) objectiveIds.add(item.objectiveId)
    if (item.keyResultId) keyResultIds.add(item.keyResultId)
  }
  return { objectiveIds: [...objectiveIds], keyResultIds: [...keyResultIds] }
}

export function allItems(content: ScrumContentJson): ScrumItem[] {
  return [
    ...(content.yesterdayItems ?? []),
    ...(content.todayItems ?? []),
    ...(content.blockerItems ?? []),
    ...(content.winItems ?? []),
  ]
}

export function getTodoIds(items: ScrumItem[] = []): Set<string> {
  return new Set(items.map((item) => item.todoId).filter(Boolean) as string[])
}

export async function syncScrumTodos(
  previous: ScrumContentJson,
  next: ScrumContentJson,
  subjectUserId: string,
  actorId: string,
  scrumDate: Date,
  tx: any = prisma,
): Promise<ScrumContentJson> {
  const previousTodoIds = new Set<string>([
    ...getTodoIds(previous.yesterdayItems),
    ...getTodoIds(previous.todayItems),
    ...getTodoIds(previous.blockerItems),
  ])
  const nextTodoIds = new Set<string>([
    ...getTodoIds(next.yesterdayItems),
    ...getTodoIds(next.todayItems),
    ...getTodoIds(next.blockerItems),
  ])

  // Cancel todos that were previously managed by this scrum update but are no longer present.
  for (const todoId of previousTodoIds) {
    if (!nextTodoIds.has(todoId)) {
      await tx.todo.updateMany({ where: { id: todoId, assigneeId: subjectUserId }, data: { status: 'CANCELLED' } })
    }
  }

  // Mark yesterday done items as completed.
  for (const item of next.yesterdayItems ?? []) {
    if (item.todoId && item.status === 'DONE') {
      await tx.todo.updateMany({
        where: { id: item.todoId, assigneeId: subjectUserId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    }
  }

  // Sync today's plan items -> real Todos (PENDING).
  const todayItems: ScrumItem[] = []
  for (const item of next.todayItems ?? []) {
    const todoData = {
      title: item.text,
      startDate: scrumDate,
      dueDate: scrumDate,
      assigneeId: subjectUserId,
      creatorId: actorId,
      status: 'PENDING',
      priority: 'MEDIUM',
      objectiveId: item.objectiveId ?? null,
      keyResultId: item.keyResultId ?? null,
    }
    let todoId = item.todoId
    if (todoId) {
      await tx.todo.updateMany({ where: { id: todoId, assigneeId: subjectUserId }, data: todoData })
    } else {
      const todo = await tx.todo.create({ data: todoData })
      todoId = todo.id
    }
    todayItems.push({ ...item, todoId })
  }

  // Sync blocker items -> real Todos (STUCK).
  const blockerItems: ScrumItem[] = []
  for (const item of next.blockerItems ?? []) {
    const todoData = {
      title: item.text,
      startDate: scrumDate,
      dueDate: scrumDate,
      assigneeId: subjectUserId,
      creatorId: actorId,
      status: 'STUCK',
      priority: 'HIGH',
      objectiveId: item.objectiveId ?? null,
      keyResultId: item.keyResultId ?? null,
    }
    let todoId = item.todoId
    if (todoId) {
      await tx.todo.updateMany({ where: { id: todoId, assigneeId: subjectUserId }, data: todoData })
    } else {
      const todo = await tx.todo.create({ data: todoData })
      todoId = todo.id
    }
    blockerItems.push({ ...item, todoId })
  }

  return {
    yesterdayItems: next.yesterdayItems,
    todayItems,
    blockerItems,
    winItems: next.winItems,
  }
}
