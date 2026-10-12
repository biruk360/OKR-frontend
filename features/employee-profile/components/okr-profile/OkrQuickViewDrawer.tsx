'use client'

/**
 * PRF-11 quick view from the OKR profile: a side drawer with the node's facts
 * (owner, status, progress, values, commitment, checkpoint, closure), its
 * connections (CON-2 `ConnectionsPanel`) and the row's actions. Built from the
 * profile payload, so it opens instantly; "Open full page" goes to the detail page.
 */
import Link from 'next/link'
import { ExternalLink, Lock } from 'lucide-react'
import SideDrawer from '@/components/ui/SideDrawer'
import { Button } from '@/components/ui/button'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import StatusPill from '@/components/shared/StatusPill'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { ConnectionsPanel, formatGrade } from '@/components/shared/connections'
import { KR_COMMITMENT_LABELS } from '@/types/package'
import { LEVEL_BUCKET_LABELS, OUTCOME_LABELS, outcomeTone } from './okr-profile-utils'
import { CommitmentPill, ProgressCell, formatDay, formatRelativeDay } from './OkrProfileParts'
import type { OkrCloseTarget, OkrQuickViewTarget } from './OkrProfileTree'
import type { OkrProfileKeyResult, OkrProfilePerson } from './types'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-body-sm">
      <dt className="shrink-0 text-[var(--ap-fg-muted)]">{label}</dt>
      <dd className="min-w-0 text-right text-[var(--ap-fg)]">{children}</dd>
    </div>
  )
}

function Person({ person }: { person: OkrProfilePerson | null }) {
  if (!person) return <span className="text-[var(--ap-fg-subtle)]">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <UserAvatar user={{ ...person, name: person.name ?? 'Unknown' }} size={18} tooltip={false} />
      {person.name ?? 'Unknown'}
    </span>
  )
}

export interface OkrQuickViewDrawerProps {
  target: OkrQuickViewTarget | null
  onClose: () => void
  onCheckIn: (keyResult: OkrProfileKeyResult) => void
  onCloseFlow: (target: OkrCloseTarget) => void
}

export function OkrQuickViewDrawer({ target, onClose, onCheckIn, onCloseFlow }: OkrQuickViewDrawerProps) {
  const isKr = target?.type === 'KEY_RESULT'
  const kr = target?.type === 'KEY_RESULT' ? target.keyResult : null
  const objective = target?.objective ?? null
  const node = kr ?? objective
  const href = kr
    ? `/dashboard/key-results/${encodeURIComponent(kr.id)}`
    : objective
      ? `/dashboard/objectives/${encodeURIComponent(objective.id)}`
      : '#'
  const title = node?.title ?? (isKr ? 'Private key result' : 'Private objective')

  return (
    <SideDrawer open={!!target} onClose={onClose} title={isKr ? 'Key result' : 'Objective'} width="lg">
      {node && objective && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {node.ref && <span className="font-mono text-caption font-semibold text-[var(--ap-fg-subtle)]">{node.ref}</span>}
              {!isKr && <MiniBadge>{LEVEL_BUCKET_LABELS[objective.levelBucket]}</MiniBadge>}
              {kr && <CommitmentPill commitment={kr.commitment} />}
              {node.isLocked && (
                <span className="inline-flex items-center gap-1 text-caption text-[var(--ap-fg-muted)]">
                  <Lock className="size-3" aria-hidden />
                  Locked
                </span>
              )}
            </div>
            <h3 className="text-section-title font-semibold text-[var(--ap-fg)]">{title}</h3>
            {kr && objective.title && (
              <p className="text-caption text-[var(--ap-fg-muted)]">
                Under {objective.ref ? `${objective.ref} · ` : ''}
                {objective.title}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={node.closureStatus === 'CLOSED' ? 'CLOSED' : kr ? kr.confidence : objective.goalStatus} />
            <ProgressCell value={node.progress} className="w-[160px]" />
          </div>

          <dl className="divide-y divide-[var(--ap-border)] rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] px-3">
            <Row label="Owner">
              <Person person={node.owner} />
            </Row>
            {kr && kr.currentValue !== null && kr.targetValue !== null && (
              <Row label="Current / target">
                <span className="font-mono tabular-nums">
                  {kr.currentValue} / {kr.targetValue}
                  {kr.unit ? ` ${kr.unit}` : ''}
                  {kr.direction === 'DECREASE' ? ' (decrease)' : ''}
                </span>
              </Row>
            )}
            {kr?.commitment && (
              <Row label="Commitment">
                {KR_COMMITMENT_LABELS[kr.commitment]}
                {kr.commitment === 'ASPIRATIONAL' ? ' — 70% = success' : ''}
              </Row>
            )}
            {kr?.nextCheckpoint && (
              <Row label="Next checkpoint">
                <span title={kr.nextCheckpoint.targetText}>
                  {kr.nextCheckpoint.label} · {formatDay(kr.nextCheckpoint.dueDate, { year: true })}
                </span>
              </Row>
            )}
            {kr && kr.checkpointCounts.total > 0 && (
              <Row label="Checkpoints">
                {kr.checkpointCounts.met} met · {kr.checkpointCounts.missed} missed · {kr.checkpointCounts.total} total
              </Row>
            )}
            {kr?.lastCheckInAt && <Row label="Last check-in">{formatRelativeDay(kr.lastCheckInAt)}</Row>}
            {node.outcome && (
              <Row label="Outcome">
                <MiniBadge tone={outcomeTone(node.outcome)}>{OUTCOME_LABELS[node.outcome] ?? node.outcome}</MiniBadge>
                {node.finalGrade !== null && <span className="ml-2 font-mono tabular-nums">Grade {formatGrade(node.finalGrade)}</span>}
              </Row>
            )}
            {kr && (
              <Row label="Work">
                {kr.milestones.length} milestones · {kr.tasks.length} tasks · {kr.duties.length} recurring
              </Row>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            {kr?.actions.canCheckIn && (
              <Button size="sm" onClick={() => onCheckIn(kr)}>
                Check in
              </Button>
            )}
            {(kr ? kr.actions.canClose : objective.actions.canClose && objective.actions.openKeyResults === 0) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onCloseFlow({
                    entityType: kr ? 'keyResult' : 'objective',
                    entity: {
                      id: node.id,
                      progress: node.progress,
                      closureStatus: node.closureStatus,
                      outcome: node.outcome,
                      finalGrade: node.finalGrade,
                      closureNote: node.closureNote,
                    },
                  })
                }
              >
                <Lock aria-hidden />
                {node.closureStatus === 'CLOSING' ? 'Continue closing' : 'Close'}
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href={href} onClick={onClose}>
                <ExternalLink aria-hidden />
                Open full page
              </Link>
            </Button>
          </div>

          {!node.redacted && (
            <ConnectionsPanel
              entityType={kr ? 'KEY_RESULT' : 'OBJECTIVE'}
              entityId={node.id}
              variant="rail"
              title="Links & dependencies"
              onNavigate={onClose}
            />
          )}
        </div>
      )}
    </SideDrawer>
  )
}
