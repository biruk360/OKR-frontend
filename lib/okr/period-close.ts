export const OKR_OUTCOMES = ['ACHIEVED', 'PARTIAL', 'MISSED', 'ABANDONED'] as const
export type OkrOutcome = (typeof OKR_OUTCOMES)[number]

export interface InitiateCloseInput {
  outcome: OkrOutcome
  finalGrade: number | null
  closureNote: string | null
  gradeRationale: string | null
}

export function confidenceTierFromScore(score: number): string {
  if (score >= 67) return 'ON_TRACK'
  if (score >= 34) return 'AT_RISK'
  return 'OFF_TRACK'
}

export function canCloseBeforePeriodEnd(role: string): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

export function isTimeframeEnded(endDate: Date | string, now = new Date()): boolean {
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)
  return end.getTime() <= now.getTime()
}

export function parseInitiateCloseInput(
  body: unknown,
  computedProgress: number,
): { ok: true; data: InitiateCloseInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Request body is required' }
  const raw = body as Record<string, unknown>
  if (!OKR_OUTCOMES.includes(raw.outcome as OkrOutcome)) {
    return { ok: false, error: 'Choose a valid outcome' }
  }

  const outcome = raw.outcome as OkrOutcome
  const closureNote = typeof raw.closureNote === 'string' ? raw.closureNote.trim() : ''
  if (closureNote.length > 500) return { ok: false, error: 'Closure note must be 500 characters or fewer' }

  const rationale = typeof raw.gradeRationale === 'string' ? raw.gradeRationale.trim() : ''
  if (outcome === 'ABANDONED') {
    if (!closureNote) return { ok: false, error: 'Explain why this OKR is being abandoned' }
    return {
      ok: true,
      data: { outcome, finalGrade: null, closureNote, gradeRationale: rationale || null },
    }
  }

  const finalGrade = Number(raw.finalGrade)
  if (!Number.isFinite(finalGrade) || finalGrade < 0 || finalGrade > 1) {
    return { ok: false, error: 'Final grade must be between 0.0 and 1.0' }
  }
  const snappedGrade = Math.round(finalGrade * 20) / 20
  const gradeDelta = snappedGrade - Math.min(100, Math.max(0, computedProgress)) / 100
  if (Math.abs(gradeDelta) > 0.15 && !rationale) {
    return { ok: false, error: 'Explain why the final grade differs from computed progress' }
  }

  return {
    ok: true,
    data: {
      outcome,
      finalGrade: snappedGrade,
      closureNote: closureNote || null,
      gradeRationale: rationale || null,
    },
  }
}

export function firstConfidence(
  rows: Array<{ confidence: string; asOfDate?: Date | string; createdAt?: Date | string }>,
): string | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    const aDate = new Date(a.asOfDate ?? a.createdAt ?? 0).getTime()
    const bDate = new Date(b.asOfDate ?? b.createdAt ?? 0).getTime()
    return aDate - bDate
  })
  return sorted[0]?.confidence ?? null
}

export const RECOMMENDED_ACTIONS = [
  'ROLL_FORWARD',
  'ROLL_FORWARD_MODIFIED',
  'ABANDON',
  'COMPLETE_NO_ROLLOVER',
  'SPLIT',
] as const

export function hasMeaningfulRichText(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const plain = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()
  return plain.length > 0
}

export function validateRetrospectiveForCommit(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'A retrospective is required'
  const retro = value as Record<string, unknown>
  if (!hasMeaningfulRichText(retro.whatWasAchieved)) return 'What was achieved is required'
  if (!hasMeaningfulRichText(retro.whatWeLearned)) return 'What we learned is required'
  if (!RECOMMENDED_ACTIONS.includes(retro.recommendedAction as any)) {
    return 'Choose a valid recommended action'
  }
  return null
}

export function validateReopenReason(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length < 20) {
    return 'Reopen reason must be at least 20 characters'
  }
  return null
}

export function isWithinReopenWindow(closedAt: Date | string | null, windowDays: number, now = new Date()): boolean {
  if (!closedAt) return false
  const elapsed = now.getTime() - new Date(closedAt).getTime()
  return elapsed >= 0 && elapsed <= Math.max(0, windowDays) * 86_400_000
}
