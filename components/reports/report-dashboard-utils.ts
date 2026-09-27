/**
 * Shared types + pure helpers for the /dashboard/reports dashboard.
 * Split out of ReportDashboardClient.tsx (2026-09-25) — no behaviour change.
 */
import { dueTone } from '@/lib/todos/due-tone'
import { chartColors } from '@/lib/chart-colors'
import type { KrDisplayStatus } from '@/lib/reportDashboard'

export interface ReportKrRow {
  id: string
  title: string
  progress: number
  confidence: string
  unit: string
  startValue: number
  targetValue: number
  currentValue: number
  objectiveId: string
  objectiveTitle: string
  objectiveProgress: number
  planLabel: string
  departmentId: string | null
  departmentName: string
  timeframeId: string
  timeframeName: string
  ownerId: string
  ownerName: string
  ownerAvatar: string | null
  checkInCount: number
  status: string
}

export interface ReportObjectiveRow {
  id: string
  title: string
  progress: number
  goalStatus: string
  level: string
  planLabel: string
  ownerId: string
  ownerName: string
  ownerAvatar: string | null
  departmentId: string | null
  departmentName: string
  timeframeId: string
  timeframeName: string
  keyResultCount: number
}

export interface ReportTodoRow {
  id: string
  title: string
  status: string
  priority: string
  keyResultId: string
  krTitle: string
  objectiveTitle: string
  assigneeId: string | null
  assigneeName: string
  dueDate: string | null
}

export interface FilterOptions {
  users: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
  timeframes: Array<{ id: string; name: string }>
}

export type MainTab = 'objectives' | 'key-results' | 'initiatives'
export type DashboardMode = 'ceo' | 'employee'
export type SortKey = 'plan' | 'objective' | 'progress' | 'status'

export type ReportKrWithStatus = ReportKrRow & { displayStatus: KrDisplayStatus }

export interface DynamicFilter {
  type: string
  id: string
  label: string
}

export interface Recommendation {
  title: string
  detail: string
  tone: KrDisplayStatus
  href?: string
}

export interface SuperMetrics {
  objectiveCount: number
  krCount: number
  initiativeCount: number
  ownerCount: number
  avgObjectiveProgress: number
  avgKrProgress: number
  riskRate: number
  noCheckInCount: number
  completedTodos: number
  openTodos: number
  overdueTodos: number
  soonTodos: number
  completionRate: number
}

export interface DepartmentRow {
  id: string
  name: string
  objectives: number
  krs: number
  progress: number
  risk: number
  riskRate: number
  openTodos: number
  overdue: number
}

export interface OwnerRow {
  id: string
  name: string
  krs: number
  progress: number
  risk: number
  openTodos: number
  overdue: number
  loadScore: number
}

export interface PlanRow {
  name: string
  progress: number
  krs: number
  risk: number
}

/** Theme-aware (CSS variable) colour per KR display status. */
export const STATUS_COLORS: Record<KrDisplayStatus, string> = {
  on_track: chartColors.success,
  at_risk: chartColors.warning,
  off_track: chartColors.danger,
  pending: chartColors.neutral,
  not_measurable: chartColors.neutralStrong,
}

export const EMPTY_STATUS_COUNTS: Record<KrDisplayStatus, number> = {
  pending: 0,
  on_track: 0,
  at_risk: 0,
  off_track: 0,
  not_measurable: 0,
}

export const CLOSED_TODO_STATUSES = ['COMPLETED', 'CANCELLED']

export function isOpenTodo(status: string) {
  return !CLOSED_TODO_STATUSES.includes(status)
}

export function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}

export function average(items: number[]) {
  if (items.length === 0) return 0
  return Math.round(items.reduce((sum, value) => sum + value, 0) / items.length)
}

/**
 * Report vocabulary, on top of the shared tone.
 *
 * This surface deliberately keeps a 7-day "soon" horizon — a weekly report has
 * a wider view than a sprint card, which uses the 2-day default. The mapping
 * folds `today` into `soon` so the counts below mean exactly what they did
 * before; what changes is that an all-day to-do due TODAY is no longer counted
 * as overdue from 00:01 (see lib/todos/due-tone.ts).
 */
export function dueState(dueDate: string | null) {
  const tone = dueTone({ dueDate, soonWithinDays: 7 })
  if (tone === 'overdue') return 'overdue'
  if (tone === 'today' || tone === 'soon') return 'soon'
  if (tone === 'upcoming') return 'later'
  return 'none'
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function statusToPillKey(s: KrDisplayStatus): string {
  switch (s) {
    case 'on_track': return 'on-track'
    case 'at_risk': return 'at-risk'
    case 'off_track': return 'off-track'
    case 'pending': return 'pending'
    default: return 'pending'
  }
}
