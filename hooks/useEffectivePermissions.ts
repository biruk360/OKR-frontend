'use client'

import { useQuery } from '@tanstack/react-query'

type DocTypePermission = {
  canRead: boolean
  canWrite: boolean
  canCreate: boolean
  canDelete: boolean
  canSubmit: boolean
  canExport: boolean
  canPrint: boolean
  canShare: boolean
  canImport: boolean
  canReport: boolean
  applyScoping: boolean
}

type EffectivePermissions = {
  isAdmin: boolean
  activeRoleKeys: string[]
  doctypePermissions: Record<string, DocTypePermission>
  featurePermissions: Record<string, { visible: boolean; enabled: boolean }>
}

async function fetchEffectivePermissions(): Promise<EffectivePermissions> {
  const response = await fetch('/api/permissions/me')
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) throw new Error(body?.error ?? 'Failed to load permissions')
  return body.data
}

export function useEffectivePermissions() {
  const query = useQuery({
    queryKey: ['permissions', 'me'],
    queryFn: fetchEffectivePermissions,
    staleTime: 30_000,
  })

  return {
    ...query,
    canFeature: (featureKey: string) => {
      if (query.data?.isAdmin) return true
      const permission = query.data?.featurePermissions[featureKey]
      return permission?.visible === true && permission.enabled === true
    },
    canDo: (doctypeKey: string, action: keyof DocTypePermission) => {
      if (query.data?.isAdmin) return true
      return query.data?.doctypePermissions[doctypeKey]?.[action] === true
    },
  }
}
