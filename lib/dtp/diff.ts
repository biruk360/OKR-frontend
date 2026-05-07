/**
 * Field-level diff between an "original" and "edited" trip stop. Used by the
 * Coordinator-edit flow to (a) decide whether the plan moves to ADJUSTED, and
 * (b) render side-by-side red-strikethrough/green diffs to the requester.
 */

import type { CoordinatorAdjustments } from '@/types/dtp'

const DIFFABLE_FIELDS = [
  'destinationName',
  'destinationAddress',
  'destinationLat',
  'destinationLng',
  'destinationPlaceId',
  'plannedStart',
  'dwellMinutes',
  'flexibility',
  'tripMode',
  'modeOfMovement',
  'pickupBackTo',
  'pickupBackAddress',
  'requiresVehicle',
  'requiresCashAdvance',
  'cashAdvanceAmount',
  'reason',
  'expectedOutcome',
  'withWhom',
  'purposeCode',
  'tripTypeId',
  'contactPerson',
  'contactPhone',
  'seq',
] as const

type Diffable = (typeof DIFFABLE_FIELDS)[number]

export function diffStop(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
): CoordinatorAdjustments {
  const out: CoordinatorAdjustments = {}
  for (const f of DIFFABLE_FIELDS as readonly Diffable[]) {
    const a = original[f]
    const b = edited[f]
    if (!shallowEqual(a, b)) {
      out[f] = { before: a ?? null, after: b ?? null }
    }
  }
  return out
}

export function hasMaterialChanges(diff: CoordinatorAdjustments): boolean {
  return Object.keys(diff).length > 0
}

export function mergeAdjustments(
  prior: CoordinatorAdjustments | null | undefined,
  next: CoordinatorAdjustments,
): CoordinatorAdjustments {
  const out: CoordinatorAdjustments = { ...(prior ?? {}) }
  for (const [k, v] of Object.entries(next)) {
    // Preserve the earliest "before" value across multiple Coordinator edits.
    out[k] = { before: out[k]?.before ?? v.before, after: v.after }
  }
  return out
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
