'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export type TemplateSettingsInput = {
  gatekeeper: { tierName: string; threshold: number }
  bands: Array<{ min: number; label: string }>
}

/**
 * Saves template-level gatekeeper + decision bands via
 * PATCH /api/performance/templates/[id] (accepts { gatekeeper, bands }).
 * Lives in its own file so the shared services/api.ts stays untouched.
 */
export function useSaveTemplateSettings(templateId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (body: TemplateSettingsInput) => {
      const response = await fetch(`/api/performance/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: string } | null
      if (!response.ok || !json?.success) throw new Error(json?.error ?? `Request failed: ${response.status}`)
      return json.data
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['performance', 'template', templateId] })
      client.invalidateQueries({ queryKey: ['performance', 'templates'] })
      toast.success('Gatekeeper and decision bands saved')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
