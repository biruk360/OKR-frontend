import { prisma } from '@/lib/prisma'
import {
  LetterType,
  LETTER_TYPE_CODE,
  LETTER_TYPE_LABEL,
} from '@/types'

const REF_PATTERN = (typeCode: string, seq: number, year: number) =>
  `360G/LT/${typeCode}/${String(seq).padStart(3, '0')}/${year}`

/**
 * Allocate the next reference number for a given letter type+year, atomically.
 *
 * Why: spec FR-2 requires monotonic, no-duplicate sequence per (type, year).
 * How: interactive transaction with serializable isolation — the
 * `LetterSequence` row is the lock target; concurrent allocators serialize
 * through the unique `(typeCode, year)` constraint.
 */
export async function allocateLetterReference(letterType: LetterType, date: Date): Promise<string> {
  const typeCode = LETTER_TYPE_CODE[letterType]
  const year = date.getUTCFullYear()

  const seq = await prisma.$transaction(async (tx) => {
    const existing = await tx.letterSequence.findUnique({
      where: { typeCode_year: { typeCode, year } },
    })
    if (existing) {
      const updated = await tx.letterSequence.update({
        where: { id: existing.id },
        data: { lastSeq: existing.lastSeq + 1 },
      })
      return updated.lastSeq
    }
    const created = await tx.letterSequence.create({
      data: { typeCode, year, lastSeq: 1 },
    })
    return created.lastSeq
  })

  return REF_PATTERN(typeCode, seq, year)
}

/**
 * Default body templates per letter type. The `letter:admin` template-management
 * screen (FR-future) will eventually replace these constants with DB-stored
 * versions; for now we keep them inline.
 */
export const LETTER_TEMPLATES: Record<LetterType, string> = {
  COVER: `<p>{{salutation}}</p>
<p>We are pleased to submit the following documents for your consideration. Please find enclosed the items relevant to {{customer_name}}.</p>
<p>Should you require additional information, please do not hesitate to contact us.</p>
<p>{{closing}}</p>
<p><strong>{{signatory_name}}</strong><br/>{{sender_department}}</p>`,
  OFFER: `<p>{{salutation}}</p>
<p>Following our recent discussions with {{customer_name}}, we are pleased to extend the offer outlined below, valid as of {{date}}.</p>
<p>[Insert offer details]</p>
<p>This offer is subject to the terms detailed in the accompanying documents.</p>
<p>{{closing}}</p>
<p><strong>{{signatory_name}}</strong><br/>{{sender_department}}</p>`,
  GUARANTEE: `<p>{{salutation}}</p>
<p>This letter is issued in favour of {{customer_name}} as a guarantee in respect of the obligations described herein, with reference {{reference_number}} dated {{date}}.</p>
<p>[Insert guarantee particulars]</p>
<p>{{closing}}</p>
<p><strong>{{signatory_name}}</strong><br/>{{sender_department}}</p>`,
}

export interface PlaceholderContext {
  customerName: string
  date: Date
  referenceNumber: string | null
  signatoryName: string | null
  senderDepartment: string | null
  salutation: string | null
  closing: string | null
}

const PLACEHOLDER_KEYS = [
  'customer_name',
  'date',
  'reference_number',
  'signatory_name',
  'sender_department',
  'salutation',
  'closing',
] as const

function valueFor(key: (typeof PLACEHOLDER_KEYS)[number], ctx: PlaceholderContext): string | null {
  switch (key) {
    case 'customer_name': return ctx.customerName || null
    case 'date': return ctx.date.toISOString().slice(0, 10)
    case 'reference_number': return ctx.referenceNumber
    case 'signatory_name': return ctx.signatoryName
    case 'sender_department': return ctx.senderDepartment
    case 'salutation': return ctx.salutation
    case 'closing': return ctx.closing
  }
}

/**
 * Resolve `{{placeholder}}` tokens in a letter body.
 *
 * Returns the rendered HTML alongside a list of placeholders that had no value
 * available (rendered as `[MISSING: field_name]` per spec FR-7).
 */
export function resolvePlaceholders(body: string, ctx: PlaceholderContext): {
  html: string
  missing: string[]
} {
  const missing: string[] = []
  const html = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, raw: string) => {
    const key = raw.toLowerCase() as (typeof PLACEHOLDER_KEYS)[number]
    if (!PLACEHOLDER_KEYS.includes(key)) return match
    const v = valueFor(key, ctx)
    if (v === null || v === '') {
      missing.push(key)
      return `[MISSING: ${key}]`
    }
    return v
  })
  return { html, missing: Array.from(new Set(missing)) }
}

export function letterTypeLabel(type: LetterType): string {
  return LETTER_TYPE_LABEL[type]
}
