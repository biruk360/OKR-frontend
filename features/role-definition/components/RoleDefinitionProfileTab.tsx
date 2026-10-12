'use client'

/**
 * RoleDefinitionProfileTab — the role definition part of the profile's
 * "Role & duties" tab (PRF-13): every section, status, version history,
 * ROL-3 reporting-line chip and ROL-4 vacant seats. Actions appear only when
 * the list API's `permissions` allow them (manager chain / HR / Exec / Admin
 * edit; manager chain / Exec / Admin approve; never self).
 *
 * The subject reviews items through the package review (PKG-2), which the
 * profile shell injects with `renderItemActions` (features never import each
 * other).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import {
  BadgeCheck,
  Briefcase,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  History,
  Pencil,
  Trash2,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ui/ActionsMenu'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { ROLE_ITEM_SECTION_LABELS } from '@/types/package'
import { useDeleteRoleDefinition, useRoleDefinitions } from '../hooks/queries'
import { checkReportingLine, groupItemsBySection, resolveDirectReportSeats } from '../services/rules'
import type { RoleDefinitionDTO, RoleDefinitionItemDTO, RoleDefinitionListResponse } from '../types'
import { ApproveRoleDefinitionDialog } from './ApproveRoleDefinitionDialog'
import { DirectReportSeatList, PersonInline, ReportingLineChip, RoleDefinitionStatusBadge } from './RoleDefinitionBits'
import { RoleDefinitionEditor } from './RoleDefinitionEditor'

export interface RoleDefinitionProfileTabProps {
  userId: string
  timeframeId: string
  /** Per-item slot, e.g. the package review Agree / Dispute controls (PKG-2). */
  renderItemActions?: (item: RoleDefinitionItemDTO, definition: RoleDefinitionDTO) => ReactNode
  className?: string
}

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; definition: RoleDefinitionDTO }
  | { mode: 'newVersion'; basedOn: RoleDefinitionDTO }

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

function formatDate(value: string | null | undefined, pattern = 'd MMM yyyy'): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : format(date, pattern)
}

function LoadingState() {
  return (
    <div className={cn(cardClass, 'space-y-4 p-5')} aria-busy="true" aria-label="Loading role definition">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  )
}

export function RoleDefinitionProfileTab({ userId, timeframeId, renderItemActions, className }: RoleDefinitionProfileTabProps) {
  const query = useRoleDefinitions(userId, timeframeId)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [approveTarget, setApproveTarget] = useState<RoleDefinitionDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinitionDTO | null>(null)
  const deleteMutation = useDeleteRoleDefinition()

  const data = query.data
  const shown = useMemo(() => {
    if (!data) return null
    if (viewingId) return data.history.find((v) => v.id === viewingId) ?? data.current
    return data.current
  }, [data, viewingId])

  if (query.isLoading) return <LoadingState />

  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status
    return (
      <EmptyState
        className={className}
        icon={Briefcase}
        title={status === 403 ? 'Role definition is private' : 'Could not load the role definition'}
        description={
          status === 403
            ? 'You do not have access to this person’s role definition.'
            : 'Something went wrong. Try again in a moment.'
        }
        action={status === 403 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
      />
    )
  }

  if (!data) return null
  const { permissions } = data

  const editorNode = (
    <RoleDefinitionEditor
      open={editor.mode !== 'closed'}
      onClose={() => setEditor({ mode: 'closed' })}
      userId={userId}
      timeframeId={data.timeframeId}
      definition={editor.mode === 'edit' ? editor.definition : null}
      basedOn={editor.mode === 'newVersion' ? editor.basedOn : null}
      onSaved={(saved) => setViewingId(saved.id === data.current?.id ? null : saved.id)}
    />
  )

  if (!shown) {
    return (
      <div className={className}>
        <EmptyState
          icon={Briefcase}
          title="No role definition yet"
          description={
            permissions.canCreate
              ? 'Describe the seat: title, reporting line, purpose, accountabilities and planned direct-report seats.'
              : data.readOnly
                ? 'This timeframe has ended, so its role definitions are read-only.'
                : 'The manager, HR or an Admin adds the role definition.'
          }
          action={permissions.canCreate ? { label: 'Create role definition', onClick: () => setEditor({ mode: 'create' }) } : undefined}
        />
        {editorNode}
      </div>
    )
  }

  const isCurrent = shown.id === data.current?.id
  const reportingLine = isCurrent ? data.reportingLine : checkReportingLine(shown.reportsToId, data.reportingLine.orgChartManagers)
  const seats = isCurrent ? data.seats : resolveDirectReportSeats(shown.items, [])
  const groups = groupItemsBySection(shown.items).filter((g) => g.section !== 'DIRECT_REPORT_SEAT')
  const hasNewerDraft = !!data.pendingDraft && data.pendingDraft.id !== shown.id

  const actions: ActionsMenuItem[] = [
    {
      key: 'new-version',
      label: 'Start a new version',
      icon: FilePlus2,
      hidden: !permissions.canCreate || shown.status === 'DRAFT' || hasDraftInSelectedTimeframe(data),
      onSelect: () => setEditor({ mode: 'newVersion', basedOn: shown }),
    },
    {
      key: 'correct',
      label: 'Correct this version',
      icon: Pencil,
      hidden: !permissions.canEdit || shown.status !== 'APPROVED',
      onSelect: () => setEditor({ mode: 'edit', definition: shown }),
    },
    {
      key: 'delete',
      label: 'Delete draft',
      icon: Trash2,
      destructive: true,
      divider: true,
      hidden: !permissions.canDelete || shown.status !== 'DRAFT',
      onSelect: () => setDeleteTarget(shown),
    },
  ]
  const hasMenu = actions.some((a) => !a.hidden)

  const effective = formatDate(shown.effectiveFrom)
  const approvedAt = formatDate(shown.approvedAt)

  return (
    <div className={cn('space-y-4', className)}>
      {hasNewerDraft && data.pendingDraft && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-[var(--ap-border)] bg-[var(--ap-warn-bg)] px-4 py-2.5">
          <p className="min-w-0 flex-1 text-body-sm text-[var(--ap-warn-fg)]">
            A new version (“{data.pendingDraft.seatTitle}”) is waiting for approval.
          </p>
          <Button size="sm" variant="outline" onClick={() => setViewingId(data.pendingDraft!.id)}>
            View draft
          </Button>
        </div>
      )}

      <article className={cn(cardClass, 'p-5')} aria-labelledby="role-definition-title">
        <header className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <RoleDefinitionStatusBadge status={shown.status} />
              {shown.timeframeName && <span className="text-caption text-[var(--ap-fg-subtle)]">{shown.timeframeName}</span>}
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => setViewingId(null)}
                  className="text-caption font-medium text-[var(--ap-accent)] hover:underline ap-focus-ring rounded"
                >
                  Back to current version
                </button>
              )}
            </div>
            <h2 id="role-definition-title" className="mt-1.5 text-section-title font-semibold text-[var(--ap-fg)]">
              {shown.seatTitle}
            </h2>
            <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-body-sm text-[var(--ap-fg-muted)]">
              {(shown.reportsTo || shown.reportsToText) && (
                <div className="flex min-w-0 items-center gap-1.5">
                  <dt>Reports to</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    {shown.reportsTo ? (
                      <PersonInline person={shown.reportsTo} />
                    ) : (
                      <span className="font-medium text-[var(--ap-fg)]">{shown.reportsToText}</span>
                    )}
                    {shown.reportsTo && shown.reportsToText && (
                      <span className="text-caption text-[var(--ap-fg-subtle)]">({shown.reportsToText})</span>
                    )}
                  </dd>
                </div>
              )}
              {effective && (
                <div className="flex items-center gap-1.5">
                  <dt>Effective</dt>
                  <dd className="font-medium text-[var(--ap-fg)]">{effective}</dd>
                </div>
              )}
              {shown.status !== 'DRAFT' && approvedAt && (
                <div className="flex items-center gap-1.5">
                  <dt>Approved</dt>
                  <dd className="font-medium text-[var(--ap-fg)]">
                    {approvedAt}
                    {shown.approvedBy ? ` by ${shown.approvedBy.name}` : ''}
                  </dd>
                </div>
              )}
            </dl>
            <ReportingLineChip check={reportingLine} className="mt-2" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {shown.status === 'DRAFT' && permissions.canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditor({ mode: 'edit', definition: shown })}>
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
            {shown.status === 'DRAFT' && permissions.canApprove && (
              <Button size="sm" onClick={() => setApproveTarget(shown)}>
                <BadgeCheck aria-hidden />
                Approve
              </Button>
            )}
            {hasMenu && <ActionsMenu items={actions} label="Role definition actions" />}
          </div>
        </header>

        <section className="mt-5" aria-label="Purpose">
          <SectionHeading title="Purpose" as="h3" />
          <p className="mt-2 whitespace-pre-line text-body text-[var(--ap-fg)]">{shown.purpose}</p>
        </section>

        {groups.map((group) => (
          <section key={group.section} className="mt-5" aria-label={ROLE_ITEM_SECTION_LABELS[group.section]}>
            <SectionHeading
              title={ROLE_ITEM_SECTION_LABELS[group.section]}
              as="h3"
              right={<span className="text-caption tabular-nums text-[var(--ap-fg-subtle)]">{group.items.length}</span>}
            />
            <ol className="mt-1 divide-y divide-[var(--ap-border)]">
              {group.items.map((item, index) => (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 w-5 shrink-0 text-right text-caption tabular-nums text-[var(--ap-fg-subtle)]">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1 text-body-sm text-[var(--ap-fg)]">
                    {item.label && <span className="font-semibold">{item.label}: </span>}
                    <span className="whitespace-pre-line">{item.text}</span>
                  </div>
                  {renderItemActions?.(item, shown)}
                </li>
              ))}
            </ol>
          </section>
        ))}

        {seats.length > 0 && (
          <section className="mt-5" aria-label="Direct-report seats">
            <SectionHeading
              title={ROLE_ITEM_SECTION_LABELS.DIRECT_REPORT_SEAT}
              as="h3"
              right={
                isCurrent ? (
                  <span className="text-caption tabular-nums text-[var(--ap-fg-subtle)]">
                    {seats.filter((s) => s.filledBy).length} of {seats.length} filled
                  </span>
                ) : undefined
              }
            />
            <DirectReportSeatList
              seats={seats}
              showFill={isCurrent}
              renderActions={
                renderItemActions
                  ? (itemId) => {
                      const item = shown.items.find((i) => i.id === itemId)
                      return item ? renderItemActions(item, shown) : null
                    }
                  : undefined
              }
            />
          </section>
        )}

        {shown.items.length === 0 && (
          <p className="mt-5 text-body-sm text-[var(--ap-fg-subtle)]">No accountabilities or seats recorded yet.</p>
        )}
      </article>

      <VersionHistory
        data={data}
        open={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
        shownId={shown.id}
        onSelect={(id) => setViewingId(id === data.current?.id ? null : id)}
      />

      {editorNode}
      <ApproveRoleDefinitionDialog
        definition={approveTarget}
        currentDesignation={data.subjectDesignation}
        onClose={() => setApproveTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleteMutation.isPending && setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteMutation.mutateAsync(deleteTarget.id)
            setDeleteTarget(null)
            setViewingId(null)
          } catch {
            // Toast shown by the hook.
          }
        }}
        title="Delete draft"
        message={`Delete the draft “${deleteTarget?.seatTitle ?? ''}”?`}
        description="Approved and superseded versions are not affected."
        confirmLabel="Delete draft"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}

/** New versions are created in the selected timeframe, which allows one DRAFT at a time. */
function hasDraftInSelectedTimeframe(data: RoleDefinitionListResponse): boolean {
  return data.history.some((v) => v.status === 'DRAFT' && v.timeframeId === data.timeframeId)
}

function VersionHistory({
  data,
  open,
  onToggle,
  shownId,
  onSelect,
}: {
  data: RoleDefinitionListResponse
  open: boolean
  onToggle: () => void
  shownId: string
  onSelect: (id: string) => void
}) {
  if (data.history.length <= 1) return null
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <section className={cn(cardClass, 'px-5 py-3')} aria-label="Version history">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded text-left ap-focus-ring"
      >
        <History className="size-4 text-[var(--ap-fg-subtle)]" aria-hidden />
        <span className="flex-1 text-body-sm font-semibold text-[var(--ap-fg)]">Version history</span>
        <span className="text-caption tabular-nums text-[var(--ap-fg-subtle)]">{data.history.length} versions</span>
        <Chevron className="size-4 text-[var(--ap-fg-subtle)]" aria-hidden />
      </button>
      {open && (
        <ol className="mt-2 divide-y divide-[var(--ap-border)]">
          {data.history.map((version) => {
            const selected = version.id === shownId
            const created = formatDate(version.createdAt)
            const approved = formatDate(version.approvedAt)
            return (
              <li key={version.id}>
                <button
                  type="button"
                  onClick={() => onSelect(version.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded px-1 py-2 text-left ap-focus-ring transition-colors ease-apple',
                    selected ? 'bg-[var(--ap-accent-soft)]' : 'hover:bg-[var(--ap-bg-sunken)]',
                  )}
                >
                  <RoleDefinitionStatusBadge status={version.status} />
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-[var(--ap-fg)]">{version.seatTitle}</span>
                  <span className="text-caption text-[var(--ap-fg-subtle)]">
                    {version.timeframeName ?? 'No timeframe'}
                    {approved ? ` · approved ${approved}` : created ? ` · created ${created}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
