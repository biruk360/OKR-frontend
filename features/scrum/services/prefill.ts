import { prisma } from '@/lib/prisma'
import { previousScrumWorkingDay, scrumBusinessDaysBetween, toScrumDateKey } from './working-days'
import { getScrumSettings } from './settings'
import { normalizeContentJson, parseHtmlToItems, type ScrumContentJson } from './items'

export interface ScrumPlanItem {
  id: string
  text: string
  state: 'PENDING' | 'DONE' | 'CARRIED' | 'NOT_DONE'
  inheritedLinks?: PrefillScrumLink[]
}

export interface PrefillScrumLink {
  objectiveId: string | null
  keyResultId: string | null
  todoId: string | null
  context: 'TODAY' | 'BLOCKER' | 'WIN' | 'YESTERDAY'
  progressNote?: string | null
}

export interface ScrumPrefill {
  scrumDate: string
  previousDate: string | null
  previousUpdateId: string | null
  yesterdayDone: string
  todayPlan: string
  planItems: ScrumPlanItem[]
  contentJson: ScrumContentJson
  openBlocker: { text: string; category: string | null; daysOpen: number } | null
}

export async function getScrumPrefill(userId: string, date = new Date()): Promise<ScrumPrefill> {
  const settings = await getScrumSettings()
  const scrumDate = toScrumDateKey(date, settings)
  const previousWorkingDay = previousScrumWorkingDay(date, settings)
  const previousUpdate = await prisma.scrumUpdate.findFirst({
    where: {
      userId,
      scrumDate: { lt: new Date(`${scrumDate}T00:00:00.000Z`) },
    },
    orderBy: { scrumDate: 'desc' },
    select: {
      id: true,
      scrumDate: true,
      todayPlan: true,
      blockers: true,
      blockerCategory: true,
      blockerStatus: true,
      blockerFirstRaisedAt: true,
      blockerDaysOpen: true,
      contentJson: true,
      links: true,
    },
  })

  const previousDate = previousUpdate?.scrumDate
    ? toScrumDateKey(previousUpdate.scrumDate, settings)
    : previousWorkingDay
      ? toScrumDateKey(previousWorkingDay, settings)
      : null
  const inheritedLinks = normalizeInheritedLinks(previousUpdate?.links ?? [])
  const previousContent = normalizeContentJson(previousUpdate?.contentJson)
  const yesterdayItems = previousContent.todayItems?.length
    ? previousContent.todayItems
    : parseHtmlToItems(previousUpdate?.todayPlan ?? '', 'PENDING')

  // Fetch current todo statuses so items completed via My Tasks show as done.
  const todoIds = yesterdayItems.map((item) => item.todoId).filter(Boolean) as string[]
  const todoStatuses = todoIds.length
    ? new Map(
        (await prisma.todo.findMany({ where: { id: { in: todoIds } }, select: { id: true, status: true } })).map((t) => [
          t.id,
          t.status,
        ]),
      )
    : new Map<string, string>()
  const itemsWithState = yesterdayItems.map((item) => {
    const status: ScrumPlanItem['state'] = item.status === 'DONE' || todoStatuses.get(item.todoId!) === 'COMPLETED'
      ? 'DONE'
      : item.status === 'NOT_DONE'
        ? 'NOT_DONE'
        : 'PENDING'
    return {
      id: item.id,
      text: item.text,
      state: status,
      todoId: item.todoId,
      objectiveId: item.objectiveId,
      keyResultId: item.keyResultId,
      inheritedLinks,
    }
  })
  const blockerDays = previousUpdate?.blockerFirstRaisedAt
    ? Math.max(1, scrumBusinessDaysBetween(previousUpdate.blockerFirstRaisedAt, date, settings))
    : previousUpdate?.blockerDaysOpen ?? 0

  return {
    scrumDate,
    previousDate,
    previousUpdateId: previousUpdate?.id ?? null,
    yesterdayDone: previousUpdate?.todayPlan ?? '',
    todayPlan: '',
    planItems: itemsWithState,
    contentJson: {
      yesterdayItems: itemsWithState.map((item) => ({
        id: item.id,
        text: item.text,
        todoId: item.todoId,
        objectiveId: item.objectiveId,
        keyResultId: item.keyResultId,
        status: item.state,
      })),
      todayItems: [],
      blockerItems: [],
      winItems: [],
    },
    openBlocker: previousUpdate?.blockers && previousUpdate.blockerStatus !== 'RESOLVED'
      ? {
          text: previousUpdate.blockers,
          category: previousUpdate.blockerCategory,
          daysOpen: blockerDays,
        }
      : null,
  }
}

export function normalizeInheritedLinks(links: Array<{
  objectiveId?: string | null
  keyResultId?: string | null
  todoId?: string | null
  context?: string | null
  progressNote?: string | null
}>): PrefillScrumLink[] {
  const seen = new Set<string>()
  const inherited: PrefillScrumLink[] = []
  for (const link of links) {
    if (link.context && link.context !== 'TODAY' && link.context !== 'YESTERDAY') continue
    const objectiveId = link.objectiveId ?? null
    const keyResultId = link.keyResultId ?? null
    const todoId = link.todoId ?? null
    const key = `${objectiveId ?? ''}:${keyResultId ?? ''}:${todoId ?? ''}:TODAY`
    if (!objectiveId && !keyResultId && !todoId) continue
    if (seen.has(key)) continue
    seen.add(key)
    inherited.push({
      objectiveId,
      keyResultId,
      todoId,
      context: 'TODAY',
      progressNote: link.progressNote ?? null,
    })
  }
  return inherited
}

export function parsePlanItems(htmlOrText: string): ScrumPlanItem[] {
  const text = stripHtml(htmlOrText)
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•\d.)\]]+\s*/, '').trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `item-${index}`, text, state: 'PENDING' as const }))
}

export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export function applyPlanItemState(
  base: { yesterdayDone: string; todayPlan: string },
  item: ScrumPlanItem,
): { yesterdayDone: string; todayPlan: string } {
  const line = `• ${item.text}`
  if (item.state === 'DONE') {
    return { ...base, yesterdayDone: appendLine(base.yesterdayDone, line) }
  }
  if (item.state === 'CARRIED') {
    return { ...base, todayPlan: appendLine(base.todayPlan, line) }
  }
  return base
}

function appendLine(value: string, line: string): string {
  return value.trim() ? `${value.trim()}\n${line}` : line
}
