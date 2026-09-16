/**
 * Briefing assembly — turn a synthesis result plus a finding diff into the final
 * block list. Spec: docs/AI_Automations_Requirements_v1.0.md §8.3, FR-08, FR-09.
 *
 * The model writes the narrative; this file writes the structure. Finding blocks
 * are generated here rather than by the model because only the server knows what
 * the previous run contained — and because a collapsed "12 unchanged" line is the
 * single thing that keeps a daily automation from being muted in week one.
 */

import type { BriefingBlock, Finding, PlanSpec } from '@/types/automations'
import type { FindingDiff } from './findings'

export interface AssembleInput {
  plan: PlanSpec
  summary: string
  /** Narrative blocks from the model — heading/paragraph/metric/table/list/callout/linkCard. */
  narrative: BriefingBlock[]
  diff: FindingDiff
  /** Rendered into a warning callout so a partial run never looks complete. */
  warnings?: string[]
}

function findingBlocks(findings: Finding[]): BriefingBlock[] {
  return findings.map((f) => ({
    type: 'finding' as const,
    dedupeKey: f.dedupeKey,
    status: f.status,
    title: f.title,
    ...(f.url ? { url: f.url } : {}),
    ...(f.fields ? { fields: f.fields } : {}),
    ...(typeof f.score === 'number' ? { score: f.score } : {}),
    ...(f.changeNote ? { changeNote: f.changeNote } : {}),
  }))
}

/**
 * Assemble the document. Order is deliberate: what changed comes before the
 * narrative detail, because the reader is scanning for "is there anything for me
 * today" and should not have to scroll to find out.
 */
export function assembleBriefingBlocks(input: AssembleInput): BriefingBlock[] {
  const { diff, narrative, warnings = [] } = input
  const blocks: BriefingBlock[] = []

  // 1. Lead: the model's summary.
  blocks.push({ type: 'paragraph', text: input.summary })

  // 2. Anything that degraded this run, stated up front.
  for (const warning of warnings) {
    blocks.push({ type: 'callout', tone: 'warning', title: 'Partial run', text: warning })
  }

  // 3. Counts, when there is anything to count.
  const hasFindings =
    diff.newCount + diff.changedCount + diff.unchangedCount + diff.resolved.length > 0
  if (hasFindings) {
    blocks.push({ type: 'metric', label: 'New', value: String(diff.newCount), tone: diff.newCount > 0 ? 'success' : 'neutral' })
    blocks.push({ type: 'metric', label: 'Changed', value: String(diff.changedCount), tone: diff.changedCount > 0 ? 'warning' : 'neutral' })
    blocks.push({ type: 'metric', label: 'Unchanged', value: String(diff.unchangedCount) })
    blocks.push({ type: 'metric', label: 'Closed', value: String(diff.resolved.length) })
  }

  const newOnes = diff.findings.filter((f) => f.status === 'NEW')
  const changed = diff.findings.filter((f) => f.status === 'CHANGED')
  const unchanged = diff.findings.filter((f) => f.status === 'UNCHANGED')

  if (newOnes.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: `New (${newOnes.length})` })
    blocks.push(...findingBlocks(newOnes))
  }

  if (changed.length > 0) {
    blocks.push({ type: 'heading', level: 2, text: `Changed (${changed.length})` })
    blocks.push(...findingBlocks(changed))
  }

  // Unchanged collapses to a single line. Re-listing twenty items every morning
  // is what trains people to filter the sender into a folder.
  if (unchanged.length > 0) {
    blocks.push({
      type: 'paragraph',
      text: `_${unchanged.length} previously reported ${unchanged.length === 1 ? 'item is' : 'items are'} unchanged._`,
    })
  }

  if (diff.resolved.length > 0) {
    blocks.push({ type: 'heading', level: 3, text: `Closed since last run (${diff.resolved.length})` })
    blocks.push({ type: 'list', items: diff.resolved.map((f) => f.title) })
  }

  // 4. The model's narrative detail last.
  if (narrative.length > 0) {
    if (hasFindings) blocks.push({ type: 'divider' })
    blocks.push(...narrative)
  }

  if (!hasFindings && narrative.length === 0) {
    blocks.push({ type: 'callout', tone: 'neutral', title: 'Nothing to report', text: 'This run completed without finding anything that met the criteria.' })
  }

  return blocks
}

/** Resolve the Briefing title from the plan's template. */
export function buildBriefingTitle(template: string, fallback: string): string {
  const trimmed = template.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 200) : fallback
}
