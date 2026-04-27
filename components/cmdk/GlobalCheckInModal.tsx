'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCheckInPickerStore } from '@/lib/stores/check-in-picker-store'
import CreateCheckInModal from '@/features/key-results/components/CreateCheckInModal'

async function fetchKeyResult(id: string) {
  const res = await fetch(`/api/keyresults/${id}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Failed to load key result')
  return json.data
}

export default function GlobalCheckInModal() {
  const selectedKrId = useCheckInPickerStore((s) => s.selectedKrId)
  const clearKr = useCheckInPickerStore((s) => s.clearKr)
  const queryClient = useQueryClient()

  const { data: kr } = useQuery({
    queryKey: ['key-result', selectedKrId],
    queryFn: () => fetchKeyResult(selectedKrId as string),
    enabled: !!selectedKrId,
    staleTime: 0,
  })

  if (!selectedKrId || !kr) return null

  return (
    <CreateCheckInModal
      isOpen={!!selectedKrId}
      onClose={clearKr}
      keyResult={kr}
      objectiveTimeframe={null}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['my-active-krs'] })
        queryClient.invalidateQueries({ queryKey: ['key-result', selectedKrId] })
      }}
    />
  )
}
