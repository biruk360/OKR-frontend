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
  linkable: (userId?: string) => ['scrum', 'linkable', userId ?? 'me'] as const,
  proxySubjects: ['scrum', 'proxy-subjects'] as const,
}

export function useScrumPrefill(userId?: string, date?: string) {
  return useQuery({ queryKey: scrumKeys.prefill(userId, date), queryFn: () => scrumApi.prefill({ userId, date }) })
}

export function useScrumCalendar(params: Record<string, string | boolean | undefined>) {
  return useQuery({ queryKey: scrumKeys.calendar(params), queryFn: () => scrumApi.calendar(params) })
}

export function useScrumAnalytics(params: Record<string, string | undefined>) {
  return useQuery({ queryKey: scrumKeys.analytics(params), queryFn: () => scrumApi.analytics(params) })
}

export function useScrumSettings() {
  return useQuery({ queryKey: scrumKeys.settings, queryFn: scrumApi.settings })
}

export function useScrumWins() {
  return useQuery({ queryKey: scrumKeys.wins, queryFn: scrumApi.wins })
}

export function useLinkableEntities(userId?: string) {
  return useQuery({ queryKey: scrumKeys.linkable(userId), queryFn: () => scrumApi.linkable(userId) })
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
