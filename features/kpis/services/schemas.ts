/**
 * KPI zod schemas — shared by the API routes (server) and the forms (client).
 * Client-safe: no Prisma, no server imports.
 */
import { z } from 'zod'
import { isDateKey } from '@/lib/kpi/periods'
import {
  KPI_DIRECTIONS,
  KPI_FREQUENCIES,
  KPI_RAGS,
  KPI_STATUSES,
  KPI_TYPES,
  type KpiDirection,
  type KpiFrequency,
  type KpiRag,
  type KpiType,
} from '@/types/package'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

const optionalNumber = z
  .number()
  .refine((n) => Number.isFinite(n), 'Must be a number')
  .nullish()
  .transform((v) => (v === undefined ? null : v))

/** `YYYY-MM-DD` or a full ISO timestamp. */
const dateInput = z
  .string()
  .trim()
  .refine((v) => isDateKey(v) || !Number.isNaN(new Date(v).getTime()), 'Invalid date')

const definitionFields = {
  externalRef: optionalText(40),
  name: z.string().trim().min(1, 'Name is required').max(200),
  kpiType: z.enum(KPI_TYPES),
  definition: z.string().trim().min(1, 'Definition is required').max(4000),
  formula: optionalText(2000),
  dataSource: optionalText(2000),
  unit: z.string().trim().max(30),
  direction: z.enum(KPI_DIRECTIONS),
  baselineText: optionalText(500),
  baselineValue: optionalNumber,
  targetText: z.string().trim().min(1, 'Target is required').max(500),
  targetValue: optionalNumber,
  targetMin: optionalNumber,
  targetMax: optionalNumber,
  /** Fraction (0.9) or percentage (90). Normalised by lib/kpi normalizeThresholdAmber. */
  thresholdAmber: z.number().gt(0).lte(100),
  frequency: z.enum(KPI_FREQUENCIES),
  scoredFrom: dateInput.nullish().transform((v) => v ?? null),
  keyResultId: z.string().trim().min(1).nullish().transform((v) => v ?? null),
  isSensitive: z.boolean(),
  note: optionalText(2000),
}

function rangeIsValid(v: { direction?: string; targetMin?: number | null; targetMax?: number | null }): boolean {
  if (v.direction !== 'RANGE') return true
  if (v.targetMin == null || v.targetMax == null) return true
  return v.targetMin <= v.targetMax
}

export const kpiCreateSchema = z
  .object({
    ownerId: z.string().trim().min(1),
    timeframeId: z.string().trim().min(1),
    ...definitionFields,
    kpiType: definitionFields.kpiType.default('LEADING'),
    unit: definitionFields.unit.default(''),
    direction: definitionFields.direction.default('INCREASE'),
    thresholdAmber: definitionFields.thresholdAmber.default(0.9),
    frequency: definitionFields.frequency.default('MONTHLY'),
    isSensitive: definitionFields.isSensitive.default(false),
  })
  .refine(rangeIsValid, { message: 'Range minimum must not exceed the maximum', path: ['targetMin'] })
export type KpiCreateInput = z.infer<typeof kpiCreateSchema>

export const kpiUpdateSchema = z
  .object({
    ...definitionFields,
    status: z.enum(KPI_STATUSES),
  })
  .partial()
  .refine(rangeIsValid, { message: 'Range minimum must not exceed the maximum', path: ['targetMin'] })
export type KpiUpdateInput = z.infer<typeof kpiUpdateSchema>

export const kpiReadingUpsertSchema = z
  .object({
    /** Any date inside the period (bucketed by the KPI's frequency). */
    period: dateInput,
    value: optionalNumber,
    valueText: optionalText(500),
    /**
     * Manual RAG: a manager override of the computed RAG, or the only RAG of a
     * text-only / compound KPI (KPI-6). Omitted = keep the current override;
     * null = clear it.
     */
    rag: z.enum(KPI_RAGS).nullable().optional(),
    note: optionalText(2000),
  })
  .refine((v) => v.value !== null || v.valueText !== null, {
    message: 'Enter a value or a text reading',
    path: ['value'],
  })
export type KpiReadingUpsertInput = z.infer<typeof kpiReadingUpsertSchema>

// ---------------------------------------------------------------------------
// Form schemas (string inputs → API payloads)
// ---------------------------------------------------------------------------

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const numericString = z
  .string()
  .refine((v) => !v.trim() || parseOptionalNumber(v) !== null, 'Must be a number')

export const kpiFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    externalRef: z.string().max(40),
    kpiType: z.enum(KPI_TYPES),
    definition: z.string().trim().min(1, 'Definition is required').max(4000),
    formula: z.string().max(2000),
    dataSource: z.string().max(2000),
    unit: z.string().max(30),
    direction: z.enum(KPI_DIRECTIONS),
    baselineText: z.string().max(500),
    baselineValue: numericString,
    targetText: z.string().trim().min(1, 'Target is required').max(500),
    targetValue: numericString,
    targetMin: numericString,
    targetMax: numericString,
    thresholdAmberPercent: z
      .string()
      .refine((v) => {
        const n = parseOptionalNumber(v)
        return n !== null && n > 0 && n <= 100
      }, 'Between 1 and 100'),
    frequency: z.enum(KPI_FREQUENCIES),
    scoredFrom: z.string().refine((v) => !v || isDateKey(v), 'Invalid date'),
    keyResultId: z.string(),
    isSensitive: z.boolean(),
    note: z.string().max(2000),
  })
  .refine(
    (v) =>
      rangeIsValid({
        direction: v.direction,
        targetMin: parseOptionalNumber(v.targetMin),
        targetMax: parseOptionalNumber(v.targetMax),
      }),
    { message: 'Minimum must not exceed the maximum', path: ['targetMin'] },
  )
export type KpiFormValues = z.infer<typeof kpiFormSchema>

export const EMPTY_KPI_FORM: KpiFormValues = {
  name: '',
  externalRef: '',
  kpiType: 'LEADING',
  definition: '',
  formula: '',
  dataSource: '',
  unit: '',
  direction: 'INCREASE',
  baselineText: '',
  baselineValue: '',
  targetText: '',
  targetValue: '',
  targetMin: '',
  targetMax: '',
  thresholdAmberPercent: '90',
  frequency: 'MONTHLY',
  scoredFrom: '',
  keyResultId: '',
  isSensitive: false,
  note: '',
}

/** Form values → POST/PATCH body (without ownerId / timeframeId). */
export function kpiFormToPayload(values: KpiFormValues) {
  const isRange = values.direction === 'RANGE'
  return {
    name: values.name.trim(),
    externalRef: values.externalRef.trim() || null,
    kpiType: values.kpiType as KpiType,
    definition: values.definition.trim(),
    formula: values.formula.trim() || null,
    dataSource: values.dataSource.trim() || null,
    unit: values.unit.trim(),
    direction: values.direction as KpiDirection,
    baselineText: values.baselineText.trim() || null,
    baselineValue: parseOptionalNumber(values.baselineValue),
    targetText: values.targetText.trim(),
    targetValue: parseOptionalNumber(values.targetValue),
    targetMin: isRange ? parseOptionalNumber(values.targetMin) : null,
    targetMax: isRange ? parseOptionalNumber(values.targetMax) : null,
    thresholdAmber: (parseOptionalNumber(values.thresholdAmberPercent) ?? 90) / 100,
    frequency: values.frequency as KpiFrequency,
    scoredFrom: values.scoredFrom || null,
    keyResultId: values.keyResultId.trim() || null,
    isSensitive: values.isSensitive,
    note: values.note.trim() || null,
  }
}

export const kpiReadingFormSchema = z
  .object({
    period: z.string().refine((v) => isDateKey(v), 'Pick a period'),
    value: numericString,
    valueText: z.string().max(500),
    rag: z.union([z.enum(KPI_RAGS), z.literal('')]),
    note: z.string().max(2000),
  })
  .refine((v) => v.value.trim() !== '' || v.valueText.trim() !== '', {
    message: 'Enter a value or a text reading',
    path: ['value'],
  })
export type KpiReadingFormValues = z.infer<typeof kpiReadingFormSchema>

/**
 * Form values → PUT body. Pass `includeRag: false` when the viewer may not set
 * a manual RAG, so the body leaves the current override untouched.
 */
export function kpiReadingFormToPayload(values: KpiReadingFormValues, opts: { includeRag: boolean }) {
  return {
    period: values.period,
    value: parseOptionalNumber(values.value),
    valueText: values.valueText.trim() || null,
    ...(opts.includeRag ? { rag: (values.rag || null) as KpiRag | null } : {}),
    note: values.note.trim() || null,
  }
}
