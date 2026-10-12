'use client'

/**
 * DecisionRow: one decision in a list (awaiting queue, profile tab, decisions
 * page), expandable to show options, what it unblocks, the recorded decision
 * and every link. Actions come from the decision's own `access` flags, and
 * `useDecisionActionDialogs` hosts the modals they open.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Gavel, Pencil, PauseCircle, RotateCcw, Undo2 } from 'lucide-react'
import { ActionsMenu, type ActionsMenuItem } from '@/components/ui/ActionsMenu'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MiniBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useUpdateDecision } from '../hooks/queries'
import { requesterLabel } from '../services/rules'
import type { DecisionDTO } from '../types'
import {
  DecisionLinkChips,
  DecisionOverdueChip,
  DecisionPersonInline,
  DecisionStatusBadge,
  DecisionTextBlock,
  RELATION_LABEL,
  formatDecisionDate,
} from './DecisionBits'
import { DecideModal } from './DecideModal'
import { DecisionFormModal } from './DecisionFormModal'

export type DecisionAction = 'decide' | 'change' | 'edit' | 'defer' | 'reopen' | 'withdraw'

/** Which actions the viewer has on this decision (from its `access` flags). */
export function decisionActionsFor(decision: DecisionDTO): Record<DecisionAction, boolean> {
  const { access, status } = decision
  return {
    decide: access.canDecide && (status === 'OPEN' || status === 'DEFERRED'),
    change: access.canDecide && status === 'DECIDED',
    edit: access.canEdit,
    defer: access.canDecide && status === 'OPEN',
    reopen:
      (access.canDecide && (status === 'DEFERRED' || status === 'DECIDED' || status === 'WITHDRAWN')) ||
      (access.canWithdraw && status === 'WITHDRAWN'),
    withdraw: access.canWithdraw,
  }
}

type PendingConfirm = { action: 'defer' | 'reopen' | 'withdraw'; decision: DecisionDTO } | null

/**
 * Hosts the decide / edit modals and the status confirmations for a list.
 * Returns `run(action, decision)` and the dialogs node to render once.
 */
export function useDecisionActionDialogs(opts: { defaultDeciderId?: string | null } = {}) {
  const [decideTarget, setDecideTarget] = useState<DecisionDTO | null>(null)
  const [editTarget, setEditTarget] = useState<DecisionDTO | null>(null)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const update = useUpdateDecision()

  const run = (action: DecisionAction, decision: DecisionDTO) => {
    if (action === 'decide' || action === 'change') setDecideTarget(decision)
    else if (action === 'edit') setEditTarget(decision)
    else setConfirm({ action, decision })
  }

  const confirmCopy = confirm
    ? confirm.action === 'withdraw'
      ? {
          title: 'Withdraw this request?',
          message: `“${confirm.decision.title}” will no longer wait for a decision. It can be reopened later.`,
          confirmLabel: 'Withdraw',
          variant: 'danger' as const,
          status: 'WITHDRAWN' as const,
        }
      : confirm.action === 'defer'
        ? {
            title: 'Defer this decision?',
            message: `“${confirm.decision.title}” leaves the open queue until it is reopened.`,
            confirmLabel: 'Defer',
            variant: 'warning' as const,
            status: 'DEFERRED' as const,
          }
        : {
            title: 'Reopen this decision?',
            message:
              confirm.decision.status === 'DECIDED'
                ? 'The recorded decision is cleared (the activity log keeps it) and the item waits for a decision again. Dependencies it closed stay done.'
                : 'The item goes back to the decider’s open queue.',
            confirmLabel: 'Reopen',
            variant: 'warning' as const,
            status: 'OPEN' as const,
          }
    : null

  const dialogs: ReactNode = (
    <>
      <DecideModal open={!!decideTarget} decision={decideTarget} onClose={() => setDecideTarget(null)} />
      <DecisionFormModal
        open={!!editTarget}
        decision={editTarget}
        defaultDeciderId={opts.defaultDeciderId}
        onClose={() => setEditTarget(null)}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm || !confirmCopy) return
          try {
            await update.mutateAsync({ id: confirm.decision.id, body: { status: confirmCopy.status } })
            setConfirm(null)
          } catch {
            // Toast shown by the hook.
          }
        }}
        title={confirmCopy?.title ?? ''}
        message={confirmCopy?.message ?? ''}
        confirmLabel={confirmCopy?.confirmLabel}
        variant={confirmCopy?.variant}
        isLoading={update.isPending}
      />
    </>
  )

  return { run, dialogs }
}

export interface DecisionRowProps {
  decision: DecisionDTO
  onAction: (action: DecisionAction, decision: DecisionDTO) => void
  /** Show the "why it is here" chips (profile tab, DEC-3). */
  showRelations?: boolean
  /** Show the decider (hidden in the decider's own queue). */
  showDecider?: boolean
  defaultExpanded?: boolean
  className?: string
}

export function DecisionRow({ decision, onAction, showRelations = false, showDecider = true, defaultExpanded = false, className }: DecisionRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const actions = decisionActionsFor(decision)
  const neededBy = formatDecisionDate(decision.neededBy)
  const decidedAt = formatDecisionDate(decision.decidedAt)
  const requester = requesterLabel(decision)

  const menu: ActionsMenuItem[] = [
    { key: 'change', label: 'Change decision', icon: Gavel, hidden: !actions.change, onSelect: () => onAction('change', decision) },
    { key: 'edit', label: 'Edit request', icon: Pencil, hidden: !actions.edit, onSelect: () => onAction('edit', decision) },
    { key: 'defer', label: 'Defer', icon: PauseCircle, hidden: !actions.defer, onSelect: () => onAction('defer', decision) },
    { key: 'reopen', label: 'Reopen', icon: RotateCcw, hidden: !actions.reopen, onSelect: () => onAction('reopen', decision) },
    {
      key: 'withdraw',
      label: 'Withdraw request',
      icon: Undo2,
      destructive: true,
      divider: true,
      hidden: !actions.withdraw,
      onSelect: () => onAction('withdraw', decision),
    },
  ]
  const hasMenu = menu.some((item) => !item.hidden)
  const detailId = `decision-detail-${decision.id}`

  return (
    <li className={cn('px-4 py-3', className)}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 rounded p-0.5 text-[var(--ap-fg-subtle)] ap-focus-ring hover:text-[var(--ap-fg)]"
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={expanded ? 'Hide details' : 'Show details'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {decision.externalRef && (
              <span className="text-caption font-semibold text-[var(--ap-fg-subtle)]">{decision.externalRef}</span>
            )}
            <button
              type="button"
              className="min-w-0 text-left text-body-sm font-medium text-[var(--ap-fg)] ap-focus-ring hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {decision.title}
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-[var(--ap-fg-subtle)]">
            <DecisionStatusBadge status={decision.status} />
            {decision.overdue && <DecisionOverdueChip />}
            {neededBy && <span>Needed by {neededBy}</span>}
            {decision.status === 'DECIDED' && decidedAt && <span>Decided {decidedAt}</span>}
            {showDecider && decision.decider && (
              <span className="inline-flex items-center gap-1">
                Decider <DecisionPersonInline person={decision.decider} size={16} />
              </span>
            )}
            {requester && <span>Requested by {requester}</span>}
            {decision.timeframeName && <span>{decision.timeframeName}</span>}
          </div>
          {showRelations && decision.relations && decision.relations.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {decision.relations.map((relation) => (
                <MiniBadge key={relation} tone="neutral">
                  {RELATION_LABEL[relation]}
                </MiniBadge>
              ))}
            </div>
          )}
          {decision.status === 'DECIDED' && decision.decisionText && !expanded && (
            <p className="mt-1.5 line-clamp-2 text-body-sm text-[var(--ap-fg)]">{decision.decisionText}</p>
          )}
          {!expanded && <DecisionLinkChips links={decision.links} className="mt-1.5" />}

          {expanded && (
            <div id={detailId} className="mt-3 space-y-3">
              <DecisionTextBlock label="Decision" text={decision.decisionText} />
              {decision.status === 'DECIDED' && decision.decidedBy && (
                <p className="text-caption text-[var(--ap-fg-subtle)]">
                  Recorded by {decision.decidedBy.name}
                  {decidedAt ? ` on ${decidedAt}` : ''}
                </p>
              )}
              <DecisionTextBlock label="Options / recommendation" text={decision.optionsText} />
              <DecisionTextBlock label="Unblocks" text={decision.unblocksText} />
              {decision.batch && (
                <p className="text-caption text-[var(--ap-fg-subtle)]">
                  Batch <span className="font-medium text-[var(--ap-fg)]">{decision.batch}</span>
                </p>
              )}
              {decision.links.length > 0 && (
                <div>
                  <p className="text-caption font-medium uppercase tracking-wide text-[var(--ap-fg-subtle)]">Linked</p>
                  <DecisionLinkChips links={decision.links} max={50} className="mt-1" />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions.decide && (
            <Button size="sm" onClick={() => onAction('decide', decision)}>
              <Gavel aria-hidden />
              Decide
            </Button>
          )}
          {hasMenu && <ActionsMenu items={menu} label={`Actions for ${decision.title}`} />}
        </div>
      </div>
    </li>
  )
}
