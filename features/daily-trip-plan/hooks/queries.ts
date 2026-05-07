/**
 * TanStack Query hooks for the DTP feature. All queries share the `dtp` root
 * key so a single invalidation can refresh everything.
 */

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { dtpApi } from '../services/api'

const KEYS = {
  plans: (params: Record<string, string | undefined> = {}) => ['dtp', 'plans', params] as const,
  plan: (id: string) => ['dtp', 'plan', id] as const,
  movementSheet: (dept: string, date: string) => ['dtp', 'sheet', dept, date] as const,
  runSheet: (driver: string, date: string) => ['dtp', 'runsheet', driver, date] as const,
  tripTypes: () => ['dtp', 'trip-types'] as const,
  drivers: () => ['dtp', 'drivers'] as const,
  vehicles: () => ['dtp', 'vehicles'] as const,
  settings: () => ['dtp', 'settings'] as const,
}

export function usePlans(params: Record<string, string | undefined> = {}) {
  return useQuery({ queryKey: KEYS.plans(params), queryFn: () => dtpApi.listPlans(params) })
}

export function usePlan(id: string | null | undefined) {
  return useQuery({
    queryKey: KEYS.plan(id ?? ''),
    queryFn: () => dtpApi.getPlan(id as string),
    enabled: !!id,
  })
}

export function useTripTypes() {
  return useQuery({ queryKey: KEYS.tripTypes(), queryFn: dtpApi.listTripTypes, staleTime: 5 * 60 * 1000 })
}

export function useDrivers() {
  return useQuery({ queryKey: KEYS.drivers(), queryFn: dtpApi.listDrivers, staleTime: 5 * 60 * 1000 })
}

export function useVehicles() {
  return useQuery({ queryKey: KEYS.vehicles(), queryFn: dtpApi.listVehicles, staleTime: 5 * 60 * 1000 })
}

export function useMovementSheet(deptId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: KEYS.movementSheet(deptId ?? '', date ?? ''),
    queryFn: () => dtpApi.movementSheet(deptId as string, date as string),
    enabled: !!deptId && !!date,
  })
}

export function useRunSheet(driverId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: KEYS.runSheet(driverId ?? '', date ?? ''),
    queryFn: () => dtpApi.runSheet(driverId as string, date as string),
    enabled: !!driverId && !!date,
  })
}

export function useDtpSettings() {
  return useQuery({ queryKey: KEYS.settings(), queryFn: dtpApi.getSettings, staleTime: 60_000 })
}

/** Refetch every plan-related query for the given plan id. */
export function useInvalidatePlan() {
  const qc = useQueryClient()
  return (planId: string) => {
    qc.invalidateQueries({ queryKey: KEYS.plan(planId) })
    qc.invalidateQueries({ queryKey: ['dtp', 'plans'] })
    qc.invalidateQueries({ queryKey: ['dtp', 'sheet'] })
    qc.invalidateQueries({ queryKey: ['dtp', 'runsheet'] })
  }
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreateOrOpenPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dtpApi.createOrOpenPlan,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dtp', 'plans'] }),
  })
}

export function useAddStop(planId: string) {
  const inv = useInvalidatePlan()
  return useMutation({
    mutationFn: (body: Parameters<typeof dtpApi.addStop>[1]) => dtpApi.addStop(planId, body),
    onSuccess: () => { inv(planId); toast.success('Stop added') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateStop(planId: string) {
  const inv = useInvalidatePlan()
  return useMutation({
    mutationFn: (args: { stopId: string; body: Parameters<typeof dtpApi.patchStop>[2] }) =>
      dtpApi.patchStop(planId, args.stopId, args.body),
    onSuccess: () => inv(planId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteStop(planId: string) {
  const inv = useInvalidatePlan()
  return useMutation({
    mutationFn: (stopId: string) => dtpApi.deleteStop(planId, stopId),
    onSuccess: () => { inv(planId); toast.success('Stop removed') },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function usePlanTransition(planId: string) {
  const inv = useInvalidatePlan()
  return {
    submit: useMutation({
      mutationFn: () => dtpApi.submit(planId),
      onSuccess: () => { inv(planId); toast.success('Plan submitted') },
      onError: (e: Error) => toast.error(e.message),
    }),
    withdraw: useMutation({
      mutationFn: () => dtpApi.withdraw(planId),
      onSuccess: () => { inv(planId); toast.success('Plan withdrawn') },
      onError: (e: Error) => toast.error(e.message),
    }),
    endorse: useMutation({
      mutationFn: (body: { decision: 'ENDORSE' | 'REJECT'; note?: string }) => dtpApi.endorse(planId, body),
      onSuccess: () => { inv(planId); toast.success('Saved') },
      onError: (e: Error) => toast.error(e.message),
    }),
    approve: useMutation({
      mutationFn: (note?: string) => dtpApi.approve(planId, { note }),
      onSuccess: () => { inv(planId); toast.success('Plan approved') },
      onError: (e: Error) => toast.error(e.message),
    }),
    returnForEdit: useMutation({
      mutationFn: (note: string) => dtpApi.return(planId, { note }),
      onSuccess: () => { inv(planId); toast.success('Returned for edit') },
      onError: (e: Error) => toast.error(e.message),
    }),
    reject: useMutation({
      mutationFn: (note: string) => dtpApi.reject(planId, { note }),
      onSuccess: () => { inv(planId); toast.success('Plan rejected') },
      onError: (e: Error) => toast.error(e.message),
    }),
    acknowledge: useMutation({
      mutationFn: () => dtpApi.acknowledge(planId),
      onSuccess: () => { inv(planId); toast.success('Acknowledged — plan approved') },
      onError: (e: Error) => toast.error(e.message),
    }),
    cancel: useMutation({
      mutationFn: (reason: string) => dtpApi.cancel(planId, { reason }),
      onSuccess: () => { inv(planId); toast.success('Plan cancelled') },
      onError: (e: Error) => toast.error(e.message),
    }),
    clone: useMutation({
      mutationFn: (tripDate: string) => dtpApi.clone(planId, { tripDate }),
      onSuccess: () => toast.success('Cloned'),
      onError: (e: Error) => toast.error(e.message),
    }),
  }
}

export function useAssignDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dtpApi.assignDriver,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dtp'] })
      toast.success('Driver assigned')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSetLegStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { legId: string; body: Parameters<typeof dtpApi.setLegStatus>[1] }) =>
      dtpApi.setLegStatus(args.legId, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dtp', 'runsheet'] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dtpApi.putSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.settings() })
      toast.success('Settings saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
