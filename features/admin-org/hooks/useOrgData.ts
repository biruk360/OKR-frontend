'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { OrgDiagnostics, OrgSettings, OrgTree } from '../types'

const TREE_KEY = ['admin-org', 'tree'] as const
const SETTINGS_KEY = ['admin-org', 'settings'] as const
const DIAGNOSTICS_KEY = ['admin-org', 'diagnostics'] as const

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed: ${res.status}`)
  }
  return json.data as T
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function useOrgTree() {
  return useQuery({
    queryKey: TREE_KEY,
    queryFn: () => fetchJson<OrgTree>('/api/org/tree'),
    staleTime: 30_000,
  })
}

export function useOrgSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => fetchJson<OrgSettings>('/api/admin/org-settings'),
    staleTime: 60_000,
  })
}

export function useOrgDiagnostics() {
  return useQuery({
    queryKey: DIAGNOSTICS_KEY,
    queryFn: () => fetchJson<OrgDiagnostics>('/api/org/diagnostics'),
    staleTime: 30_000,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: TREE_KEY })
  qc.invalidateQueries({ queryKey: SETTINGS_KEY })
  qc.invalidateQueries({ queryKey: DIAGNOSTICS_KEY })
}

export function useUpdateUserOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, ...body }: {
      userId: string
      managerId?: string | null
      primaryDepartmentId?: string | null
      role?: string
    }) =>
      fetchJson(`/api/users/${userId}/org`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { invalidateAll(qc); toast.success('User updated') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, ...body }: {
      departmentId: string
      userId: string
      role?: 'HEAD' | 'MEMBER' | 'SECONDARY_MEMBER'
      isPrimary?: boolean
    }) =>
      fetchJson(`/api/departments/${departmentId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { invalidateAll(qc); toast.success('Member added') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, membershipId, ...body }: {
      departmentId: string
      membershipId: string
      role?: 'HEAD' | 'MEMBER' | 'SECONDARY_MEMBER'
      isPrimary?: boolean
    }) =>
      fetchJson(`/api/departments/${departmentId}/members/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { invalidateAll(qc); toast.success('Membership updated') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, membershipId }: { departmentId: string; membershipId: string }) =>
      fetchJson(`/api/departments/${departmentId}/members/${membershipId}`, { method: 'DELETE' }),
    onSuccess: () => { invalidateAll(qc); toast.success('Member removed') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSetDepartmentHead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, userId }: { departmentId: string; userId: string | null }) =>
      fetchJson(`/api/departments/${departmentId}/head`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => { invalidateAll(qc); toast.success('Department head updated') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateOrgSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<{
      companyName: string
      companyCeoUserId: string | null
      allowMatrixReporting: boolean
      allowMultipleDeptHeads: boolean
    }>) =>
      fetchJson('/api/admin/org-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { invalidateAll(qc); toast.success('Organization updated') },
    onError: (e: Error) => toast.error(e.message),
  })
}
