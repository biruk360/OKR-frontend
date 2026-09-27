'use client'

import type {
  CreateLetterForm,
  UpdateLetterForm,
  LetterDispatchMethod,
  LetterTypeRecord,
} from '@/types'
import type {
  LetterDetail,
  LetterListItem,
  LetterEnclosureWithUploader,
  LetterReport,
  LetterTemplateDraft,
  LetterTemplateRecord,
  OdooContact,
} from '../types'

async function parse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Request failed (${res.status})`)
  }
  return json.data as T
}

export async function listLetters(params: {
  status?: string
  letterType?: string
  search?: string
  mine?: boolean
  includeArchived?: boolean
  page?: number
  limit?: number
}): Promise<{ items: LetterListItem[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  })
  const res = await fetch(`/api/letters?${qs.toString()}`, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load letters')
  return {
    items: json.data as LetterListItem[],
    total: json.pagination?.total ?? json.data.length,
    page: json.pagination?.page ?? 1,
    limit: json.pagination?.limit ?? json.data.length,
  }
}

export async function getLetter(id: string): Promise<LetterDetail> {
  const res = await fetch(`/api/letters/${id}`, { cache: 'no-store' })
  return parse<LetterDetail>(res)
}

export async function createLetter(input: CreateLetterForm & { templateId?: string | null }): Promise<LetterListItem> {
  const res = await fetch('/api/letters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parse<LetterListItem>(res)
}

export async function updateLetter(id: string, input: UpdateLetterForm): Promise<LetterDetail> {
  const res = await fetch(`/api/letters/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parse<LetterDetail>(res)
}

export async function deleteLetter(id: string): Promise<void> {
  const res = await fetch(`/api/letters/${id}`, { method: 'DELETE' })
  await parse<{ id: string }>(res)
}

export const submitLetter = (id: string) =>
  fetch(`/api/letters/${id}/submit`, { method: 'POST' }).then(parse<LetterDetail>)

export const approveLetter = (id: string) =>
  fetch(`/api/letters/${id}/approve`, { method: 'POST' }).then(parse<LetterDetail>)

export const rejectLetter = (id: string, reason: string) =>
  fetch(`/api/letters/${id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).then(parse<LetterDetail>)

export const markLetterSent = (
  id: string,
  payload: { dispatchMethod: LetterDispatchMethod; dispatchDate?: string; trackingReference?: string }
) =>
  fetch(`/api/letters/${id}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(parse<LetterDetail>)

export const archiveLetter = (id: string, force = false) =>
  fetch(`/api/letters/${id}/archive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force }),
  }).then(parse<LetterDetail>)

export const unarchiveLetter = (id: string) =>
  fetch(`/api/letters/${id}/archive`, { method: 'DELETE' }).then(parse<LetterDetail>)

export async function generateLetterPdf(
  id: string,
  lang: 'en' | 'am' = 'en'
): Promise<{ blobUrl: string; missing: string[] }> {
  const res = await fetch(`/api/letters/${id}/pdf?lang=${lang}`, { method: 'POST' })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j?.error || `PDF generation failed (${res.status})`)
  }
  const missingHeader = res.headers.get('x-missing-placeholders') || ''
  const missing = missingHeader ? missingHeader.split(',').filter(Boolean) : []
  const blob = await res.blob()
  return { blobUrl: URL.createObjectURL(blob), missing }
}

/** Upload one enclosure file (multipart). Server validates type, bytes and size. */
export function uploadEnclosure(id: string, file: File): Promise<LetterEnclosureWithUploader> {
  const form = new FormData()
  form.append('file', file)
  return fetch(`/api/letters/${id}/enclosures`, { method: 'POST', body: form }).then(
    parse<LetterEnclosureWithUploader>
  )
}

export const removeEnclosure = (id: string, enclosureId: string) =>
  fetch(`/api/letters/${id}/enclosures/${enclosureId}`, { method: 'DELETE' }).then(parse<{ id: string }>)

export const listLetterTypes = (): Promise<LetterTypeRecord[]> =>
  fetch('/api/letters/types').then(parse<LetterTypeRecord[]>)

export const createLetterType = (input: { name: string; code?: string; description?: string }): Promise<LetterTypeRecord> =>
  fetch('/api/letters/types', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then(parse<LetterTypeRecord>)

export const searchOdooContacts = (q: string) =>
  fetch(`/api/letters/odoo/contacts?q=${encodeURIComponent(q)}`).then(
    parse<{ odooAvailable: boolean; results: OdooContact[] }>
  )

export const duplicateLetter = (id: string): Promise<{ id: string; referenceNumber: string; subject: string }> =>
  fetch(`/api/letters/${id}/duplicate`, { method: 'POST' }).then(parse<{ id: string; referenceNumber: string; subject: string }>)

// ---------- Templates (FR-4 default body; letter:admin management) ----------

export function listLetterTemplatesApi(params: { letterType?: string; includeArchived?: boolean } = {}) {
  const qs = new URLSearchParams()
  if (params.letterType) qs.set('letterType', params.letterType)
  if (params.includeArchived) qs.set('includeArchived', 'true')
  return fetch(`/api/letters/templates?${qs.toString()}`, { cache: 'no-store' }).then(
    parse<LetterTemplateRecord[]>
  )
}

export const createLetterTemplate = (input: LetterTemplateDraft) =>
  fetch('/api/letters/templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then(parse<LetterTemplateRecord>)

export const updateLetterTemplate = (
  templateId: string,
  input: Partial<LetterTemplateDraft> & { isActive?: boolean }
) =>
  fetch(`/api/letters/templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then(parse<LetterTemplateRecord>)

// ---------- Reports (FR-16) ----------

export function getLetterReport(params: { from?: string; to?: string; letterTypeId?: string }) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
  return fetch(`/api/letters/reports?${qs.toString()}`, { cache: 'no-store' }).then(parse<LetterReport>)
}
