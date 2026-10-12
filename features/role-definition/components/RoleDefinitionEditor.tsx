'use client'

/**
 * RoleDefinitionEditor — create a role definition (or a new version of one),
 * or edit a version in place. Modal + react-hook-form with one field array for
 * the items, shown grouped by section (ROL). Used by the profile tab and, later,
 * the admin user record (PRF-6).
 *
 * The server decides who may save (manager chain / HR / Exec / Admin, never
 * self); callers only open this when the list API's `permissions.canEdit` is true.
 */
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { ArrowDown, ArrowUp, BadgeCheck, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { ROLE_ITEM_SECTIONS, ROLE_ITEM_SECTION_LABELS, type RoleItemSection } from '@/types/package'
import {
  ROLE_ITEM_LABEL_MAX,
  ROLE_ITEM_TEXT_MAX,
  ROLE_ITEMS_MAX,
  ROLE_PURPOSE_MAX,
  ROLE_REPORTS_TO_TEXT_MAX,
  ROLE_SEAT_TITLE_MAX,
} from '../services/schemas'
import type { RoleDefinitionWriteBody } from '../services/api'
import { useCreateRoleDefinition, useUpdateRoleDefinition } from '../hooks/queries'
import type { RoleDefinitionDTO } from '../types'

const SECTION_SINGULAR: Record<RoleItemSection, string> = {
  ACCOUNTABILITY: 'accountability',
  DIRECT_REPORT_SEAT: 'seat',
  DECISION_RIGHT: 'decision right',
  INTERFACE: 'interface',
  OTHER: 'item',
}

const SECTION_HINT: Record<RoleItemSection, string> = {
  ACCOUNTABILITY: 'What this seat is answerable for.',
  DIRECT_REPORT_SEAT: 'Planned direct-report seats, e.g. "Presales Lead (30 Nov 2026)". Shown as Vacant until a direct report holds the title.',
  DECISION_RIGHT: 'Decisions this seat may take without escalation.',
  INTERFACE: 'Teams and roles this seat works with.',
  OTHER: 'Anything else that belongs to the role.',
}

const formSchema = z.object({
  seatTitle: z.string().trim().min(1, 'Seat title is required').max(ROLE_SEAT_TITLE_MAX),
  reportsToId: z.string(),
  reportsToText: z.string().trim().max(ROLE_REPORTS_TO_TEXT_MAX),
  purpose: z.string().trim().min(1, 'Purpose is required').max(ROLE_PURPOSE_MAX),
  effectiveFrom: z.string(),
  items: z
    .array(
      z.object({
        /** Stored item id ('' for new items) — kept so reviews stay attached on edit. */
        itemId: z.string(),
        section: z.enum(ROLE_ITEM_SECTIONS),
        label: z.string().trim().max(ROLE_ITEM_LABEL_MAX),
        text: z.string().trim().min(1, 'Text is required').max(ROLE_ITEM_TEXT_MAX),
      }),
    )
    .max(ROLE_ITEMS_MAX),
})

type FormValues = z.infer<typeof formSchema>

/** Zod → react-hook-form bridge (no @hookform/resolvers in this repo), nested paths included. */
const resolver: Resolver<FormValues> = async (values) => {
  const result = formSchema.safeParse(values)
  if (result.success) return { values: result.data, errors: {} }
  const errors: Record<string, unknown> = {}
  for (const issue of result.error.issues) {
    let node = errors
    const path = issue.path.map(String)
    path.forEach((key, index) => {
      if (index === path.length - 1) {
        if (!node[key]) node[key] = { type: issue.code, message: issue.message }
      } else {
        const nextIsIndex = /^\d+$/.test(path[index + 1] ?? '')
        node[key] = (node[key] as Record<string, unknown>) ?? (nextIsIndex ? [] : {})
        node = node[key] as Record<string, unknown>
      }
    })
  }
  return { values: {}, errors: errors as FieldErrors<FormValues> }
}

function toFormValues(source: RoleDefinitionDTO | null | undefined): FormValues {
  return {
    seatTitle: source?.seatTitle ?? '',
    reportsToId: source?.reportsToId ?? '',
    reportsToText: source?.reportsToText ?? '',
    purpose: source?.purpose ?? '',
    effectiveFrom: source?.effectiveFrom ? source.effectiveFrom.slice(0, 10) : '',
    items: [...(source?.items ?? [])]
      .sort(
        (a, b) =>
          ROLE_ITEM_SECTIONS.indexOf(a.section) - ROLE_ITEM_SECTIONS.indexOf(b.section) || a.position - b.position,
      )
      .map((item) => ({ itemId: item.id, section: item.section, label: item.label ?? '', text: item.text })),
  }
}

function toBody(values: FormValues, keepItemIds: boolean): RoleDefinitionWriteBody {
  // Stored order = section order, then the order within the section.
  const items = ROLE_ITEM_SECTIONS.flatMap((section) =>
    values.items
      .filter((item) => item.section === section)
      .map((item) => ({
        ...(keepItemIds && item.itemId ? { id: item.itemId } : {}),
        section: item.section,
        label: item.label.trim() || null,
        text: item.text.trim(),
      })),
  )
  return {
    seatTitle: values.seatTitle.trim(),
    reportsToId: values.reportsToId || null,
    reportsToText: values.reportsToText.trim() || null,
    purpose: values.purpose.trim(),
    effectiveFrom: values.effectiveFrom || null,
    items,
  }
}

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none ap-focus-ring focus-visible:border-ring dark:bg-input/30'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

export interface RoleDefinitionEditorProps {
  open: boolean
  onClose: () => void
  /** The person the role definition belongs to. */
  userId: string
  /** Timeframe for a new version (null = evergreen). Ignored when editing. */
  timeframeId?: string | null
  /** Edit this version in place (PATCH). */
  definition?: RoleDefinitionDTO | null
  /** Prefill a new version (POST) from this one. */
  basedOn?: RoleDefinitionDTO | null
  onSaved?: (definition: RoleDefinitionDTO) => void
}

export function RoleDefinitionEditor({
  open,
  onClose,
  userId,
  timeframeId,
  definition,
  basedOn,
  onSaved,
}: RoleDefinitionEditorProps) {
  const isEdit = !!definition
  const source = definition ?? basedOn ?? null
  const { users, isLoading: usersLoading } = useUsersForSelection({ enabled: open })
  const createMutation = useCreateRoleDefinition()
  const updateMutation = useUpdateRoleDefinition()
  const saving = createMutation.isPending || updateMutation.isPending

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver, defaultValues: toFormValues(source) })
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'items' })

  useEffect(() => {
    if (open) reset(toFormValues(source))
    // Reset only when the dialog opens or the source version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source?.id])

  const watchedItems = watch('items')
  const reportsToId = watch('reportsToId')

  const managerOptions = useMemo(
    () =>
      users
        .filter((u) => u.id !== userId)
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
        .map((u) => ({ value: u.id, label: u.name ?? u.email })),
    [users, userId],
  )
  // Keep a reportsTo who is no longer in the active list selectable.
  const missingManager =
    reportsToId && !managerOptions.some((o) => o.value === reportsToId) && source?.reportsTo?.id === reportsToId
      ? source.reportsTo
      : null

  const indexesBySection = useMemo(() => {
    const map = new Map<RoleItemSection, number[]>()
    for (const section of ROLE_ITEM_SECTIONS) map.set(section, [])
    fields.forEach((field, index) => {
      const section = (watchedItems?.[index]?.section ?? field.section) as RoleItemSection
      map.get(section)?.push(index)
    })
    return map
  }, [fields, watchedItems])

  const moveWithinSection = (section: RoleItemSection, index: number, direction: -1 | 1) => {
    const list = indexesBySection.get(section) ?? []
    const at = list.indexOf(index)
    const other = list[at + direction]
    if (other !== undefined) swap(index, other)
  }

  const onSubmit = handleSubmit(async (values) => {
    const body = toBody(values, isEdit)
    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync({ id: definition!.id, body })
        : await createMutation.mutateAsync({ ...body, userId, timeframeId: timeframeId ?? null })
      onSaved?.(saved)
      onClose()
    } catch {
      // Toast shown by the mutation hook; keep the dialog open with the user's input.
    }
  })

  const title = isEdit
    ? definition?.status === 'APPROVED'
      ? 'Correct approved role definition'
      : 'Edit role definition'
    : basedOn
      ? 'New role definition version'
      : 'New role definition'

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={title}
      icon={BadgeCheck}
      size="lg"
      closeOnBackdrop={!isDirty}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-caption text-[var(--ap-fg-subtle)]">
            {isEdit
              ? definition?.status === 'APPROVED'
                ? 'Changes to an approved version are logged as edited after approval.'
                : 'Saved as a draft until approved.'
              : 'Saved as a draft. The manager chain, an Executive or an Admin approves it.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="role-definition-editor" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="role-definition-editor" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="rd-seat">Seat title</Label>
            <Input
              id="rd-seat"
              placeholder="e.g. Bid Lead, Strategic Pursuits & Senior Sales Engineer"
              aria-invalid={!!errors.seatTitle}
              className="mt-1"
              {...register('seatTitle')}
            />
            <FieldError message={errors.seatTitle?.message} />
          </div>
          <div>
            <Label htmlFor="rd-reports-to">Reports to (person)</Label>
            <select id="rd-reports-to" className={cn(selectClass, 'mt-1')} disabled={usersLoading} {...register('reportsToId')}>
              <option value="">{usersLoading ? 'Loading people…' : 'No person (use a seat below)'}</option>
              {missingManager && <option value={missingManager.id}>{missingManager.name}</option>}
              {managerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">Compared with the org chart; never changes it.</p>
          </div>
          <div>
            <Label htmlFor="rd-reports-to-text">Reports to (seat)</Label>
            <Input
              id="rd-reports-to-text"
              placeholder="e.g. Head of Commercial (when the manager is a seat)"
              className="mt-1"
              aria-invalid={!!errors.reportsToText}
              {...register('reportsToText')}
            />
            <FieldError message={errors.reportsToText?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="rd-purpose">Purpose</Label>
            <Textarea
              id="rd-purpose"
              rows={3}
              placeholder="Why this seat exists, in one or two sentences."
              className="mt-1"
              aria-invalid={!!errors.purpose}
              {...register('purpose')}
            />
            <FieldError message={errors.purpose?.message} />
          </div>
          <div>
            <Label htmlFor="rd-effective">Effective from</Label>
            <Input id="rd-effective" type="date" className="mt-1" {...register('effectiveFrom')} />
          </div>
        </div>

        {ROLE_ITEM_SECTIONS.map((section) => {
          const indexes = indexesBySection.get(section) ?? []
          return (
            <section key={section} className="space-y-2" aria-labelledby={`rd-section-${section}`}>
              <div className="flex items-end justify-between gap-3 border-b border-[var(--ap-border)] pb-1.5">
                <div className="min-w-0">
                  <h3 id={`rd-section-${section}`} className="text-body-sm font-semibold text-[var(--ap-fg)]">
                    {ROLE_ITEM_SECTION_LABELS[section]}
                    <span className="ml-1.5 font-normal tabular-nums text-[var(--ap-fg-subtle)]">{indexes.length}</span>
                  </h3>
                  <p className="text-caption text-[var(--ap-fg-subtle)]">{SECTION_HINT[section]}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fields.length >= ROLE_ITEMS_MAX}
                  onClick={() => append({ itemId: '', section, label: '', text: '' }, { shouldFocus: true })}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add {SECTION_SINGULAR[section]}
                </Button>
              </div>
              {indexes.length === 0 ? (
                <p className="py-1 text-caption text-[var(--ap-fg-subtle)]">None yet.</p>
              ) : (
                <ol className="space-y-2">
                  {indexes.map((index, position) => {
                    const field = fields[index]
                    const itemErrors = errors.items?.[index]
                    return (
                      <li
                        key={field.id}
                        className="rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 w-5 shrink-0 text-right text-caption tabular-nums text-[var(--ap-fg-subtle)]">
                            {position + 1}.
                          </span>
                          <div className="grid min-w-0 flex-1 gap-2">
                            <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
                              <Input
                                placeholder={section === 'DIRECT_REPORT_SEAT' ? 'Seat title (optional, else the text)' : 'Label (optional)'}
                                aria-label="Label"
                                {...register(`items.${index}.label` as const)}
                              />
                              <select
                                aria-label="Section"
                                className={selectClass}
                                value={watchedItems?.[index]?.section ?? field.section}
                                onChange={(event) =>
                                  setValue(`items.${index}.section`, event.target.value as RoleItemSection, {
                                    shouldDirty: true,
                                  })
                                }
                              >
                                {ROLE_ITEM_SECTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {ROLE_ITEM_SECTION_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Textarea
                              rows={2}
                              placeholder={
                                section === 'DIRECT_REPORT_SEAT' ? 'e.g. Presales Lead (30 Nov 2026)' : 'Describe the item'
                              }
                              aria-label="Text"
                              aria-invalid={!!itemErrors?.text}
                              {...register(`items.${index}.text` as const)}
                            />
                            <FieldError message={itemErrors?.text?.message ?? itemErrors?.label?.message} />
                          </div>
                          <div className="flex shrink-0 flex-col gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Move up"
                              disabled={position === 0}
                              onClick={() => moveWithinSection(section, index, -1)}
                            >
                              <ArrowUp aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Move down"
                              disabled={position === indexes.length - 1}
                              onClick={() => moveWithinSection(section, index, 1)}
                            >
                              <ArrowDown aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Remove item"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="text-[var(--ap-danger-fg)]" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )
        })}
      </form>
    </Modal>
  )
}
