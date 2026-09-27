'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { scrumApi } from '../services/api'

export const scrumKeys = {
  all: ['scrum'] as const,
  prefill: (userId?: string, date?: string) => ['scrum', 'prefill', userId ?? 'me', date ?? 'today'] as const,
  calendar: (params: Record<string, unknown>) => ['scrum', 'calendar', params] as const,
  analytics: (params: Record<string, unknown>) => ['scrum', 'analytics', params] as const,
  wins: ['scrum', 'wins'] as const,
  settings: ['scrum', 'settings'] as const,
  linkable: (userId?: string, ownerOnly = true) => ['scrum', 'linkable', userId ?? 'me', ownerOnly ? 'owned' : 'all'] as const,
  proxySubjects: ['scrum', 'proxy-subjects'] as const,
  update: (id?: string) => ['scrum', 'update', id ?? 'none'] as const,
  comments: (id: string) => ['scrum', 'comments', id] as const,
  savedViews: ['scrum', 'saved-views'] as const,
}

export function useScrumPrefill(userId?: string, date?: string) {
  return useQuery({ queryKey: scrumKeys.prefill(userId, date), queryFn: () => scrumApi.prefill({ userId, date }) })
}

export function useScrumCalendar(params: Record<string, string | boolean | undefined>) {
  return useQuery({ queryKey: scrumKeys.calendar(params), queryFn: () => scrumApi.calendar(params) })
}

export function useScrumAnalytics(params: Record<string, string | undefined>) {
  return useQuery({
    queryKey: scrumKeys.analytics(params),
    queryFn: () => scrumApi.analytics(params),
    // 403 = not a manager; retrying will not change that.
    retry: (failureCount, error) => (error as { status?: number })?.status !== 403 && failureCount < 3,
  })
}

export function useScrumSettings() {
  return useQuery({ queryKey: scrumKeys.settings, queryFn: scrumApi.settings })
}

export function useScrumWins() {
  return useQuery({ queryKey: scrumKeys.wins, queryFn: scrumApi.wins })
}

export function useLinkableEntities(userId?: string, ownerOnly = true) {
  return useQuery({ queryKey: scrumKeys.linkable(userId, ownerOnly), queryFn: () => scrumApi.linkable(userId, ownerOnly) })
}

export function useProxySubjects() {
  return useQuery({ queryKey: scrumKeys.proxySubjects, queryFn: scrumApi.proxySubjects })
}

export function useSaveScrumUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scrumApi.saveUpdate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scrumKeys.all })
      toast.success('Daily scrum saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/**
 * Save the form as a server-side draft. Deliberately does not invalidate the
 * prefill/calendar queries: a draft changes no team data, and refetching the
 * prefill would reset the form the user is still typing in.
 */
export function useSaveScrumDraft() {
  return useMutation({ mutationFn: scrumApi.saveDraft })
}

export function useDiscardScrumDraft() {
  return useMutation({
    mutationFn: scrumApi.discardDraft,
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useScrumUpdate(id?: string) {
  return useQuery({
    queryKey: scrumKeys.update(id),
    queryFn: () => scrumApi.getUpdate(id!),
    enabled: !!id,
    retry: false,
  })
}

export function useScrumComments(updateId: string, enabled = true) {
  return useQuery({ queryKey: scrumKeys.comments(updateId), queryFn: () => scrumApi.comments(updateId), enabled })
}

export function useAddScrumComment(updateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { body: string; mentions?: string[] }) => scrumApi.comment(updateId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scrumKeys.comments(updateId) })
      qc.invalidateQueries({ queryKey: ['scrum', 'calendar'] })
      toast.success('Comment added')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCelebrateScrumWin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (updateId: string) => scrumApi.celebrate(updateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scrum', 'calendar'] })
      qc.invalidateQueries({ queryKey: scrumKeys.wins })
      toast.success('Win celebrated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useScrumBlockerAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ updateId, ...body }: { updateId: string; action: 'resolve' | 'escalate'; resolutionNote?: string; escalatedToUserId?: string | null }) =>
      scrumApi.blockerAction(updateId, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: scrumKeys.all })
      toast.success(vars.action === 'resolve' ? 'Blocker resolved' : 'Blocker escalated')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRecordScrumAbsence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scrumApi.absences,
    onSuccess: (rows: unknown) => {
      qc.invalidateQueries({ queryKey: scrumKeys.all })
      const count = Array.isArray(rows) ? rows.length : 0
      toast.success(count === 1 ? 'Absence recorded' : `Absence recorded for ${count} working days`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useScrumSavedViews() {
  return useQuery({ queryKey: scrumKeys.savedViews, queryFn: scrumApi.savedViews })
}

export function useCreateScrumSavedView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scrumApi.createSavedView,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scrumKeys.savedViews })
      toast.success('View saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteScrumSavedView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scrumApi.deleteSavedView,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scrumKeys.savedViews })
      toast.success('View deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useSaveScrumSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scrumApi.saveSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scrumKeys.settings })
      toast.success('Scrum settings saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
