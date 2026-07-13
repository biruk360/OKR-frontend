'use client'

interface Envelope<T> { success: boolean; data?: T; error?: string; details?: unknown }

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok || !body?.success) {
    const error = new Error(body?.error ?? `Request failed: ${res.status}`) as Error & { details?: unknown; status?: number }
    error.status = res.status
    error.details = body?.details
    throw error
  }
  return body.data as T
}

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const out = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') out.set(key, String(value))
  }
  const query = out.toString()
  return query ? `?${query}` : ''
}

export const scrumApi = {
  prefill: (params: { userId?: string; date?: string } = {}) =>
    request<any>(`/api/scrum/updates${qs({ prefill: '1', ...params })}`),
  listUpdates: (params: Record<string, string | boolean | undefined>) =>
    request<any[]>(`/api/scrum/updates${qs(params)}`),
  saveUpdate: (body: Record<string, unknown>) =>
    request<any>('/api/scrum/updates', { method: 'POST', body: JSON.stringify(body) }),
  patchUpdate: (id: string, body: Record<string, unknown>) =>
    request<any>(`/api/scrum/updates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  calendar: (params: Record<string, string | boolean | undefined>) =>
    request<any>(`/api/scrum/calendar${qs(params)}`),
  analytics: (params: Record<string, string | undefined>) =>
    request<any>(`/api/scrum/analytics${qs(params)}`),
  wins: () => request<any[]>('/api/scrum/wins'),
  settings: () => request<any>('/api/scrum/settings'),
  saveSettings: (body: Record<string, unknown>) =>
    request<any>('/api/scrum/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  linkable: (userId?: string) => request<any>(`/api/scrum/linkable${qs({ userId })}`),
  proxySubjects: () => request<any[]>('/api/scrum/proxy-subjects'),
  celebrate: (id: string) => request<any>(`/api/scrum/updates/${id}/celebrate`, { method: 'POST' }),
  blockerAction: (id: string, body: Record<string, unknown>) =>
    request<any>(`/api/scrum/updates/${id}/blocker`, { method: 'POST', body: JSON.stringify(body) }),
  comment: (id: string, body: Record<string, unknown>) =>
    request<any>(`/api/scrum/updates/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  absences: (body: Record<string, unknown>) =>
    request<any>('/api/scrum/absences', { method: 'POST', body: JSON.stringify(body) }),
}
