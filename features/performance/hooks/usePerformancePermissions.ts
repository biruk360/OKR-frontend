'use client'

import { useEffectivePermissions } from '@/hooks/useEffectivePermissions'

type Action =
  | 'canRead'
  | 'canWrite'
  | 'canCreate'
  | 'canDelete'
  | 'canSubmit'
  | 'canShare'
  | 'canReport'

export function usePerformancePermissions() {
  const permissions = useEffectivePermissions()
  return {
    ...permissions,
    can: (featureKey: string, doctypeKey: string, action: Action) =>
      permissions.canFeature('module.performance')
      && permissions.canFeature(featureKey)
      && permissions.canDo(doctypeKey, action),
  }
}
