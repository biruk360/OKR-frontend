/**
 * Thin fetch client for the DTP API. All calls go through `request()` so the
 * standard `{ success, data }` envelope is unwrapped consistently and errors
 * surface to TanStack Query as `Error` instances.
 */

import type {
  DtpPlanSummary,
  DtpPlanWithStops,
  DtpEventRow,
  DtpStop,
  DtpTripType,
  DtpDriver,
  DtpVehicle,
  MovementSheet,
  RunSheet,
  DtpSettings,
  DtpDepartmentApproval,
} from '../types'

interface Envelope<T> { success: boolean; data?: T; error?: string; details?: unknown; pagination?: unknown }

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    const msg = body?.error ?? `Request failed: ${res.status}`
    const err = new Error(msg) as Error & { status?: number; details?: unknown }
    err.status = res.status
    err.details = body?.details
    throw err
  }
  return body.data as T
}

// Plans

export const dtpApi = {
  // Plans
  listPlans: (params: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
    return request<DtpPlanSummary[]>(`/api/dtp/plans?${q.toString()}`)
  },
  createOrOpenPlan: (body: { tripDate: string; departmentId?: string | null; priority?: 'NORMAL' | 'URGENT'; defaultModeOfMovement?: string }) =>
    request<DtpPlanSummary>('/api/dtp/plans', { method: 'POST', body: JSON.stringify(body) }),
  getPlan: (id: string) =>
    request<{ plan: DtpPlanWithStops; events: DtpEventRow[] }>(`/api/dtp/plans/${id}`),
  patchPlan: (id: string, body: Partial<DtpPlanSummary>) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePlan: (id: string) =>
    request<{ id: string }>(`/api/dtp/plans/${id}`, { method: 'DELETE' }),

  // Stops
  addStop: (planId: string, body: Partial<DtpStop> & { destinationName: string; destinationAddress: string; plannedStart: string; dwellMinutes: number; reason: string }) =>
    request<DtpStop>(`/api/dtp/plans/${planId}/stops`, { method: 'POST', body: JSON.stringify(body) }),
  patchStop: (planId: string, stopId: string, body: Partial<DtpStop> & { withWhom?: string[] }) =>
    request<DtpStop>(`/api/dtp/plans/${planId}/stops/${stopId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteStop: (planId: string, stopId: string) =>
    request<{ id: string }>(`/api/dtp/plans/${planId}/stops/${stopId}`, { method: 'DELETE' }),

  // Transitions
  submit: (id: string) => request<DtpPlanSummary>(`/api/dtp/plans/${id}/submit`, { method: 'POST' }),
  withdraw: (id: string) => request<DtpPlanSummary>(`/api/dtp/plans/${id}/withdraw`, { method: 'POST' }),
  endorse: (id: string, body: { decision: 'ENDORSE' | 'REJECT'; note?: string }) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/endorse`, { method: 'POST', body: JSON.stringify(body) }),
  approve: (id: string, body: { note?: string } = {}) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/approve`, { method: 'POST', body: JSON.stringify(body) }),
  return: (id: string, body: { note: string }) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/return`, { method: 'POST', body: JSON.stringify(body) }),
  reject: (id: string, body: { note: string }) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/reject`, { method: 'POST', body: JSON.stringify(body) }),
  acknowledge: (id: string) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/acknowledge`, { method: 'POST' }),
  cancel: (id: string, body: { reason: string }) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) }),
  clone: (id: string, body: { tripDate: string }) =>
    request<DtpPlanSummary>(`/api/dtp/plans/${id}/clone`, { method: 'POST', body: JSON.stringify(body) }),

  // Sheets
  movementSheet: (deptId: string, date: string) =>
    request<MovementSheet>(`/api/dtp/sheet/${deptId}/${date}`),
  runSheet: (driverId: string, date: string) =>
    request<RunSheet | null>(`/api/dtp/runsheet/${driverId}/${date}`),
  assignDriver: (body: { planId: string; driverId: string; vehicleId?: string }) =>
    request<{ runSheetId: string; driverId: string; vehicleId: string | null }>(`/api/dtp/runsheet/assign`, { method: 'POST', body: JSON.stringify(body) }),

  // Legs
  setLegStatus: (legId: string, body: { status: 'EN_ROUTE' | 'COMPLETED' | 'SKIPPED'; lat?: number; lng?: number; note?: string }) =>
    request<{ id: string; status: string }>(`/api/dtp/legs/${legId}/status`, { method: 'POST', body: JSON.stringify(body) }),

  // Lookups
  listTripTypes: () => request<DtpTripType[]>('/api/dtp/trip-types'),
  listDrivers: () => request<DtpDriver[]>('/api/dtp/drivers'),
  listVehicles: () => request<DtpVehicle[]>('/api/dtp/vehicles'),

  // Settings (admin)
  getSettings: () =>
    request<{ settings: DtpSettings; approvals: DtpDepartmentApproval[] }>('/api/dtp/settings'),
  putSettings: (body: { settings?: Partial<DtpSettings>; approvals?: Array<Omit<DtpDepartmentApproval, 'id'> & { failoverHours?: number; managerEndorsementMode?: 'OFF' | 'ADVISORY' | 'REQUIRED' }> }) =>
    request<{ settings: DtpSettings; approvals: DtpDepartmentApproval[] }>('/api/dtp/settings', { method: 'PUT', body: JSON.stringify(body) }),
}
