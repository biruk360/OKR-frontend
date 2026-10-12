'use client'

import { AlertTriangle } from 'lucide-react'
import { MiniBadge } from '@/components/ui'
import { usePackageReviews } from '../hooks/queries'
import { PACKAGE_REVIEW_ENTITY_LABELS } from '../services/rules'
import { ResolveDisputePopover } from './ResolveDisputePopover'

/**
 * Open disputes on a package (PKG-1 / PKG-2): item, the employee's comment and,
 * for the manager chain / HR / Exec / Admin, a Resolve action. Approval is
 * blocked until this list is empty.
 */
export function PackageDisputesList({ packageId }: { packageId: string }) {
  const query = usePackageReviews(packageId)
  const data = query.data
  if (!data) return null
  const open = data.reviews.filter((r) => r.verdict === 'DISPUTE' && !r.resolvedAt)
  if (open.length === 0) return null

  return (
    <section aria-label="Open disputes" className="rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-body-sm font-semibold text-[var(--ap-warn-fg)]">
        <AlertTriangle className="size-3.5" aria-hidden />
        {open.length} open dispute{open.length === 1 ? '' : 's'}
      </p>
      <ul className="divide-y divide-[var(--ap-border)]">
        {open.map((review) => (
          <li key={review.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-body-sm font-medium text-[var(--ap-fg)]">
                <MiniBadge tone="neutral">{PACKAGE_REVIEW_ENTITY_LABELS[review.entityType]}</MiniBadge>
                <span className="min-w-0 break-words">
                  {review.itemMissing
                    ? 'Item no longer in the package'
                    : review.itemRedacted
                      ? 'Private item'
                      : review.itemTitle}
                </span>
              </p>
              {review.comment && (
                <p className="mt-0.5 whitespace-pre-line text-caption text-[var(--ap-fg-muted)]">“{review.comment}”</p>
              )}
            </div>
            {data.permissions.canResolveDisputes && <ResolveDisputePopover packageId={packageId} reviewId={review.id} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
