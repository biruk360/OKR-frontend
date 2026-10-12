'use client'

/**
 * KrDefinitionSection (KRX-2 / KRX-4) — the "Definition" section of the KR
 * detail page and quick view: commitment (C / A / C/A, with "70% = success" for
 * aspirational KRs), direction, baseline, target, measured by and due.
 *
 * Editable inline by the KR owner and managers (the API's `canEditDefinition`),
 * saving through PATCH /api/keyresults/[id]. Redacted viewers see nothing.
 *
 * Data comes from GET /api/keyresults/[id]/checkpoints (shared with
 * CheckpointStrip, so both on one page cost one request). A host that already
 * holds the fields may pass `definition` (and `canEdit`) to render without it.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { ArrowDownRight, ArrowUpRight, Lock, Pencil } from 'lucide-react'
import { Button, Input, Label, SectionHeading, Textarea } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { AppleDatePicker } from '@/components/ui/date-picker'
import { cn } from '@/lib/utils'
import {
  KR_COMMITMENTS,
  KR_COMMITMENT_LABELS,
  KR_COMMITMENT_SHORT,
  KR_DIRECTIONS,
  KR_DIRECTION_LABELS,
  type KrDirection,
} from '@/types/package'
import { useKrDefinition, useUpdateKrDefinition } from '../../hooks/useKrDefinition'
import type { KrDefinitionDTO } from '../checkpoints/checkpoint-types'
import { formatCheckpointDate, formatCheckpointValue } from '../checkpoints/checkpoint-utils'
import { zodFormResolver } from '../checkpoints/zod-form-resolver'
import CommitmentBadge, { commitmentSuccessHint } from './CommitmentBadge'
import {
  DEFINITION_LIMITS,
  buildDefinitionPatch,
  definitionFormSchema,
  definitionToFormValues,
  type DefinitionFormValues,
} from './definition-form'

export interface KrDefinitionSectionProps {
  keyResultId: string
  /** Pre-loaded definition; when given (with `canEdit`) the section does not fetch. */
  definition?: KrDefinitionDTO | null
  /** Override the API's edit permission (only meaningful with `definition`). */
  canEdit?: boolean
  /** `full` (default) for the detail page; `compact` = read-only, tighter rows (quick view). */
  variant?: 'full' | 'compact'
  title?: string
  className?: string
  /** Called after a successful save (e.g. router.refresh() on the detail page). */
  onSaved?: () => void
}

const DIRECTION_ICON: Record<KrDirection, typeof ArrowUpRight> = {
  INCREASE: ArrowUpRight,
  DECREASE: ArrowDownRight,
}

const DIRECTION_HINT: Record<KrDirection, string> = {
  INCREASE: 'Higher is better',
  DECREASE: 'Lower is better',
}

function Row({ label, children, compact }: { label: string; children: ReactNode; compact: boolean }) {
  return (
    <div className={cn('grid gap-x-3', compact ? 'grid-cols-[6.5rem_minmax(0,1fr)] py-1' : 'grid-cols-1 py-1.5 sm:grid-cols-[8rem_minmax(0,1fr)]')}>
      <dt className="text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
        {label}
      </dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-body-sm" style={{ color: 'var(--ap-fg)' }}>
        {children}
      </dd>
    </div>
  )
}

function Empty() {
  return <span style={{ color: 'var(--ap-fg-faint)' }}>—</span>
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium" style={{ color: 'var(--ap-danger-fg)' }} role="alert">
      {message}
    </p>
  )
}

function DefinitionView({ def, compact }: { def: KrDefinitionDTO; compact: boolean }) {
  const DirIcon = DIRECTION_ICON[def.direction]
  const span =
    def.startValue != null && def.targetValue != null
      ? `${formatCheckpointValue(def.startValue, def.unit)} → ${formatCheckpointValue(def.targetValue, def.unit)}`
      : null
  const due = [def.dueText, def.dueDate ? formatCheckpointDate(def.dueDate) : null].filter(Boolean).join(' · ')
  return (
    <dl className={cn(!compact && 'divide-y divide-[var(--ap-border)]')}>
      <Row label="Commitment" compact={compact}>
        {def.commitment ? <CommitmentBadge commitment={def.commitment} showLabel /> : <Empty />}
      </Row>
      <Row label="Direction" compact={compact}>
        <span className="inline-flex items-center gap-1.5">
          <DirIcon className="size-3.5" style={{ color: 'var(--ap-fg-muted)' }} aria-hidden />
          {KR_DIRECTION_LABELS[def.direction]}
          <span className="text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>
            {DIRECTION_HINT[def.direction]}
            {span ? ` · ${span}` : ''}
          </span>
        </span>
      </Row>
      <Row label="Baseline" compact={compact}>
        {def.baselineText || <Empty />}
      </Row>
      <Row label="Target" compact={compact}>
        {def.targetText || <Empty />}
      </Row>
      <Row label="Measured by" compact={compact}>
        {def.measuredBy || <Empty />}
      </Row>
      <Row label="Due" compact={compact}>
        {due || <Empty />}
      </Row>
    </dl>
  )
}

function DefinitionEditForm({
  keyResultId,
  def,
  onDone,
  onSaved,
}: {
  keyResultId: string
  def: KrDefinitionDTO
  onDone: () => void
  onSaved?: () => void
}) {
  const mutation = useUpdateKrDefinition(keyResultId, { onSaved })
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DefinitionFormValues>({
    resolver: zodFormResolver<DefinitionFormValues>(definitionFormSchema),
    defaultValues: definitionToFormValues(def),
  })

  useEffect(() => {
    reset(definitionToFormValues(def))
  }, [def, reset])

  const direction = watch('direction')
  const commitment = watch('commitment')
  const directionChanged = direction !== def.direction
  const hint = commitmentSuccessHint(commitment || null)
  const busy = isSubmitting || mutation.isPending
  const unitLabel = def.unit?.trim() ? ` (${def.unit.trim()})` : ''

  const onSubmit = handleSubmit(async (values) => {
    const body = buildDefinitionPatch(def, values)
    if (!body) {
      onDone()
      return
    }
    try {
      await mutation.mutateAsync(body)
    } catch {
      return // the mutation toasts the error; keep the form open
    }
    onDone()
  })

  const segment = (active: boolean) =>
    cn(
      'inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[var(--ap-radius-sm)] px-2 text-body-sm font-medium transition-colors ap-focus-ring',
      !active && 'hover:bg-[var(--ap-bg-hover)]',
    )
  const segmentStyle = (active: boolean) =>
    active
      ? { background: 'var(--ap-accent-soft)', color: 'var(--ap-accent-on-soft)' }
      : { color: 'var(--ap-fg-muted)' }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Commitment</Label>
          <Controller
            control={control}
            name="commitment"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Commitment" className="mt-1 flex gap-1 rounded-[var(--ap-radius-sm)] p-0.5" style={{ background: 'var(--ap-bg-sunken)' }}>
                {(['', ...KR_COMMITMENTS] as const).map((c) => (
                  <button
                    key={c || 'none'}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c}
                    title={c ? KR_COMMITMENT_LABELS[c] : 'Not set'}
                    onClick={() => field.onChange(c)}
                    className={segment(field.value === c)}
                    style={segmentStyle(field.value === c)}
                  >
                    {c ? KR_COMMITMENT_SHORT[c] : '—'}
                  </button>
                ))}
              </div>
            )}
          />
          {hint && (
            <p className="mt-1 text-caption font-medium" style={{ color: 'var(--ap-ahead-fg)' }}>
              Aspirational: {hint}
            </p>
          )}
        </div>
        <div>
          <Label>Direction</Label>
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Direction" className="mt-1 flex gap-1 rounded-[var(--ap-radius-sm)] p-0.5" style={{ background: 'var(--ap-bg-sunken)' }}>
                {KR_DIRECTIONS.map((d) => {
                  const Icon = DIRECTION_ICON[d]
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={field.value === d}
                      title={DIRECTION_HINT[d]}
                      onClick={() => field.onChange(d)}
                      className={segment(field.value === d)}
                      style={segmentStyle(field.value === d)}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {KR_DIRECTION_LABELS[d]}
                    </button>
                  )
                })}
              </div>
            )}
          />
        </div>
      </div>

      {directionChanged && (
        <div className="grid grid-cols-2 gap-3 rounded-[var(--ap-radius-md)] p-3" style={{ background: 'var(--ap-bg-sunken)' }}>
          <p className="col-span-2 text-caption" style={{ color: 'var(--ap-fg-muted)' }}>
            Changing the direction needs a matching start and target
            {direction === 'DECREASE' ? ' (target below start).' : ' (target above start).'}
          </p>
          <div>
            <Label htmlFor="krdef-start">Start{unitLabel}</Label>
            <Input id="krdef-start" inputMode="decimal" className="mt-1" aria-invalid={!!errors.startValue} {...register('startValue')} />
            <FieldError message={errors.startValue?.message} />
          </div>
          <div>
            <Label htmlFor="krdef-target">Target{unitLabel}</Label>
            <Input id="krdef-target" inputMode="decimal" className="mt-1" aria-invalid={!!errors.targetValue} {...register('targetValue')} />
            <FieldError message={errors.targetValue?.message} />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="krdef-baseline">Baseline</Label>
        <Textarea
          id="krdef-baseline"
          rows={2}
          maxLength={DEFINITION_LIMITS.baselineText}
          placeholder='e.g. "38% of qualified bids (sales-team figure, Sep 2026)"'
          className="mt-1"
          aria-invalid={!!errors.baselineText}
          {...register('baselineText')}
        />
        <FieldError message={errors.baselineText?.message} />
      </div>
      <div>
        <Label htmlFor="krdef-target-text">Target</Label>
        <Textarea
          id="krdef-target-text"
          rows={2}
          maxLength={DEFINITION_LIMITS.targetText}
          placeholder="The full target as written"
          className="mt-1"
          aria-invalid={!!errors.targetText}
          {...register('targetText')}
        />
        <FieldError message={errors.targetText?.message} />
      </div>
      <div>
        <Label htmlFor="krdef-measured-by">Measured by</Label>
        <Input
          id="krdef-measured-by"
          maxLength={DEFINITION_LIMITS.measuredBy}
          placeholder="Data source or KPI ids"
          className="mt-1"
          aria-invalid={!!errors.measuredBy}
          {...register('measuredBy')}
        />
        <FieldError message={errors.measuredBy?.message} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
        <div>
          <Label htmlFor="krdef-due-text">Due</Label>
          <Input
            id="krdef-due-text"
            maxLength={DEFINITION_LIMITS.dueText}
            placeholder='e.g. "Measured Q2; scored Q3 and Q4"'
            className="mt-1"
            aria-invalid={!!errors.dueText}
            {...register('dueText')}
          />
          <FieldError message={errors.dueText?.message} />
        </div>
        <div>
          <Label>Due date</Label>
          <div className="mt-1">
            <Controller
              control={control}
              name="dueDate"
              render={({ field }) => (
                <AppleDatePicker value={field.value || null} onChange={(v) => field.onChange(v ?? '')} placeholder="No date" />
              )}
            />
          </div>
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save definition'}
        </Button>
      </div>
    </form>
  )
}

export default function KrDefinitionSection({
  keyResultId,
  definition: definitionProp,
  canEdit: canEditProp,
  variant = 'full',
  title = 'Definition',
  className,
  onSaved,
}: KrDefinitionSectionProps) {
  const preloaded = definitionProp !== undefined && canEditProp !== undefined
  const query = useKrDefinition(keyResultId, { enabled: !preloaded })
  const [editing, setEditing] = useState(false)
  const compact = variant === 'compact'

  const definition = definitionProp !== undefined ? definitionProp : query.definition
  const canEdit = !compact && (canEditProp ?? query.canEdit)

  if (!preloaded && query.isLoading) {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }
  if (!preloaded && query.isError) {
    if (query.error?.status === 403) return null
    return compact ? null : (
      <p className={cn('text-caption', className)} style={{ color: 'var(--ap-danger-fg)' }}>
        Could not load the definition.
      </p>
    )
  }
  if (!definition || query.isRedacted) return null

  const hasContent =
    !!definition.commitment ||
    !!definition.baselineText ||
    !!definition.targetText ||
    !!definition.measuredBy ||
    !!definition.dueText ||
    !!definition.dueDate
  if (compact && !hasContent) return null

  return (
    <section className={cn('space-y-2', className)} aria-label={title}>
      <SectionHeading
        title={title}
        as="h3"
        bordered={false}
        right={
          <span className="flex items-center gap-2">
            {!editing && definition.commitment && <CommitmentBadge commitment={definition.commitment} />}
            {!compact && query.isLocked && (
              <span className="inline-flex items-center gap-1 text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>
                <Lock className="size-3" aria-hidden /> Locked
              </span>
            )}
            {canEdit && !editing && (
              <Button type="button" variant="ghost" size="xs" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
          </span>
        }
      />
      {editing && canEdit ? (
        <DefinitionEditForm keyResultId={keyResultId} def={definition} onDone={() => setEditing(false)} onSaved={onSaved} />
      ) : !hasContent && !canEdit ? (
        <p className="text-body-sm" style={{ color: 'var(--ap-fg-subtle)' }}>
          No definition recorded.
        </p>
      ) : (
        <DefinitionView def={definition} compact={compact} />
      )}
    </section>
  )
}
