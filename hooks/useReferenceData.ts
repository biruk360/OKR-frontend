'use client'

import { useUsersForSelection } from './useUsersForSelection'
import { useTimeframes } from './useTimeframes'
import { useDepartments } from './useDepartments'

export interface UseReferenceDataOptions {
  /** Include users (default: true) */
  users?: boolean
  /** Include timeframes (default: true) */
  timeframes?: boolean
  /** Include departments (default: true) */
  departments?: boolean
  /** Only active timeframes (default: false) */
  activeTimeframesOnly?: boolean
  /** Enable fetching (default: true) */
  enabled?: boolean
}

/**
 * Combined reference data hook for forms that need users, timeframes, and departments.
 * Replaces the common `Promise.all([fetch('/api/users/for-selection'), fetch('/api/timeframes'), fetch('/api/departments')])` pattern.
 *
 * @example
 * const { users, timeframes, departments, isLoading } = useReferenceData()
 */
export function useReferenceData(options: UseReferenceDataOptions = {}) {
  const {
    users: wantUsers = true,
    timeframes: wantTimeframes = true,
    departments: wantDepartments = true,
    activeTimeframesOnly = false,
    enabled = true,
  } = options

  const usersQuery = useUsersForSelection({ enabled: enabled && wantUsers })
  const timeframesQuery = useTimeframes({
    activeOnly: activeTimeframesOnly,
    enabled: enabled && wantTimeframes,
  })
  const departmentsQuery = useDepartments({ enabled: enabled && wantDepartments })

  return {
    users: usersQuery.users,
    timeframes: timeframesQuery.timeframes,
    departments: departmentsQuery.departments,
    isLoading:
      (wantUsers && usersQuery.isLoading) ||
      (wantTimeframes && timeframesQuery.isLoading) ||
      (wantDepartments && departmentsQuery.isLoading),
    isError:
      usersQuery.isError || timeframesQuery.isError || departmentsQuery.isError,
    errors: {
      users: usersQuery.error,
      timeframes: timeframesQuery.error,
      departments: departmentsQuery.error,
    },
    refetch: () => {
      if (wantUsers) usersQuery.refetch()
      if (wantTimeframes) timeframesQuery.refetch()
      if (wantDepartments) departmentsQuery.refetch()
    },
  }
}
