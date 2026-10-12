'use client'

/**
 * LinkManagerModal — list, add and remove OKR links (LNK-1…4) for one objective
 * or key result. The item is always the FROM end of a new link:
 *   - "Contributes to" a higher item in the same timeframe (LNK-1, LNK-3), with the
 *     LNK-4 option to adopt a company KR's objective as parent;
 *   - "Succeeds" an earlier item (usually a previous timeframe) with a sub-kind and
 *     an optional primary flag that mirrors into rolledFromId (LNK-2).
 * Targets are searched server-side: objectives via /api/objectives/alignment-search
 * (timeframe-scoped), key results via /api/keyresults?search= (filtered to the
 * timeframe here). EntityPicker is not used because it loads a capped list
 * (200 objectives) and filters client-side, so large timeframes would miss targets.
 *
 * Permissions come from the API: `permissions.canCreate` gates the form and each
 * link's `canDelete` its remove button; the server re-checks everything (403/409/423
 * messages surface verbatim).
 */
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, type FieldError, type FieldErrors, type Resolver } from 'react-hook-form'
import { KeyRound, Link2, Loader2, Plus, Search, Target, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConnectionItemRow, connectionItemTitle } from '@/components/shared/connections'
import { useDebounce } from '@/hooks/useDebounce'
import { useTimeframes } from '@/hooks/useTimeframes'
import { cn } from '@/lib/utils'
import { OKR_LINK_NOTE_MAX } from '@/lib/okr-links/validation'
import {
  OKR_LINK_KIND_LABELS,
  OKR_LINK_SUB_KIND_LABELS,
  OKR_LINK_SUB_KINDS,
  type OkrLinkEntityType,
  type OkrLinkKind,
  type OkrLinkSubKind,
} from '@/types/package'
import { useCreateOkrLink, useDeleteOkrLink, useLinkTargetSearch, useOkrLinks } from '../hooks/useOkrLinks'
import type { LinkTargetOption, OkrLinkSubject, OkrLinkViewDto } from '../types'
import {
  KIND_DESCRIPTIONS,
  buildCreateLinkPayload,
  canSetParent,
  canSetPrimary,
  defaultLinkFormValues,
  defaultTargetType,
  filterLinkTargets,
  groupOkrLinks,
  linkFormSchema,
  linkRelationLabel,
  previousTimeframeId,
  type LinkFormValues,
} from '../utils'

export interface LinkManagerModalProps {
  open: boolean
  onClose: () => void
  entityType: OkrLinkEntityType
  entityId: string
  entityTitle?: string | null
  /** The item's timeframe. CONTRIBUTES_TO targets are locked to it (LNK-1). */
  timeframeId?: string | null
  /** Kind preselected in the add form. Default CONTRIBUTES_TO. */
  defaultKind?: OkrLinkKind
  /** After a link is added or removed. */
  onChanged?: () => void
}

/** Zod → react-hook-form bridge (the repo has no @hookform/resolvers). */
const linkFormResolver: Resolver<LinkFormValues> = async (values) => {
  const result = linkFormSchema.safeParse(values)
  if (result.success) return { values: result.data, errors: {} }
  // Every rule reports on a top-level field (`target` included), so a flat map is enough.
  const errors: Record<string, FieldError> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as FieldErrors<LinkFormValues> }
}

const LEVEL_LABEL: Record<string, string> = { COMPANY: 'Company', DEPARTMENT: 'Department', INDIVIDUAL: 'Individual' }
const TYPE_LABEL: Record<OkrLinkEntityType, string> = { OBJECTIVE: 'Objective', KEY_RESULT: 'Key result' }

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--ap-fg)' }}>
      {children}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium" style={{ color: 'var(--ap-danger-fg)' }} role="alert">
      {message}
    </p>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--ap-radius-sm)] p-0.5" style={{ background: 'var(--ap-bg-sunken)' }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[calc(var(--ap-radius-sm)-2px)] px-3 py-1 text-xs font-semibold transition-colors ap-focus-ring',
              active ? 'shadow-sm' : 'hover:text-[var(--ap-fg)]',
            )}
            style={active ? { background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' } : { color: 'var(--ap-fg-muted)' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function TargetOptionRow({ option, selected, onSelect }: { option: LinkTargetOption; selected: boolean; onSelect: () => void }) {
  const Icon = option.type === 'KEY_RESULT' ? KeyRound : Target
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-left transition-colors',
        selected ? 'bg-[var(--ap-accent-soft)]' : 'hover:bg-[var(--ap-bg-hover)]',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-xs font-medium" style={{ color: selected ? 'var(--ap-accent-on-soft)' : 'var(--ap-fg)' }}>
          {option.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>
          {option.level && <span>{LEVEL_LABEL[option.level] ?? option.level}</span>}
          {option.objectiveTitle && <span className="truncate">· {option.objectiveTitle}</span>}
          {option.ownerName && <span>· {option.ownerName}</span>}
          {option.timeframeName && <span>· {option.timeframeName}</span>}
          {typeof option.progress === 'number' && <span className="tabular-nums">· {Math.round(option.progress)}%</span>}
        </span>
      </span>
    </button>
  )
}

function ExistingLinks({ links, onRemove }: { links: OkrLinkViewDto[]; onRemove: (link: OkrLinkViewDto) => void }) {
  const groups = groupOkrLinks(links)
  const sections: Array<{ title: string; items: OkrLinkViewDto[] }> = [
    { title: 'Contributes to', items: groups.contributesTo },
    { title: 'Succeeds', items: groups.succeeds },
    { title: 'Supported by', items: groups.supportedBy },
    { title: 'Succeeded by', items: groups.succeededBy },
  ].filter((s) => s.items.length > 0)

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <section key={section.title} aria-label={section.title}>
          <p className="text-micro font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
            {section.title} <span className="tabular-nums">· {section.items.length}</span>
          </p>
          {section.items.map((link) => (
            <div key={link.id}>
              <ConnectionItemRow
                item={link.counterpart}
                showVia={false}
                showFinal={link.kind === 'SUCCEEDS'}
                trailing={
                  <>
                    <MiniBadge tone={link.kind === 'CONTRIBUTES_TO' ? 'accent' : 'neutral'}>{linkRelationLabel(link)}</MiniBadge>
                    {link.canDelete && (
                      <button
                        type="button"
                        onClick={() => onRemove(link)}
                        aria-label={`Remove link to ${connectionItemTitle(link.counterpart)}`}
                        className="rounded-[var(--ap-radius-xs)] p-1 transition-colors hover:bg-[var(--ap-danger-bg)]"
                        style={{ color: 'var(--ap-danger-fg)' }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </>
                }
              />
              {link.note && (
                <p className="-mt-1 mb-1.5 pl-6 text-micro italic" style={{ color: 'var(--ap-fg-muted)' }}>
                  “{link.note}”
                </p>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export function LinkManagerModal({
  open,
  onClose,
  entityType,
  entityId,
  entityTitle,
  timeframeId: subjectTimeframeId,
  defaultKind = 'CONTRIBUTES_TO',
  onChanged,
}: LinkManagerModalProps) {
  const subject: OkrLinkSubject = useMemo(
    () => ({ type: entityType, id: entityId, title: entityTitle, timeframeId: subjectTimeframeId }),
    [entityType, entityId, entityTitle, subjectTimeframeId],
  )

  const linksQuery = useOkrLinks(entityType, entityId, { enabled: open })
  const links = linksQuery.data?.links ?? []
  const canCreate = !!linksQuery.data?.permissions.canCreate
  const { timeframes } = useTimeframes({ enabled: open })

  const [pendingDelete, setPendingDelete] = useState<OkrLinkViewDto | null>(null)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)

  const { control, register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<LinkFormValues>({
    resolver: linkFormResolver,
    defaultValues: defaultLinkFormValues(subject, defaultKind),
  })
  const kind = watch('kind')
  const targetType = watch('targetType')
  const timeframeId = watch('timeframeId')
  const target = watch('target')
  const note = watch('note')

  // Fresh form each time the modal opens (or the subject changes).
  useEffect(() => {
    if (!open) return
    // SUCCEEDS starts without a timeframe so the effect below picks the previous period.
    const initial = defaultLinkFormValues(subject, defaultKind)
    reset(defaultKind === 'SUCCEEDS' ? { ...initial, timeframeId: undefined } : initial)
    setSearch('')
  }, [open, subject, defaultKind, reset])

  // Default timeframe once the list is known: SUCCEEDS looks at the previous period;
  // with no known subject timeframe, CONTRIBUTES_TO starts on the active one.
  useEffect(() => {
    if (!open || timeframes.length === 0 || timeframeId) return
    const active = timeframes.find((t) => t.isActive)?.id ?? timeframes[0]?.id
    setValue('timeframeId', kind === 'SUCCEEDS' ? previousTimeframeId(timeframes, subjectTimeframeId) ?? active : subjectTimeframeId ?? active)
  }, [open, timeframes, timeframeId, kind, subjectTimeframeId, setValue])

  const changeKind = (next: OkrLinkKind) => {
    setValue('kind', next)
    setValue('targetType', defaultTargetType(next, entityType))
    setValue('subKind', next === 'SUCCEEDS' ? 'CARRIED' : null)
    setValue('isPrimary', false)
    setValue('setParent', false)
    setValue('target', null)
    const tf =
      next === 'SUCCEEDS'
        ? previousTimeframeId(timeframes, subjectTimeframeId) ?? subjectTimeframeId ?? undefined
        : subjectTimeframeId ?? timeframeId
    setValue('timeframeId', tf ?? undefined)
  }

  const createLink = useCreateOkrLink({
    onSuccess: () => {
      reset({ ...defaultLinkFormValues(subject, kind), timeframeId })
      setSearch('')
      onChanged?.()
    },
  })
  const deleteLink = useDeleteOkrLink({
    onSuccess: () => {
      setPendingDelete(null)
      onChanged?.()
    },
  })

  const targetsQuery = useLinkTargetSearch({
    targetType,
    timeframeId,
    q: debounced,
    enabled: open && canCreate,
  })
  const targets = filterLinkTargets(targetsQuery.data ?? [], {
    subject,
    kind,
    existing: links.filter((l) => l.direction === 'OUTGOING'),
    timeframeId,
  })

  const onSubmit = handleSubmit((values) => {
    const built = buildCreateLinkPayload(subject, values)
    if (!built.ok) return
    createLink.mutate(built.payload)
  })
  const shapeError = target ? (() => {
    const built = buildCreateLinkPayload(subject, { kind, targetType, timeframeId, target, subKind: watch('subKind'), isPrimary: watch('isPrimary'), setParent: watch('setParent'), note: note ?? '' })
    return built.ok ? null : built.message
  })() : null

  const timeframeLocked = kind === 'CONTRIBUTES_TO' && !!subjectTimeframeId
  const showPrimary = target ? canSetPrimary(kind, entityType, target.type) : kind === 'SUCCEEDS' && targetType === entityType
  const showParent = target ? canSetParent(kind, entityType, target.type) : canSetParent(kind, entityType, targetType)
  const needsQuery = targetType === 'KEY_RESULT' && debounced.trim().length < 2

  return (
    <>
      <Modal
        open={open}
        onClose={() => { if (!createLink.isPending) onClose() }}
        title={entityTitle ? `Links · ${entityTitle}` : 'Manage links'}
        icon={Link2}
        iconClassName="text-primary"
        size="lg"
        footer={
          <Button type="button" variant="outline" onClick={onClose} disabled={createLink.isPending}>
            Done
          </Button>
        }
      >
        <div className="space-y-5">
          {/* Current links */}
          <section aria-label="Current links">
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
              Current links {linksQuery.data && <span className="tabular-nums">({links.length})</span>}
            </h3>
            {linksQuery.isLoading ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : linksQuery.isError ? (
              <p className="text-xs" style={{ color: 'var(--ap-danger-fg)' }}>
                {linksQuery.error instanceof Error ? linksQuery.error.message : 'Could not load links.'}
              </p>
            ) : links.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
                No links yet. Link this {TYPE_LABEL[entityType].toLowerCase()} to the item it contributes to, or to the earlier item it continues.
              </p>
            ) : (
              <ExistingLinks links={links} onRemove={setPendingDelete} />
            )}
          </section>

          {/* Add a link */}
          {linksQuery.data && !canCreate && (
            <p className="rounded-[var(--ap-radius-md)] px-3 py-2 text-xs" style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}>
              You can see these links but not change them. The owner of this item (or an admin) can add links.
            </p>
          )}

          {canCreate && (
            <form onSubmit={onSubmit} className="space-y-4 rounded-[var(--ap-radius-md)] border p-4" style={{ borderColor: 'var(--ap-border)' }} noValidate>
              <h3 className="text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
                Add a link
              </h3>

              <div className="flex flex-wrap items-start gap-4">
                <div>
                  <FieldLabel>This {TYPE_LABEL[entityType].toLowerCase()}…</FieldLabel>
                  <Segmented<OkrLinkKind>
                    label="Link kind"
                    value={kind}
                    onChange={changeKind}
                    options={[
                      { value: 'CONTRIBUTES_TO', label: OKR_LINK_KIND_LABELS.CONTRIBUTES_TO },
                      { value: 'SUCCEEDS', label: OKR_LINK_KIND_LABELS.SUCCEEDS },
                    ]}
                  />
                </div>
                <div>
                  <FieldLabel>Target</FieldLabel>
                  <Segmented<OkrLinkEntityType>
                    label="Target type"
                    value={targetType}
                    onChange={(t) => { setValue('targetType', t); setValue('target', null) }}
                    options={[
                      { value: 'KEY_RESULT', label: 'Key result' },
                      { value: 'OBJECTIVE', label: 'Objective' },
                    ]}
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <FieldLabel>Timeframe</FieldLabel>
                  <Controller
                    control={control}
                    name="timeframeId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={(v) => { field.onChange(v); setValue('target', null) }}
                        disabled={timeframeLocked}
                      >
                        <SelectTrigger className="h-8 w-full text-xs" aria-label="Timeframe">
                          <SelectValue placeholder="Choose a timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeframes.map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">
                              {t.name}{t.isActive ? ' (active)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {timeframeLocked && (
                    <p className="mt-1 text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>“Contributes to” stays inside this item’s timeframe.</p>
                  )}
                </div>
              </div>

              <p className="text-caption" style={{ color: 'var(--ap-fg-muted)' }}>{KIND_DESCRIPTIONS[kind]}</p>

              {/* Target search */}
              <div>
                <FieldLabel htmlFor="okr-link-search">{kind === 'CONTRIBUTES_TO' ? 'Contributes to' : 'Succeeds'}</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />
                  <input
                    id="okr-link-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={targetType === 'KEY_RESULT' ? 'Search key results by title…' : 'Search objectives by title…'}
                    className="h-8 w-full rounded-[var(--ap-radius-sm)] border bg-transparent pl-8 pr-8 text-xs outline-none focus:border-[var(--ap-focus)]"
                    style={{ borderColor: 'var(--ap-border-strong)', color: 'var(--ap-fg)' }}
                    autoComplete="off"
                  />
                  {targetsQuery.isFetching && (
                    <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin" style={{ color: 'var(--ap-fg-subtle)' }} aria-label="Searching" />
                  )}
                </div>
                <div
                  role="listbox"
                  aria-label="Link targets"
                  className="mt-1.5 max-h-[220px] overflow-y-auto rounded-[var(--ap-radius-sm)] border p-1"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  {targetType === 'OBJECTIVE' && !timeframeId ? (
                    <p className="p-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Choose a timeframe to list objectives.</p>
                  ) : needsQuery ? (
                    <p className="p-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>Type at least 2 characters to search key results.</p>
                  ) : targetsQuery.isLoading ? (
                    <div className="space-y-1.5 p-1" aria-busy="true">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : targetsQuery.isError ? (
                    <p className="p-2 text-xs" style={{ color: 'var(--ap-danger-fg)' }}>
                      {targetsQuery.error instanceof Error ? targetsQuery.error.message : 'Search failed.'}
                    </p>
                  ) : targets.length === 0 ? (
                    <p className="p-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>No matching items in this timeframe.</p>
                  ) : (
                    targets.map((option) => (
                      <TargetOptionRow
                        key={`${option.type}:${option.id}`}
                        option={option}
                        selected={target?.type === option.type && target.id === option.id}
                        onSelect={() => setValue('target', { type: option.type, id: option.id, title: option.title }, { shouldValidate: true })}
                      />
                    ))
                  )}
                </div>
                <FieldError message={errors.target?.message} />
              </div>

              {kind === 'SUCCEEDS' && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[180px]">
                    <FieldLabel>How it continues</FieldLabel>
                    <Controller
                      control={control}
                      name="subKind"
                      render={({ field }) => (
                        <Select value={field.value ?? 'CARRIED'} onValueChange={(v) => field.onChange(v as OkrLinkSubKind)}>
                          <SelectTrigger className="h-8 w-full text-xs" aria-label="Sub-kind">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OKR_LINK_SUB_KINDS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{OKR_LINK_SUB_KIND_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  {showPrimary && (
                    <Controller
                      control={control}
                      name="isPrimary"
                      render={({ field }) => (
                        <label className="flex cursor-pointer items-start gap-2 pb-1.5 text-xs" style={{ color: 'var(--ap-fg)' }}>
                          <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-label="Primary predecessor" />
                          <span>
                            Primary predecessor
                            <span className="block text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>Shows as “Rolled from” on this item.</span>
                          </span>
                        </label>
                      )}
                    />
                  )}
                </div>
              )}

              {showParent && (
                <Controller
                  control={control}
                  name="setParent"
                  render={({ field }) => (
                    <label className="flex cursor-pointer items-start gap-2 text-xs" style={{ color: 'var(--ap-fg)' }}>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-label="Also set parent objective" />
                      <span>
                        Also set the parent objective to this key result’s objective
                        <span className="block text-micro" style={{ color: 'var(--ap-fg-subtle)' }}>Only applies when this objective has no parent yet.</span>
                      </span>
                    </label>
                  )}
                />
              )}

              <div>
                <FieldLabel htmlFor="okr-link-note">Note (optional)</FieldLabel>
                <textarea
                  id="okr-link-note"
                  rows={2}
                  maxLength={OKR_LINK_NOTE_MAX}
                  {...register('note')}
                  className="w-full resize-y rounded-[var(--ap-radius-sm)] border bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-[var(--ap-focus)]"
                  style={{ borderColor: 'var(--ap-border-strong)', color: 'var(--ap-fg)' }}
                  placeholder="Why these items are linked"
                />
                <div className="flex justify-between">
                  <FieldError message={errors.note?.message} />
                  <span className="ml-auto text-micro tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
                    {(note ?? '').length}/{OKR_LINK_NOTE_MAX}
                  </span>
                </div>
              </div>

              {shapeError && <FieldError message={shapeError} />}

              <div className="flex items-center justify-end gap-2">
                {target && (
                  <p className="mr-auto min-w-0 truncate text-xs" style={{ color: 'var(--ap-fg-muted)' }}>
                    {OKR_LINK_KIND_LABELS[kind]} <span className="font-semibold" style={{ color: 'var(--ap-fg)' }}>{target.title}</span>
                  </p>
                )}
                <Button type="submit" size="sm" disabled={!target || !!shapeError || createLink.isPending}>
                  {createLink.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                  Add link
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => { if (!deleteLink.isPending) setPendingDelete(null) }}
        onConfirm={() => { if (pendingDelete) deleteLink.mutate(pendingDelete.id) }}
        title="Remove link?"
        message={
          pendingDelete
            ? `“${linkRelationLabel(pendingDelete)}: ${connectionItemTitle(pendingDelete.counterpart)}” will be removed.`
            : ''
        }
        description={
          pendingDelete?.isPrimary
            ? 'This is the primary predecessor, so the “Rolled from” link on the newer item is cleared too.'
            : undefined
        }
        confirmLabel="Remove link"
        isLoading={deleteLink.isPending}
        loadingLabel="Removing…"
      />
    </>
  )
}

export default LinkManagerModal
