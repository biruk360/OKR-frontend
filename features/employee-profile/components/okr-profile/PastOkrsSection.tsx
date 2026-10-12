'use client'

/**
 * PRF-10 Past OKRs (collapsed by default): the person's CLOSED objectives from
 * earlier timeframes with outcome, final grade, a retrospective link and their
 * SUCCEEDS successors ("Carried → C5 · company O4"). Items with no successor
 * show "Retired — no successor" (or "Completed — no successor" when achieved).
 */
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, ChevronDown, ChevronRight, History, Lock } from 'lucide-react'
import { MiniBadge } from '@/components/ui/dashboard/MiniBadge'
import { formatGrade } from '@/components/shared/connections'
import { cn } from '@/lib/utils'
import { DISPOSITION_LABELS, OUTCOME_LABELS, groupSuccessorsByRelation, outcomeTone } from './okr-profile-utils'
import { ExpandToggle, TreeChildren, formatDay } from './OkrProfileParts'
import type { OkrProfileDisposition, OkrProfilePastKeyResult, OkrProfilePastObjective, OkrProfileSuccessor } from './types'

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null
  return <MiniBadge tone={outcomeTone(outcome)}>{OUTCOME_LABELS[outcome] ?? outcome}</MiniBadge>
}

function SuccessorLine({
  successors,
  disposition,
}: {
  successors: OkrProfileSuccessor[]
  disposition: OkrProfileDisposition
}) {
  if (successors.length === 0) {
    return (
      <span
        className={cn(
          'text-caption',
          disposition === 'RETIRED' ? 'text-[var(--ap-fg-muted)] italic' : 'text-[var(--ap-fg-subtle)]',
        )}
      >
        {DISPOSITION_LABELS[disposition]}
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption">
      {groupSuccessorsByRelation(successors).map((group) => (
        <span key={group.relationLabel} className="inline-flex flex-wrap items-center gap-1">
          <span className="font-semibold text-[var(--ap-fg-muted)]">{group.relationLabel}</span>
          <ArrowRight className="size-3 text-[var(--ap-fg-subtle)]" aria-label="to" />
          {group.items.map((s, i) => {
            const { item, label } = s
            return (
              <Fragment key={`${item.type}:${item.id}`}>
                {i > 0 && <span className="text-[var(--ap-fg-subtle)]">·</span>}
                {!item.redacted ? (
                  <Link
                    href={item.href}
                    className="rounded-[var(--ap-radius-xs)] font-medium text-[var(--ap-accent)] ap-focus-ring hover:underline"
                    title={`${item.title}${item.timeframe ? ` (${item.timeframe.name})` : ''}`}
                  >
                    {label}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 italic text-[var(--ap-fg-muted)]">
                    <Lock className="size-3" aria-hidden />
                    {label}
                  </span>
                )}
              </Fragment>
            )
          })}
        </span>
      ))}
    </span>
  )
}

function PastKeyResultRow({ kr }: { kr: OkrProfilePastKeyResult }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 py-1">
      {kr.redacted ? (
        <span className="inline-flex items-center gap-1.5 text-body-sm italic text-[var(--ap-fg-muted)]">
          <Lock className="size-3.5" aria-hidden />
          Private key result
        </span>
      ) : (
        <Link
          href={`/dashboard/key-results/${encodeURIComponent(kr.id)}`}
          className="min-w-0 truncate rounded-[var(--ap-radius-xs)] text-body-sm text-[var(--ap-fg)] ap-focus-ring hover:text-[var(--ap-accent)] hover:underline"
        >
          {kr.ref && <span className="mr-1.5 font-mono text-caption font-semibold text-[var(--ap-fg-subtle)]">{kr.ref}</span>}
          {kr.title}
        </Link>
      )}
      <OutcomeBadge outcome={kr.outcome} />
      {kr.finalGrade !== null && (
        <span className="font-mono text-caption tabular-nums text-[var(--ap-fg-muted)]" title="Final grade">
          {formatGrade(kr.finalGrade)}
        </span>
      )}
      {!kr.redacted && <SuccessorLine successors={kr.successors} disposition={kr.disposition} />}
    </div>
  )
}

function PastObjectiveRow({
  objective: o,
  onRetrospective,
}: {
  objective: OkrProfilePastObjective
  onRetrospective: (objective: OkrProfilePastObjective) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 px-1">
        <ExpandToggle
          expanded={open}
          onToggle={() => setOpen((v) => !v)}
          label="past objective key results"
          disabled={o.keyResults.length === 0}
        />
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <MiniBadge>{o.timeframe.name}</MiniBadge>
            {o.redacted ? (
              <span className="inline-flex items-center gap-1.5 text-body-sm italic text-[var(--ap-fg-muted)]">
                <Lock className="size-3.5" aria-hidden />
                Private objective
              </span>
            ) : (
              <Link
                href={`/dashboard/objectives/${encodeURIComponent(o.id)}`}
                className="min-w-0 truncate rounded-[var(--ap-radius-xs)] text-body-sm font-semibold text-[var(--ap-fg)] ap-focus-ring hover:text-[var(--ap-accent)] hover:underline"
              >
                {o.ref && <span className="mr-1.5 font-mono text-caption text-[var(--ap-fg-subtle)]">{o.ref}</span>}
                {o.title}
              </Link>
            )}
            <OutcomeBadge outcome={o.outcome} />
            {o.finalGrade !== null && (
              <span className="font-mono text-caption tabular-nums text-[var(--ap-fg-muted)]" title="Final grade">
                Grade {formatGrade(o.finalGrade)}
              </span>
            )}
            {o.closedAt && <span className="text-caption text-[var(--ap-fg-subtle)]">Closed {formatDay(o.closedAt, { year: true })}</span>}
          </div>
          {!o.redacted && <SuccessorLine successors={o.successors} disposition={o.disposition} />}
        </div>
        {o.hasRetrospective && (
          <button
            type="button"
            onClick={() => onRetrospective(o)}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-[var(--ap-radius-sm)] px-1.5 py-0.5 text-caption font-semibold text-[var(--ap-accent)] ap-focus-ring hover:bg-[var(--ap-bg-hover)]"
          >
            <BookOpen className="size-3.5" aria-hidden />
            Retrospective
          </button>
        )}
      </div>
      {open && o.keyResults.length > 0 && (
        <TreeChildren className="ml-[13px] mt-1">
          {o.keyResults.map((kr) => (
            <PastKeyResultRow key={kr.id} kr={kr} />
          ))}
        </TreeChildren>
      )}
    </li>
  )
}

export interface PastOkrsSectionProps {
  past: OkrProfilePastObjective[]
  truncated: boolean
  onRetrospective: (objective: OkrProfilePastObjective) => void
}

export function PastOkrsSection({ past, truncated, onRetrospective }: PastOkrsSectionProps) {
  const [open, setOpen] = useState(false)
  const continued = past.filter((p) => p.disposition === 'CONTINUED').length

  return (
    <section aria-label="Past OKRs" className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[var(--ap-radius-sm)] px-1 py-1.5 text-left ap-focus-ring hover:bg-[var(--ap-bg-hover)]"
      >
        {open ? (
          <ChevronDown className="size-4 text-[var(--ap-fg-subtle)]" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-[var(--ap-fg-subtle)]" aria-hidden />
        )}
        <History className="size-4 text-[var(--ap-fg-subtle)]" aria-hidden />
        <span className="text-section-title font-semibold text-[var(--ap-fg)]">Past OKRs</span>
        <MiniBadge mono>{past.length}</MiniBadge>
        {past.length > 0 && (
          <span className="ml-auto text-caption text-[var(--ap-fg-subtle)]">
            {continued} continued · {past.length - continued} without successor
          </span>
        )}
      </button>
      {open &&
        (past.length === 0 ? (
          <p className="px-1 text-caption text-[var(--ap-fg-subtle)]">
            No closed objectives from earlier timeframes. When an OKR is closed, its outcome, grade and the items
            that continue it appear here.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {past.map((o) => (
                <PastObjectiveRow key={o.id} objective={o} onRetrospective={onRetrospective} />
              ))}
            </ul>
            {truncated && (
              <p className="px-1 text-caption text-[var(--ap-fg-subtle)]">Showing the {past.length} most recent closed objectives.</p>
            )}
          </>
        ))}
    </section>
  )
}
