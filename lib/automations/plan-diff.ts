/**
 * Compare two PlanSpec versions.
 * Spec: docs/AI_Automations_Requirements_v1.0.md FR-03.
 *
 * Re-compiling an instruction rewrites the thing that runs unattended at 03:00,
 * so the user sees exactly what changed before it is saved. Grouped the way a
 * person reasons about it — "will it run more often?", "will it read more?",
 * "will more people get email?" — not as a JSON patch.
 */

import type { PlanSpec, PlanStep } from '@/types/automations'
import { describeSchedule } from './schedule'

export const DIFF_GROUPS = ['Schedule', 'Steps', 'Synthesis', 'Briefing', 'Recipients', 'Limits'] as const
export type DiffGroup = (typeof DIFF_GROUPS)[number]

export interface PlanChange {
  group: DiffGroup
  label: string
  before: string | null
  after: string | null
  kind: 'added' | 'removed' | 'changed'
  /**
   * True when the change widens what the automation does — runs more often,
   * reads more, spends more, or reaches more people. These are surfaced first
   * because they are the ones worth a second look.
   */
  widening?: boolean
}

export interface PlanDiff {
  changes: PlanChange[]
  hasChanges: boolean
}

function show(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function compare(
  changes: PlanChange[],
  group: DiffGroup,
  label: string,
  before: unknown,
  after: unknown,
  widening?: (before: unknown, after: unknown) => boolean
): void {
  const a = show(before)
  const b = show(after)
  if (a === b) return
  changes.push({
    group,
    label,
    before: a === '—' ? null : a,
    after: b === '—' ? null : b,
    kind: a === '—' ? 'added' : b === '—' ? 'removed' : 'changed',
    ...(widening?.(before, after) ? { widening: true } : {}),
  })
}

/** Rough ordering of how often each preset fires — used to spot "runs more often". */
const FREQUENCY_RANK: Record<string, number> = {
  ONCE: 0, YEARLY: 1, QUARTERLY: 2, MONTHLY: 3, WEEKLY: 4, DAILY: 5, HOURLY: 6, CUSTOM_CRON: 5,
}

function describeStep(step: PlanStep): string {
  const params = Object.entries(step.params ?? {})
    .map(([key, value]) => `${key}=${show(value)}`)
    .join(' ')
  return `${step.tool}${params ? ` (${params})` : ''}`
}

export function diffPlans(before: PlanSpec | null, after: PlanSpec): PlanDiff {
  const changes: PlanChange[] = []

  if (!before) return { changes, hasChanges: false }

  // --- Schedule ------------------------------------------------------------
  compare(
    changes, 'Schedule', 'When it runs',
    describeSchedule(before.schedule), describeSchedule(after.schedule),
    () => (FREQUENCY_RANK[after.schedule.kind] ?? 0) > (FREQUENCY_RANK[before.schedule.kind] ?? 0)
  )
  compare(changes, 'Schedule', 'Timezone', before.schedule.timezone, after.schedule.timezone)
  compare(changes, 'Schedule', 'Missed-run policy', before.schedule.catchUpPolicy ?? 'SKIP', after.schedule.catchUpPolicy ?? 'SKIP')
  compare(changes, 'Schedule', 'Ends', before.schedule.endDate, after.schedule.endDate)
  compare(changes, 'Schedule', 'Maximum runs', before.schedule.maxRuns, after.schedule.maxRuns)

  // --- Steps ---------------------------------------------------------------
  const beforeSteps = new Map(before.steps.map((s) => [s.id, s]))
  const afterSteps = new Map(after.steps.map((s) => [s.id, s]))

  for (const [id, step] of Array.from(afterSteps)) {
    const prior = beforeSteps.get(id)
    if (!prior) {
      changes.push({
        group: 'Steps', label: `Added "${step.label}"`,
        before: null, after: describeStep(step), kind: 'added', widening: true,
      })
      continue
    }
    compare(changes, 'Steps', step.label, describeStep(prior), describeStep(step))
  }

  for (const [id, step] of Array.from(beforeSteps)) {
    if (afterSteps.has(id)) continue
    changes.push({
      group: 'Steps', label: `Removed "${step.label}"`,
      before: describeStep(step), after: null, kind: 'removed',
    })
  }

  // --- Synthesis / Briefing ------------------------------------------------
  compare(changes, 'Synthesis', 'Objective', before.synthesis.objective, after.synthesis.objective)
  compare(changes, 'Synthesis', 'Relevance criteria', before.synthesis.relevanceCriteria, after.synthesis.relevanceCriteria)
  compare(
    changes, 'Synthesis', 'Identity fields',
    before.synthesis.findingSchema?.dedupeKeyFields, after.synthesis.findingSchema?.dedupeKeyFields
  )
  compare(changes, 'Synthesis', 'Max findings', before.synthesis.maxFindings, after.synthesis.maxFindings)
  compare(changes, 'Briefing', 'Title', before.briefing.titleTemplate, after.briefing.titleTemplate)
  compare(changes, 'Briefing', 'Tone', before.briefing.tone, after.briefing.tone)

  // --- Recipients ----------------------------------------------------------
  const beforeTo = [...(before.notify.emailRecipients ?? [])].sort()
  const afterTo = [...(after.notify.emailRecipients ?? [])].sort()
  compare(
    changes, 'Recipients', 'Email recipients',
    beforeTo.length, afterTo.length,
    () => afterTo.length > beforeTo.length
  )
  compare(changes, 'Recipients', 'In-app', before.notify.inApp ?? true, after.notify.inApp ?? true)
  compare(
    changes, 'Recipients', 'When nothing is new',
    before.notify.onEmpty ?? 'SKIP', after.notify.onEmpty ?? 'SKIP',
    (a, b) => a === 'SKIP' && b === 'SEND'
  )

  // --- Limits --------------------------------------------------------------
  compare(
    changes, 'Limits', 'Cost cap per run',
    before.limits?.maxCostUsd, after.limits?.maxCostUsd,
    (a, b) => typeof a === 'number' && typeof b === 'number' && b > a
  )
  compare(
    changes, 'Limits', 'Timeout (s)',
    before.limits?.timeoutSeconds, after.limits?.timeoutSeconds,
    (a, b) => typeof a === 'number' && typeof b === 'number' && b > a
  )

  // Widening changes first — they are the ones worth a second look.
  changes.sort((a, b) => Number(Boolean(b.widening)) - Number(Boolean(a.widening)))

  return { changes, hasChanges: changes.length > 0 }
}

/** One-line summary for a confirm dialog. */
export function summarizeDiff(diff: PlanDiff): string {
  if (!diff.hasChanges) return 'No changes'
  const widening = diff.changes.filter((c) => c.widening).length
  const total = diff.changes.length
  const base = `${total} change${total === 1 ? '' : 's'}`
  return widening > 0 ? `${base}, ${widening} of which widen what it does` : base
}
