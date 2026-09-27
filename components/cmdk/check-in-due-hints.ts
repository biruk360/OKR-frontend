'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCheckInPickerStore } from '@/lib/stores/check-in-picker-store'

/** A key result that needs a check-in, as computed server-side on the home page. */
export interface CheckInDueHint {
  id: string
  state: 'overdue' | 'due'
}

/**
 * React Query cache slot holding the latest due hints. The home page seeds it
 * (it already computes due KRs from each KR's last check-in + checkInCadence);
 * `CheckInPickerModal` reads it to float those KRs to the top with a badge.
 * Nothing fetches it, so openers without hints simply get the plain list.
 */
export const CHECK_IN_DUE_HINTS_QUERY_KEY = ['check-in-due-hints'] as const

/** Opens the global check-in picker, optionally seeding the due hints first. */
export function useOpenCheckInPicker() {
  const queryClient = useQueryClient()
  return useCallback(
    (hints?: CheckInDueHint[]) => {
      if (hints) queryClient.setQueryData(CHECK_IN_DUE_HINTS_QUERY_KEY, hints)
      useCheckInPickerStore.getState().openPicker()
    },
    [queryClient],
  )
}
