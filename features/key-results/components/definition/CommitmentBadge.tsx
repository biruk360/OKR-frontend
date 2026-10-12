'use client'

/**
 * CommitmentBadge (KRX-2/4) — C / A / C/A commitment code for a KR, with the
 * "70% = success" hint for aspirational KRs. Renders nothing when unset.
 */
import { MiniBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ASPIRATIONAL_SUCCESS_GRADE } from '@/lib/okr/kr-commitment'
import { KR_COMMITMENT_LABELS, KR_COMMITMENT_SHORT, isKrCommitment, type KrCommitment } from '@/types/package'

export interface CommitmentBadgeProps {
  commitment: string | null | undefined
  /** Show the full label next to the code ("C/A Committed / Aspirational"). */
  showLabel?: boolean
  /** Show "70% = success" next to an aspirational badge. Default true. */
  showHint?: boolean
  className?: string
}

const TONE: Record<KrCommitment, 'accent' | 'ahead' | 'neutral'> = {
  COMMITTED: 'accent',
  ASPIRATIONAL: 'ahead',
  MIXED: 'neutral',
}

const SUCCESS_HINT = `${Math.round(ASPIRATIONAL_SUCCESS_GRADE * 100)}% = success`

const TITLE: Record<KrCommitment, string> = {
  COMMITTED: 'Committed — expected to be fully achieved (100% = success)',
  ASPIRATIONAL: `Aspirational — a stretch goal; ${SUCCESS_HINT}`,
  MIXED: `Committed / Aspirational — committed parts are expected in full; aspirational parts count at ${SUCCESS_HINT}`,
}

export function commitmentSuccessHint(commitment: string | null | undefined): string | null {
  return commitment === 'ASPIRATIONAL' ? SUCCESS_HINT : null
}

export default function CommitmentBadge({ commitment, showLabel = false, showHint = true, className }: CommitmentBadgeProps) {
  if (!isKrCommitment(commitment)) return null
  const hint = showHint ? commitmentSuccessHint(commitment) : null
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <MiniBadge tone={TONE[commitment]} mono title={TITLE[commitment]}>
        {KR_COMMITMENT_SHORT[commitment]}
      </MiniBadge>
      {showLabel && (
        <span className="text-body-sm" style={{ color: 'var(--ap-fg)' }}>
          {KR_COMMITMENT_LABELS[commitment]}
        </span>
      )}
      {hint && (
        <span className="text-caption font-medium" style={{ color: 'var(--ap-ahead-fg)' }}>
          {hint}
        </span>
      )}
    </span>
  )
}
