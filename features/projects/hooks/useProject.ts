'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { projectKeys } from './useProjects'
import type { ActivityStatus, OwnerParty } from '../types'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`)
  return json.data as T
}

// --- detail shapes (nested tree returned by GET /api/projects/[id]) ----------

export interface ActivityNode {
  id: string
  milestoneId: string
  parentActivityId: string | null
  position: number
  title: string
  description: string | null
  assigneeId: string | null
  ownerParty: OwnerParty
  currentStart: string | null
  currentEnd: string | null
  baselineStart: string | null
  baselineEnd: string | null
  status: ActivityStatus
  percentComplete: number
  weight: number
  priority: string | null
  risk: string | null
  isMilestone: boolean
  slipDays: number
  waitingSince: string | null
  tags: { id: string; label: string; color: string }[]
  _count: { comments: number; subtasks: number }
}

export interface MilestoneNode {
  id: string
  phaseId: string
  name: string
  position: number
  weight: number
  percentComplete: number
  status: string
  isKeyMilestone: boolean
  keyResultId: string | null
  activities: ActivityNode[]
}

export interface PhaseNode {
  id: string
  projectId: string
  name: string
  position: number
  weight: number
  percentComplete: number
  status: string
  milestones: MilestoneNode[]
}

export interface ProjectDetail {
  id: string
  code: string
  name: string
  description: string | null
  clientName: string
  status: string
  ragStatus: string
  confidence: number
  percentComplete: number
  percentPlanned: number
  spi: number | null
  cpi: number | null
  contractValue: number | null
  currency: string
  plannedStart: string
  plannedEnd: string
  baselineCommittedAt: string | null
  baselineVersion: number
  projectManagerId: string
  departmentId: string | null
  members: { id: string; userId: string; role: string; allocationPct: number }[]
  phases: PhaseNode[]
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => fetchJson<ProjectDetail>(`/api/projects/${id}`),
    staleTime: 10_000,
    enabled: !!id,
  })
}

// --- mutations (invalidate the project detail on success) --------------------

function useProjectMutation<TVars>(id: string, fn: (vars: TVars) => Promise<unknown>, successMsg?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) })
      qc.invalidateQueries({ queryKey: projectKeys.all })
      if (successMsg) toast.success(successMsg)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function useUpdateProject(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) => fetchJson(`/api/projects/${id}`, jsonInit('PATCH', body)), 'Project updated')
}

export function useAddPhase(id: string) {
  return useProjectMutation(id, (body: { name: string; weight?: number }) => fetchJson(`/api/projects/${id}/phases`, jsonInit('POST', body)), 'Phase added')
}
export function useUpdatePhase(id: string) {
  return useProjectMutation(id, ({ phaseId, ...body }: { phaseId: string } & Record<string, unknown>) => fetchJson(`/api/projects/${id}/phases/${phaseId}`, jsonInit('PATCH', body)))
}
export function useDeletePhase(id: string) {
  return useProjectMutation(id, ({ phaseId }: { phaseId: string }) => fetchJson(`/api/projects/${id}/phases/${phaseId}`, { method: 'DELETE' }), 'Phase deleted')
}

export function useAddMilestone(id: string) {
  return useProjectMutation(id, (body: { phaseId: string; name: string; weight?: number; isKeyMilestone?: boolean }) => fetchJson(`/api/projects/${id}/milestones`, jsonInit('POST', body)), 'Milestone added')
}
export function useUpdateMilestone(id: string) {
  return useProjectMutation(id, ({ milestoneId, ...body }: { milestoneId: string } & Record<string, unknown>) => fetchJson(`/api/projects/${id}/milestones/${milestoneId}`, jsonInit('PATCH', body)))
}
export function useDeleteMilestone(id: string) {
  return useProjectMutation(id, ({ milestoneId }: { milestoneId: string }) => fetchJson(`/api/projects/${id}/milestones/${milestoneId}`, { method: 'DELETE' }), 'Milestone deleted')
}

export function useAddActivity(id: string) {
  return useProjectMutation(id, (body: Record<string, unknown>) => fetchJson(`/api/projects/${id}/activities`, jsonInit('POST', body)), 'Activity added')
}
export function useUpdateActivity(id: string) {
  return useProjectMutation(id, ({ activityId, ...body }: { activityId: string } & Record<string, unknown>) => fetchJson(`/api/projects/${id}/activities/${activityId}`, jsonInit('PATCH', body)))
}
export function useDeleteActivity(id: string) {
  return useProjectMutation(id, ({ activityId }: { activityId: string }) => fetchJson(`/api/projects/${id}/activities/${activityId}`, { method: 'DELETE' }), 'Activity deleted')
}

export function useCommitBaseline(id: string) {
  return useProjectMutation(id, (body: { notes?: string }) => fetchJson(`/api/projects/${id}/baseline`, jsonInit('POST', body)), 'Baseline committed (v1)')
}

// --- re-baseline (C2) --------------------------------------------------------

export interface RebaselineChange {
  activityId: string
  title: string
  phaseName: string
  oldStart: string | null
  oldEnd: string | null
  newStart: string | null
  newEnd: string | null
}

export function useRebaselineDiff(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...projectKeys.detail(id), 'rebaseline-diff'],
    queryFn: () => fetchJson<{ changes: RebaselineChange[] }>(`/api/projects/${id}/baseline/rebaseline`),
    enabled: enabled && !!id,
  })
}

export function useRebaseline(id: string) {
  return useProjectMutation(id, (body: { reason: string; approverId?: string }) =>
    fetchJson(`/api/projects/${id}/baseline/rebaseline`, jsonInit('POST', body)), 'Re-baselined')
}

// --- delay ledger (C5) --------------------------------------------------------

export interface DelayLedgerRow {
  id: string
  activityId: string | null
  activityTitle: string | null
  phase: string | null
  eventType: string
  baselineDate: string | null
  currentDate: string | null
  slipDays: number
  daysLost: number
  reason: string
  reasonDetail: string | null
  owner: string
  isAutoDetected: boolean
  slaBreachDays: number | null
  recoveryPlan: string | null
  recoveryOwner: string | null
  recoveryDate: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export interface DelayLedgerData {
  rows: DelayLedgerRow[]
  totals: { total: number; byOwner: Record<string, number> }
  facets: { owners: string[]; reasons: string[]; phases: string[] }
}

export interface DelayLedgerFilters {
  owner?: string
  reason?: string
  phase?: string
}

export const delayLedgerKey = (id: string, filters: DelayLedgerFilters) =>
  [...projectKeys.detail(id), 'delays', filters] as const

export function useDelayLedger(id: string, filters: DelayLedgerFilters = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => !!v) as [string, string][]
  ).toString()
  return useQuery({
    queryKey: delayLedgerKey(id, filters),
    queryFn: () => fetchJson<DelayLedgerData>(`/api/projects/${id}/delays${qs ? `?${qs}` : ''}`),
    enabled: !!id,
  })
}

export function useUpdateDelayRecovery(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { delayId: string; recoveryPlan?: string | null; recoveryOwner?: string | null; recoveryDate?: string | null }) =>
      fetchJson(`/api/projects/${id}/delays`, jsonInit('PATCH', body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...projectKeys.detail(id), 'delays'] })
      toast.success('Recovery plan saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
