'use client'

/**
 * PackageReviewControls — Agree / Dispute on one package item (PKG-2).
 *
 * Mount next to any item a profile tab renders: `{ packageId, entityType, entityId }`.
 * Every instance on a page shares one `GET …/reviews` request (TanStack Query
 * dedupes by package id).
 *   - The employee, while the package is IN_REVIEW: Agree / Dispute buttons; Dispute
 *     opens a comment popover (comment required).
 *   - Everyone else who can see the package: the current verdict badge (comment and
 *     resolution in the tooltip), plus Resolve for managers on an open dispute.
 *   - No package (PKG-5) or no access: renders nothing.
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Flag, ThumbsUp } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PackageReviewEntityType } from '@/types/package'
import { usePackageReviews, useReviewPackageItem } from '../hooks/queries'
import { disputeFormSchema, REVIEW_COMMENT_MAX, type DisputeFormValues } from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'
import type { PackageItemReviewDTO } from '../types'
import { ReviewVerdictBadge } from './PackageBits'
import { ResolveDisputePopover } from './ResolveDisputePopover'

export interface PackageReviewControlsProps {
  /** The person's package for the timeframe; null / undefined → nothing to review (PKG-5). */
  packageId: string | null | undefined
  entityType: PackageReviewEntityType
  entityId: string
  /** Smaller buttons for dense rows. */
  compact?: boolean
  className?: string
}

function verdictTooltip(review: PackageItemReviewDTO): string | undefined {
  const parts: string[] = []
  if (review.comment) parts.push(`Comment: ${review.comment}`)
  if (review.resolution) parts.push(`Resolution: ${review.resolution}`)
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function PackageReviewControls({ packageId, entityType, entityId, compact = false, className }: PackageReviewControlsProps) {
  const query = usePackageReviews(packageId)
  const save = useReviewPackageItem()
  const [disputeOpen, setDisputeOpen] = useState(false)
  const form = useForm<DisputeFormValues>({
    resolver: zodFormResolver<DisputeFormValues>(disputeFormSchema),
    defaultValues: { comment: '' },
  })
  const { register, handleSubmit, reset, formState } = form

  if (!packageId || !query.data) return null
  const data = query.data
  // The employee's own verdict; reviews by anyone else are not the package review.
  const review = data.reviews.find(
    (r) => r.entityType === entityType && r.entityId === entityId && r.reviewerId === data.userId,
  )
  const canReview = data.permissions.canReview
  const openDispute = review?.verdict === 'DISPUTE' && !review.resolvedAt

  if (!canReview) {
    if (!review) return null
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <ReviewVerdictBadge verdict={review.verdict} resolved={!!review.resolvedAt} title={verdictTooltip(review)} />
        {openDispute && data.permissions.canResolveDisputes && (
          <ResolveDisputePopover packageId={packageId} reviewId={review.id} />
        )}
      </span>
    )
  }

  const size = compact ? 'xs' : 'sm'

  const agree = async () => {
    try {
      await save.mutateAsync({ packageId, body: { entityType, entityId, verdict: 'AGREE' } })
    } catch {
      // Toast shown by the hook.
    }
  }

  const onDispute = handleSubmit(async ({ comment }) => {
    const text = comment.trim()
    try {
      await save.mutateAsync({ packageId, body: { entityType, entityId, verdict: 'DISPUTE', comment: text } })
      setDisputeOpen(false)
    } catch {
      // Toast shown by the hook.
    }
  })

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Review this item">
      {review && <ReviewVerdictBadge verdict={review.verdict} resolved={!!review.resolvedAt} title={verdictTooltip(review)} />}
      <Button
        variant={review?.verdict === 'AGREE' ? 'secondary' : 'outline'}
        size={size}
        onClick={agree}
        disabled={save.isPending || review?.verdict === 'AGREE'}
        aria-pressed={review?.verdict === 'AGREE'}
      >
        <ThumbsUp aria-hidden />
        Agree
      </Button>
      <Popover
        open={disputeOpen}
        onOpenChange={(next) => {
          if (save.isPending) return
          if (next) reset({ comment: review?.verdict === 'DISPUTE' ? review.comment ?? '' : '' })
          setDisputeOpen(next)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant={review?.verdict === 'DISPUTE' ? 'secondary' : 'outline'}
            size={size}
            disabled={save.isPending}
            aria-pressed={review?.verdict === 'DISPUTE'}
          >
            <Flag aria-hidden />
            {review?.verdict === 'DISPUTE' ? 'Edit dispute' : 'Dispute'}
          </Button>
        </PopoverTrigger>
        <PopoverContent width={290} label="Dispute this item" heading="Dispute this item" align="end">
          <form onSubmit={onDispute} className="space-y-2">
            <label htmlFor={`dispute-${entityType}-${entityId}`} className="block text-caption text-[var(--ap-fg-muted)]">
              What should change? Your manager sees this comment and resolves it before approving the package.
            </label>
            <textarea
              id={`dispute-${entityType}-${entityId}`}
              rows={3}
              className="input h-auto"
              autoFocus
              maxLength={REVIEW_COMMENT_MAX}
              {...register('comment')}
            />
            {formState.errors.comment?.message && (
              <p className="text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
                {formState.errors.comment.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDisputeOpen(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Submit dispute'}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </span>
  )
}
