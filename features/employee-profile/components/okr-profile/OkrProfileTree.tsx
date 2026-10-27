'use client'

/**
 * PRF-8 tree: Objective → KR → Initiatives (Todo kind=INITIATIVE, v2 workbook:
 * C/A, target, due, status, with the milestones that name them nested below),
 * Milestones (Todo kind=MILESTONE, with due date, status and checklist steps)
 * and Tasks (with sprint), plus a collapsed
 * "Recurring: n" row of the duties linked to each KR. Every node carries the
 * CON-1 connection chips, fetched lazily as the row scrolls into view.
 * PRF-11 actions come from the payload's per-node verdicts.
 */
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCheck,
  CheckSquare,
  Circle,
  ExternalLink,
  Eye,
  Flag,
  Gauge,
  Layers,
  Link2,
  ListChecks,
  Lock,
  Plus,
  Repeat,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ui/ActionsMenu'
import { Button } from '@/components/ui/button'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import StatusPill from '@/components/shared/StatusPill'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { ConnectionChips, type ConnectionChipKind } from '@/components/shared/connections'
import type { ConnectionEntityType } from '@/lib/connections/types'
import { cn } from '@/lib/utils'
import { DUTY_CADENCE_LABELS, TODO_KIND_LABELS, isDutyCadence } from '@/types/package'
import {
  CheckpointChip,
  CommitmentPill,
  ExpandToggle,
  GroupLabel,
  LevelBadge,
  NodeTitle,
  ProgressCell,
  TreeChildren,
  formatDay,
  formatRelativeDay,
  isOverdue,
} from './OkrProfileParts'
import { useInViewOnce } from './useInView'
import type { ProfileInitiativeKind } from './schemas'
import { keyResultTodos } from './okr-profile-utils'
import type {
  OkrProfileDuty,
  OkrProfileInitiativeGroup,
  OkrProfileKeyResult,
  OkrProfileObjective,
  OkrProfileTodo,
} from './types'

// ---------------------------------------------------------------------------
// Action contract
// ---------------------------------------------------------------------------

export type OkrQuickViewTarget =
  | { type: 'OBJECTIVE'; objective: OkrProfileObjective }
  | { type: 'KEY_RESULT'; keyResult: OkrProfileKeyResult; objective: OkrProfileObjective }

export interface OkrCloseTarget {
  entityType: 'objective' | 'keyResult'
  entity: {
    id: string
    progress: number
    closureStatus: string
    outcome: string | null
    finalGrade: number | null
    closureNote: string | null
  }
}

export interface OkrTreeActions {
  onQuickView: (target: OkrQuickViewTarget) => void
  onCheckIn: (keyResult: OkrProfileKeyResult) => void
  onClose: (target: OkrCloseTarget) => void
  onAddInitiative: (keyResult: OkrProfileKeyResult, kind: ProfileInitiativeKind) => void
  onOpenTodo: (todoId: string) => void
  /** Client-side navigation to a detail page. */
  onNavigate: (href: string) => void
  /**
   * Per-node slot injected by the profile shell, e.g. the package review
   * Agree / Dispute controls (PKG-2) on objectives, KRs and KR milestones.
   */
  renderItemActions?: (item: OkrProfileItemRef) => ReactNode
}

/** A tree node that can carry injected per-item actions. */
export interface OkrProfileItemRef {
  entityType: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO'
  id: string
}

const OBJECTIVE_CHIPS_HIDE: readonly ConnectionChipKind[] = ['supportedBy']
const KR_CHIPS_HIDE: readonly ConnectionChipKind[] = ['duties']

/** Chips that only fetch once the row is near the viewport. */
function LazyChips({
  entityType,
  entityId,
  hide,
}: {
  entityType: ConnectionEntityType
  entityId: string
  hide?: readonly ConnectionChipKind[]
}) {
  const { ref, seen } = useInViewOnce<HTMLSpanElement>()
  return (
    <span ref={ref} className="inline-flex min-h-5 min-w-[1px] items-center">
      <ConnectionChips entityType={entityType} entityId={entityId} compact hide={hide} enabled={seen} max={6} />
    </span>
  )
}

function closeLabel(closureStatus: string, noun: string): string {
  return closureStatus === 'CLOSING' ? `Continue closing ${noun}` : `Close ${noun}`
}

// ---------------------------------------------------------------------------
// Todo (initiative / milestone / task)
// ---------------------------------------------------------------------------

const TODO_ICON: Record<string, LucideIcon> = {
  INITIATIVE: Layers,
  MILESTONE: Flag,
  TASK: CheckSquare,
  DEPENDENCY: Link2,
}

const TODO_ICON_COLOR: Record<string, string> = {
  INITIATIVE: 'var(--ap-accent)',
  MILESTONE: 'var(--ap-ahead)',
}

function TodoNode({
  todo,
  onOpen,
  now,
  extra,
  childToggle,
}: {
  todo: OkrProfileTodo
  onOpen: (id: string) => void
  now: Date
  extra?: ReactNode
  /** Initiatives: the toggle expands nested milestones instead of checklist steps. */
  childToggle?: { expanded: boolean; onToggle: () => void; count: number }
}) {
  const [showSteps, setShowSteps] = useState(false)
  const Icon = TODO_ICON[todo.kind] ?? CheckSquare
  const overdue = isOverdue(todo.dueDate, todo.status, now)
  const doneSteps = todo.steps.filter((s) => s.completed).length
  const kindLabel = TODO_KIND_LABELS[todo.kind] ?? 'Task'
  const meta = todo.initiative

  return (
    <div className="rounded-[var(--ap-radius-sm)] px-1.5 py-1 hover:bg-[var(--ap-bg-hover)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {childToggle ? (
          <ExpandToggle
            expanded={childToggle.expanded}
            onToggle={childToggle.onToggle}
            label={`${todo.title} milestones`}
            disabled={childToggle.count === 0}
          />
        ) : (
          <ExpandToggle
            expanded={showSteps}
            onToggle={() => setShowSteps((v) => !v)}
            label={`${todo.title} steps`}
            disabled={todo.steps.length === 0}
          />
        )}
        <Icon
          className="size-3.5 shrink-0"
          style={{ color: TODO_ICON_COLOR[todo.kind] ?? 'var(--ap-fg-subtle)' }}
          aria-label={kindLabel}
        />
        <button
          type="button"
          onClick={() => onOpen(todo.id)}
          className={cn(
            'min-w-0 max-w-full truncate rounded-[var(--ap-radius-xs)] text-left text-body-sm ap-focus-ring hover:text-[var(--ap-accent)] hover:underline',
            todo.status === 'COMPLETED' ? 'text-[var(--ap-fg-muted)] line-through' : 'text-[var(--ap-fg)]',
          )}
          title={`Open #${todo.cardNumber} ${todo.title}`}
        >
          {todo.kind === 'INITIATIVE' && todo.externalRef ? (
            <span className="mr-1 font-mono text-caption text-[var(--ap-fg-subtle)]">{todo.externalRef}</span>
          ) : (
            <span className="mr-1 font-mono text-caption text-[var(--ap-fg-subtle)]">#{todo.cardNumber}</span>
          )}
          {todo.title}
        </button>
        {meta && <CommitmentPill commitment={meta.commitment} />}
        <StatusPill status={todo.status} size="xs" />
        {meta?.target && (
          <span className="max-w-[240px] truncate text-caption text-[var(--ap-fg-muted)]" title={`Target: ${meta.target}`}>
            Target {meta.target}
          </span>
        )}
        {todo.dueDate && (
          <span
            className="text-caption tabular-nums"
            style={{ color: overdue ? 'var(--ap-danger-fg)' : 'var(--ap-fg-muted)' }}
            title={overdue ? 'Overdue' : 'Due date'}
          >
            {overdue ? 'Overdue · ' : 'Due '}
            {formatDay(todo.dueDate)}
          </span>
        )}
        {todo.sprint && (
          <MiniBadge tone="accent" title="Sprint">
            {todo.sprint.name}
          </MiniBadge>
        )}
        {meta?.supports && !childToggle && (
          <span className="max-w-[200px] truncate text-caption text-[var(--ap-fg-subtle)]" title={`Supports: ${meta.supports}`}>
            Supports {meta.supports}
          </span>
        )}
        {childToggle && childToggle.count > 0 && !childToggle.expanded && (
          <span className="text-caption text-[var(--ap-fg-subtle)]">
            {childToggle.count} milestone{childToggle.count === 1 ? '' : 's'}
          </span>
        )}
        {todo.steps.length > 0 && (
          <span className="inline-flex items-center gap-1 text-caption text-[var(--ap-fg-muted)]">
            <ListChecks className="size-3" aria-hidden />
            {doneSteps}/{todo.steps.length} steps
          </span>
        )}
        {todo.assignee && <UserAvatar user={{ ...todo.assignee, name: todo.assignee.name ?? 'Unknown' }} size={18} tooltipDetail="Assignee" />}
        <LazyChips entityType="TODO" entityId={todo.id} />
        {extra ? <span className="ml-auto flex shrink-0 items-center">{extra}</span> : null}
      </div>
      {showSteps && todo.steps.length > 0 && (
        <TreeChildren className="mt-1">
          <ul className="space-y-0.5 py-0.5" aria-label={`${todo.title} steps`}>
            {todo.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-caption">
                {step.completed ? (
                  <CheckCheck className="size-3 shrink-0 text-[var(--ap-ok)]" aria-label="Done" />
                ) : (
                  <Circle className="size-3 shrink-0 text-[var(--ap-fg-subtle)]" aria-label="Open" />
                )}
                <span className={cn('min-w-0 truncate', step.completed ? 'text-[var(--ap-fg-muted)] line-through' : 'text-[var(--ap-fg)]')}>
                  {step.title}
                </span>
                {step.dueDate && <span className="text-[var(--ap-fg-subtle)]">{formatDay(step.dueDate)}</span>}
              </li>
            ))}
          </ul>
        </TreeChildren>
      )}
    </div>
  )
}

/** An initiative and the milestones that name it ("Initiative: <ref> — …"). */
function InitiativeNode({
  group,
  actions,
  now,
}: {
  group: OkrProfileInitiativeGroup
  actions: OkrTreeActions
  now: Date
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <TodoNode
        todo={group.initiative}
        onOpen={actions.onOpenTodo}
        now={now}
        childToggle={{ expanded: open, onToggle: () => setOpen((v) => !v), count: group.milestones.length }}
      />
      {open && group.milestones.length > 0 && (
        <TreeChildren className="mb-0.5">
          {group.milestones.map((t) => (
            <TodoNode
              key={t.id}
              todo={t}
              onOpen={actions.onOpenTodo}
              now={now}
              extra={actions.renderItemActions?.({ entityType: 'TODO', id: t.id })}
            />
          ))}
        </TreeChildren>
      )}
    </div>
  )
}

/**
 * "Supporting KPIs": the person's initiatives that support a KPI rather than a
 * key result (kind INITIATIVE, no KR). Rendered at the bottom of the tree.
 */
export function SupportingInitiativesSection({
  initiatives,
  actions,
  now,
}: {
  initiatives: OkrProfileTodo[]
  actions: OkrTreeActions
  now: Date
}) {
  if (initiatives.length === 0) return null
  return (
    <section
      aria-label="Supporting KPIs"
      className="rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 shadow-card"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 px-1.5 py-1">
        <h3 className="text-body-sm font-semibold text-[var(--ap-fg)]">Supporting KPIs</h3>
        <span className="text-caption text-[var(--ap-fg-subtle)]">
          Initiatives that support a KPI rather than a key result
        </span>
      </div>
      <div className="mt-0.5">
        {initiatives.map((t) => (
          <TodoNode key={t.id} todo={t} onOpen={actions.onOpenTodo} now={now} />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Duties ("Recurring: n")
// ---------------------------------------------------------------------------

function DutyRows({ duties, subjectId }: { duties: OkrProfileDuty[]; subjectId: string }) {
  const [open, setOpen] = useState(false)
  if (duties.length === 0) return null
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-2">
        <ExpandToggle expanded={open} onToggle={() => setOpen((v) => !v)} label="recurring duties" />
        <Repeat className="size-3.5 shrink-0 text-[var(--ap-fg-subtle)]" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-[var(--ap-radius-xs)] text-body-sm font-medium text-[var(--ap-fg-muted)] ap-focus-ring hover:text-[var(--ap-fg)]"
        >
          Recurring: {duties.length}
        </button>
      </div>
      {open && (
        <TreeChildren className="mt-1">
          {duties.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
              <Link
                href={d.href}
                className="min-w-0 truncate rounded-[var(--ap-radius-xs)] text-body-sm text-[var(--ap-fg)] ap-focus-ring hover:text-[var(--ap-accent)] hover:underline"
              >
                {d.ref && <span className="mr-1 font-mono text-caption text-[var(--ap-fg-subtle)]">{d.ref}</span>}
                {d.title}
              </Link>
              <MiniBadge>{isDutyCadence(d.cadence) ? DUTY_CADENCE_LABELS[d.cadence] : d.cadence}</MiniBadge>
              {d.timingText && <span className="text-caption text-[var(--ap-fg-muted)]">{d.timingText}</span>}
              {d.status === 'PAUSED' && <MiniBadge tone="warn">Paused</MiniBadge>}
              {d.owner.id !== subjectId && (
                <UserAvatar user={{ ...d.owner, name: d.owner.name ?? 'Unknown' }} size={18} tooltipDetail="Duty owner" />
              )}
              <LazyChips entityType="DUTY" entityId={d.id} />
            </div>
          ))}
        </TreeChildren>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Key result
// ---------------------------------------------------------------------------

interface KeyResultNodeProps {
  keyResult: OkrProfileKeyResult
  objective: OkrProfileObjective
  subjectId: string
  expanded: boolean
  onToggle: () => void
  actions: OkrTreeActions
  now: Date
}

function KeyResultNode({ keyResult: kr, objective, subjectId, expanded, onToggle, actions, now }: KeyResultNodeProps) {
  const todoCount = keyResultTodos(kr).length
  const childCount = todoCount + (kr.duties.length > 0 ? 1 : 0)
  const milestoneCount = kr.milestones.length + kr.initiatives.reduce((n, g) => n + g.milestones.length, 0)
  const counts = [
    kr.initiatives.length ? `${kr.initiatives.length} initiative${kr.initiatives.length === 1 ? '' : 's'}` : null,
    milestoneCount ? `${milestoneCount} milestone${milestoneCount === 1 ? '' : 's'}` : null,
    kr.tasks.length ? `${kr.tasks.length} task${kr.tasks.length === 1 ? '' : 's'}` : null,
    kr.duties.length ? `${kr.duties.length} recurring` : null,
  ].filter(Boolean)

  const menu: ActionsMenuItem[] = [
    {
      key: 'quick',
      label: 'Quick view',
      icon: Eye,
      onSelect: () => actions.onQuickView({ type: 'KEY_RESULT', keyResult: kr, objective }),
      hidden: kr.redacted,
    },
    {
      key: 'open',
      label: 'Open key result',
      icon: ExternalLink,
      onSelect: () => actions.onNavigate(`/dashboard/key-results/${encodeURIComponent(kr.id)}`),
      hidden: kr.redacted,
    },
    { key: 'd1', label: '', onSelect: () => undefined, divider: true, hidden: !kr.actions.canAddInitiative },
    {
      key: 'milestone',
      label: 'Add milestone',
      icon: Flag,
      onSelect: () => actions.onAddInitiative(kr, 'MILESTONE'),
      hidden: !kr.actions.canAddInitiative,
    },
    {
      key: 'task',
      label: 'Add task',
      icon: CheckSquare,
      onSelect: () => actions.onAddInitiative(kr, 'TASK'),
      hidden: !kr.actions.canAddInitiative,
    },
    { key: 'd2', label: '', onSelect: () => undefined, divider: true, hidden: !kr.actions.canClose },
    {
      key: 'close',
      label: closeLabel(kr.closureStatus, 'key result'),
      icon: Lock,
      onSelect: () =>
        actions.onClose({
          entityType: 'keyResult',
          entity: {
            id: kr.id,
            progress: kr.progress,
            closureStatus: kr.closureStatus,
            outcome: kr.outcome,
            finalGrade: kr.finalGrade,
            closureNote: kr.closureNote,
          },
        }),
      hidden: !kr.actions.canClose,
    },
  ]
  const hasMenu = menu.some((m) => !m.hidden && !m.divider)

  return (
    <div>
      <div className="rounded-[var(--ap-radius-sm)] px-1.5 py-1.5 hover:bg-[var(--ap-bg-hover)]">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
          <ExpandToggle expanded={expanded} onToggle={onToggle} label="key result" disabled={childCount === 0 && !kr.actions.canAddInitiative} />
          <Gauge className="mt-0.5 size-3.5 shrink-0 text-[var(--ap-fg-subtle)]" aria-label="Key result" />
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <NodeTitle
                href={`/dashboard/key-results/${encodeURIComponent(kr.id)}`}
                title={kr.title}
                refText={kr.ref}
                redacted={kr.redacted}
                privateLabel="Private key result"
              />
              <CommitmentPill commitment={kr.commitment} />
              {kr.closureStatus === 'CLOSING' && <MiniBadge tone="warn">Closing</MiniBadge>}
              {kr.owner && kr.owner.id !== subjectId && (
                <UserAvatar user={{ ...kr.owner, name: kr.owner.name ?? 'Unknown' }} size={18} tooltipDetail="KR owner" />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <CheckpointChip checkpoint={kr.nextCheckpoint} now={now} />
              {!kr.redacted && kr.currentValue !== null && kr.targetValue !== null && (
                <span className="font-mono text-caption tabular-nums text-[var(--ap-fg-muted)]">
                  {kr.currentValue} / {kr.targetValue}
                  {kr.unit ? ` ${kr.unit}` : ''}
                </span>
              )}
              {kr.lastCheckInAt && (
                <span className="text-caption text-[var(--ap-fg-subtle)]" title="Last check-in">
                  Checked in {formatRelativeDay(kr.lastCheckInAt, now)?.toLowerCase()}
                </span>
              )}
              {counts.length > 0 && !expanded && (
                <span className="text-caption text-[var(--ap-fg-subtle)]">{counts.join(' · ')}</span>
              )}
              {!kr.redacted && <LazyChips entityType="KEY_RESULT" entityId={kr.id} hide={KR_CHIPS_HIDE} />}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <StatusPill status={kr.closureStatus === 'CLOSED' ? 'CLOSED' : kr.confidence} size="xs" />
            <ProgressCell value={kr.progress} />
            {kr.actions.canCheckIn && (
              <Button size="xs" variant="outline" onClick={() => actions.onCheckIn(kr)}>
                Check in
              </Button>
            )}
            {actions.renderItemActions?.({ entityType: 'KEY_RESULT', id: kr.id })}
            {hasMenu ? <ActionsMenu items={menu} className="size-7" label="Key result actions" /> : <span className="size-7" aria-hidden />}
          </div>
        </div>
      </div>

      {expanded && (
        <TreeChildren className="mb-1">
          {kr.initiatives.length > 0 && (
            <>
              <GroupLabel>Initiatives</GroupLabel>
              {kr.initiatives.map((g) => (
                <InitiativeNode key={g.initiative.id} group={g} actions={actions} now={now} />
              ))}
            </>
          )}
          {kr.milestones.length > 0 && (
            <>
              <GroupLabel>{kr.initiatives.length > 0 ? 'Other milestones' : 'Milestones'}</GroupLabel>
              {kr.milestones.map((t) => (
                <TodoNode
                  key={t.id}
                  todo={t}
                  onOpen={actions.onOpenTodo}
                  now={now}
                  extra={actions.renderItemActions?.({ entityType: 'TODO', id: t.id })}
                />
              ))}
            </>
          )}
          {kr.tasks.length > 0 && (
            <>
              <GroupLabel>Tasks</GroupLabel>
              {kr.tasks.map((t) => (
                <TodoNode key={t.id} todo={t} onOpen={actions.onOpenTodo} now={now} />
              ))}
            </>
          )}
          <DutyRows duties={kr.duties} subjectId={subjectId} />
          {todoCount === 0 && (
            <p className="px-1.5 py-1 text-caption text-[var(--ap-fg-subtle)]">
              No milestones or tasks yet. A milestone is a dated deliverable proving progress on this KR; tasks are
              the steps planned in sprints.
            </p>
          )}
          {kr.actions.canAddInitiative && (
            <div className="flex flex-wrap gap-1.5 px-1.5 py-1">
              <Button size="xs" variant="ghost" onClick={() => actions.onAddInitiative(kr, 'MILESTONE')}>
                <Plus aria-hidden />
                Milestone
              </Button>
              <Button size="xs" variant="ghost" onClick={() => actions.onAddInitiative(kr, 'TASK')}>
                <Plus aria-hidden />
                Task
              </Button>
            </div>
          )}
        </TreeChildren>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Objective
// ---------------------------------------------------------------------------

interface ObjectiveNodeProps {
  objective: OkrProfileObjective
  subjectId: string
  collapsed: boolean
  onToggle: () => void
  isKrExpanded: (id: string) => boolean
  onToggleKr: (id: string) => void
  actions: OkrTreeActions
  now: Date
}

export function ObjectiveNode({
  objective: o,
  subjectId,
  collapsed,
  onToggle,
  isKrExpanded,
  onToggleKr,
  actions,
  now,
}: ObjectiveNodeProps) {
  const closeBlocked = o.actions.canClose && o.closureStatus === 'OPEN' && o.actions.openKeyResults > 0
  const menu: ActionsMenuItem[] = [
    {
      key: 'quick',
      label: 'Quick view',
      icon: Eye,
      onSelect: () => actions.onQuickView({ type: 'OBJECTIVE', objective: o }),
      hidden: o.redacted,
    },
    {
      key: 'open',
      label: 'Open objective',
      icon: ExternalLink,
      onSelect: () => actions.onNavigate(`/dashboard/objectives/${encodeURIComponent(o.id)}`),
      hidden: o.redacted,
    },
    { key: 'd1', label: '', onSelect: () => undefined, divider: true, hidden: !o.actions.canClose },
    {
      key: 'close',
      label: closeBlocked
        ? `Close objective (close ${o.actions.openKeyResults} KR${o.actions.openKeyResults === 1 ? '' : 's'} first)`
        : closeLabel(o.closureStatus, 'objective'),
      icon: Lock,
      disabled: closeBlocked,
      onSelect: () =>
        actions.onClose({
          entityType: 'objective',
          entity: {
            id: o.id,
            progress: o.progress,
            closureStatus: o.closureStatus,
            outcome: o.outcome,
            finalGrade: o.finalGrade,
            closureNote: o.closureNote,
          },
        }),
      hidden: !o.actions.canClose,
    },
  ]
  const hasMenu = menu.some((m) => !m.hidden && !m.divider)

  return (
    <li className="rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 shadow-card">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5 px-1.5 py-1">
        <ExpandToggle expanded={!collapsed} onToggle={onToggle} label="objective" />
        <Target className="mt-0.5 size-4 shrink-0 text-[var(--ap-accent)]" aria-label="Objective" />
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <NodeTitle
              href={`/dashboard/objectives/${encodeURIComponent(o.id)}`}
              title={o.title}
              refText={o.ref}
              redacted={o.redacted}
              privateLabel="Private objective"
              strong
            />
            <LevelBadge bucket={o.levelBucket} />
            {o.isLocked && (
              <span title="Closed and locked" aria-label="Closed and locked">
                <Lock className="size-3.5 text-[var(--ap-fg-subtle)]" aria-hidden />
              </span>
            )}
            {o.closureStatus === 'CLOSING' && <MiniBadge tone="warn">Closing</MiniBadge>}
            {o.owner && o.owner.id !== subjectId && (
              <UserAvatar user={{ ...o.owner, name: o.owner.name ?? 'Unknown' }} size={18} tooltipDetail="Objective owner" />
            )}
          </div>
          {!o.redacted && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <LazyChips entityType="OBJECTIVE" entityId={o.id} hide={OBJECTIVE_CHIPS_HIDE} />
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <StatusPill status={o.closureStatus === 'CLOSED' ? 'CLOSED' : o.goalStatus} size="xs" />
          <ProgressCell value={o.progress} />
          {actions.renderItemActions?.({ entityType: 'OBJECTIVE', id: o.id })}
          {hasMenu ? <ActionsMenu items={menu} className="size-7" label="Objective actions" /> : <span className="size-7" aria-hidden />}
        </div>
      </div>

      {!collapsed && (o.keyResults.length > 0 || o.initiatives.length > 0) && (
        <TreeChildren className="ml-[15px] mt-1">
          {o.keyResults.map((kr) => (
            <KeyResultNode
              key={kr.id}
              keyResult={kr}
              objective={o}
              subjectId={subjectId}
              expanded={isKrExpanded(kr.id)}
              onToggle={() => onToggleKr(kr.id)}
              actions={actions}
              now={now}
            />
          ))}
          {o.initiatives.length > 0 && (
            <>
              <GroupLabel>Initiatives on the objective</GroupLabel>
              {o.initiatives.map((t) => (
                <TodoNode key={t.id} todo={t} onOpen={actions.onOpenTodo} now={now} />
              ))}
            </>
          )}
        </TreeChildren>
      )}
      {!collapsed && o.keyResults.length === 0 && o.initiatives.length === 0 && (
        <p className="px-9 pb-1 text-caption text-[var(--ap-fg-subtle)]">No key results match.</p>
      )}
    </li>
  )
}
