/**
 * Finding identity and run-to-run diffing.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §8.3.
 *
 * Why this file matters more than it looks: a daily tender scan re-finds the same
 * tender for three weeks. Without a stable identity and a diff, every recipient
 * gets the same twenty items every morning and mutes the automation by day three.
 *
 *   dedupeKey   — stable identity across runs, hashed from the plan's chosen fields
 *   contentHash — everything else; a change here means CHANGED, not NEW
 */

import { createHash } from 'crypto'
import type { Finding, FindingStatus, RawFinding } from '@/types/automations'

/** Normalised so trivial formatting churn doesn't read as a change. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Identity hash. Built only from the fields the plan nominated, in a stable
 * (sorted) order so field ordering in the model's output can never change it.
 * Falls back to the title when no nominated field carries a value — better a
 * weak key than a random one, which would make everything permanently NEW.
 */
export function computeDedupeKey(finding: RawFinding, dedupeKeyFields: string[]): string {
  const parts: string[] = []
  for (const field of [...dedupeKeyFields].sort()) {
    const value =
      field === 'title' ? finding.title
      : field === 'url' ? finding.url
      : finding.fields?.[field]
    if (value) parts.push(`${field}=${normalise(String(value))}`)
  }
  if (parts.length === 0) parts.push(`title=${normalise(finding.title)}`)
  return sha256(parts.join('|')).slice(0, 32)
}

/** Everything that is not identity. Changing any of it marks the finding CHANGED. */
export function computeContentHash(finding: RawFinding): string {
  const fields = finding.fields ?? {}
  const serialised = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${normalise(String(fields[key]))}`)
    .join('|')
  return sha256(
    [normalise(finding.title), normalise(finding.url ?? ''), serialised, finding.score ?? ''].join('||')
  ).slice(0, 32)
}

/** Human-readable "what changed" line for a CHANGED finding. */
function describeChange(previous: Finding, current: RawFinding): string | undefined {
  const before = previous.fields ?? {}
  const after = current.fields ?? {}
  const changes: string[] = []

  for (const key of Object.keys(after)) {
    if (before[key] !== undefined && normalise(String(before[key])) !== normalise(String(after[key]))) {
      changes.push(`${key}: ${before[key]} → ${after[key]}`)
    }
  }
  for (const key of Object.keys(after)) {
    if (before[key] === undefined) changes.push(`${key} added`)
  }
  if (normalise(previous.title) !== normalise(current.title)) {
    changes.unshift(`title: "${previous.title}" → "${current.title}"`)
  }

  if (changes.length === 0) return undefined
  return changes.slice(0, 4).join('; ')
}

export interface FindingDiff {
  findings: Finding[]
  newCount: number
  changedCount: number
  unchangedCount: number
  /** Present in the previous run, gone now — rendered as "Closed since last run". */
  resolved: Finding[]
}

/**
 * Compare this run's findings against the previous successful run's.
 *
 * `previous` empty (first ever run) deliberately marks everything NEW — the first
 * Briefing is a baseline and the owner should see the full picture once.
 */
export function diffFindings(
  current: RawFinding[],
  previous: Finding[],
  dedupeKeyFields: string[]
): FindingDiff {
  const previousByKey = new Map(previous.map((f) => [f.dedupeKey, f]))
  const seen = new Set<string>()
  const findings: Finding[] = []

  let newCount = 0
  let changedCount = 0
  let unchangedCount = 0

  for (const raw of current) {
    const dedupeKey = computeDedupeKey(raw, dedupeKeyFields)
    const contentHash = computeContentHash(raw)

    // Two findings in the same run collapsing onto one key: keep the first.
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const prior = previousByKey.get(dedupeKey)
    let status: FindingStatus
    let changeNote: string | undefined

    if (!prior) {
      status = 'NEW'
      newCount++
    } else if (prior.contentHash !== contentHash) {
      status = 'CHANGED'
      changeNote = describeChange(prior, raw)
      changedCount++
    } else {
      status = 'UNCHANGED'
      unchangedCount++
    }

    findings.push({ ...raw, dedupeKey, contentHash, status, changeNote })
  }

  const resolved = previous
    .filter((f) => !seen.has(f.dedupeKey))
    .map((f) => ({ ...f, status: 'RESOLVED' as FindingStatus, changeNote: undefined }))

  return { findings, newCount, changedCount, unchangedCount, resolved }
}

/**
 * The suppression rule (spec §8.3 / FR-11). Nothing new and nothing changed means
 * no email — the Briefing is still created and visible in the app.
 */
export function shouldSuppressDelivery(diff: FindingDiff, onEmpty: 'SKIP' | 'SEND'): boolean {
  if (onEmpty === 'SEND') return false
  return diff.newCount === 0 && diff.changedCount === 0
}
