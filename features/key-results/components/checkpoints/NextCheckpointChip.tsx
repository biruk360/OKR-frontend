'use client'

/**
 * NextCheckpointChip (KRX-3) — the next checkpoint for a KR row on the profile
 * (P2) or any list: "Q3 · 30 Sep" with a due/overdue tone. Presentational; pass
 * the checkpoints you already loaded (it picks the next PENDING one), or a
 * single `checkpoint`. Renders nothing when there is none.
 */
import { Flag } from 'lucide-react'
import { MiniBadge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  describeDueIn,
  daysUntilCheckpoint,
  findNextCheckpoint,
  formatCheckpointDate,
  type CheckpointLike,
} from './checkpoint-utils'

export interface NextCheckpointChipProps {
  checkpoints?: readonly (CheckpointLike & { targetText?: string | null })[] | null
  checkpoint?: (CheckpointLike & { targetText?: string | null }) | null
  /** Days ahead at which the chip turns amber. Default 14. */
  soonDays?: number
  className?: string
}

export default function NextCheckpointChip({ checkpoints, checkpoint, soonDays = 14, className }: NextCheckpointChipProps) {
  const next = checkpoint ?? (checkpoints ? findNextCheckpoint(checkpoints) : null)
  if (!next || next.status !== 'PENDING') return null
  const days = daysUntilCheckpoint(next.dueDate)
  const tone = days < 0 ? 'danger' : days <= soonDays ? 'warn' : 'neutral'
  const title = [`Next checkpoint ${next.label}`, describeDueIn(next.dueDate), next.targetText ? `Target: ${next.targetText}` : null]
    .filter(Boolean)
    .join(' — ')
  return (
    <MiniBadge tone={tone} className={cn('gap-1', className)} title={title}>
      <Flag className="size-3" aria-hidden />
      {next.label} · {formatCheckpointDate(next.dueDate)}
    </MiniBadge>
  )
}
