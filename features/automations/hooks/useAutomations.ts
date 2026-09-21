'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DistributionMode, PlanSpec } from '@/types/automations'
import {
  automationsApi,
  type AutomationSettings,
  type CreateAutomationPayload,
  type PromoteFindingPayload,
} from '../services/api'

const keys = {
  all: ['automations'] as const,
  tools: ['automations', 'tools'] as const,
  settings: ['automations', 'settings'] as const,
  list: (scope: string) => ['automations', 'list', scope] as const,
  detail: (id: string) => ['automations', 'detail', id] as const,
  runs: (id: string) => ['automations', 'runs', id] as const,
  run: (runId: string) => ['automations', 'run', runId] as const,
  briefings: (automationId?: string) => ['automations', 'briefings', automationId ?? 'all'] as const,
  briefing: (id: string) => ['automations', 'briefing', id] as const,
}

/** What the author can actually build with: which tools exist and are configured. */
export function useAutomationTools() {
  return useQuery({ queryKey: keys.tools, queryFn: () => automationsApi.tools(), staleTime: 60_000 })
}

/**
 * Compile an instruction into a plan. A mutation rather than a query — it costs
 * money and must only run when the user asks for it.
 */
export function useCompileInstruction() {
  return useMutation({
    mutationFn: ({ instruction, previousPlan }: { instruction: string; previousPlan?: PlanSpec }) =>
      automationsApi.compile(instruction, { previousPlan }),
  })
}

export function useAutomations(scope: 'mine' | 'all' = 'mine') {
  return useQuery({ queryKey: keys.list(scope), queryFn: () => automationsApi.list(scope) })
}

export function useAutomation(id: string) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => automationsApi.get(id), enabled: Boolean(id) })
}

export function useAutomationRuns(id: string, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: keys.runs(id),
    queryFn: () => automationsApi.runs(id),
    enabled: Boolean(id),
    refetchInterval: options?.refetchInterval,
  })
}

export function useRunDetail(runId: string | null, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: keys.run(runId ?? ''),
    queryFn: () => automationsApi.run(runId as string),
    enabled: Boolean(runId),
    // The test-run panel polls while a run is in flight and stops once it
    // reaches a terminal state, so a finished run is not re-fetched forever.
    refetchInterval: options?.refetchInterval,
  })
}

export function useBriefings(automationId?: string) {
  return useQuery({
    queryKey: keys.briefings(automationId),
    queryFn: () => automationsApi.briefings(automationId),
  })
}

export function useBriefing(id: string) {
  return useQuery({ queryKey: keys.briefing(id), queryFn: () => automationsApi.briefing(id), enabled: Boolean(id) })
}

export function useCreateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAutomationPayload) => automationsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useRunAutomationNow(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => automationsApi.runNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.runs(id) })
      queryClient.invalidateQueries({ queryKey: keys.detail(id) })
    },
  })
}

export function useSetMode(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mode: DistributionMode) => automationsApi.setMode(id, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useSetStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (status: 'ENABLED' | 'PAUSED') => automationsApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateAutomation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof automationsApi.update>[1]) => automationsApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useDeleteAutomation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => automationsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function usePromoteFinding(briefingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PromoteFindingPayload) => automationsApi.promoteFinding(briefingId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.briefing(briefingId) }),
  })
}

export function useAutomationSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => automationsApi.settings() })
}

export function useUpdateAutomationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<AutomationSettings>) => automationsApi.updateSettings(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.settings }),
  })
}

export function useApproveBriefing(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => automationsApi.approveBriefing(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}
