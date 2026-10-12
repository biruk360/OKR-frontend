'use client'

/**
 * PackageHeaderCard — the operating package header on the employee profile
 * (PKG-1…5): status, version, seat title, performance mix, "n of m reviewed ·
 * k disputes open", open disputes and the lifecycle actions the API allows.
 *
 * `<PackageHeaderCard userId timeframeId />` fetches `GET /api/package/packages`.
 * Renders nothing when the viewer may not see the package (403), and "No
 * package for this timeframe" when there is none (PKG-5).
 */
import { useState } from 'react'
import { format } from 'date-fns'
import { Archive, BadgeCheck, Pencil, RotateCcw, Send, PackageOpen, Plus } from 'lucide-react'
import { ActionsMenu, Button, ConfirmDialog, Progress } from '@/components/ui'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useApprovePackage, useOperatingPackage, useSubmitPackage, useUpdatePackage } from '../hooks/queries'
import type { PackageApiError } from '../services/api'
import { nextPackageVersion } from '../services/rules'
import type { OperatingPackageDTO, OperatingPackageResponse } from '../types'
import { formatReviewSummary, PackageStatusBadge, WeightsMix } from './PackageBits'
import { PackageDisputesList } from './PackageDisputesList'
import { PackageEditModal } from './PackageEditModal'

export interface PackageHeaderCardProps {
  userId: string
  timeframeId: string
  className?: string
}

type PendingAction = 'submit' | 'approve' | 'archive' | 'reopen' | null

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-4 shadow-card sm:p-5'

function fmtDate(value: string | null): string {
  return value ? format(new Date(value), 'd MMM yyyy') : ''
}

export function PackageHeaderCard({ userId, timeframeId, className }: PackageHeaderCardProps) {
  const query = useOperatingPackage(userId, timeframeId)
  const [editOpen, setEditOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)
  const submit = useSubmitPackage()
  const approve = useApprovePackage()
  const update = useUpdatePackage()

  if (query.isLoading) {
    return (
      <div className={cn(cardClass, 'space-y-3', className)} aria-busy="true">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-2 w-full" />
      </div>
    )
  }
  if (query.isError) {
    const status = (query.error as PackageApiError | undefined)?.status
    if (status === 403 || status === 404) return null
    return (
      <div className={cn(cardClass, 'text-body-sm text-[var(--ap-fg-muted)]', className)} role="alert">
        Could not load the operating package.{' '}
        <button type="button" className="font-medium text-[var(--ap-accent)] hover:underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    )
  }
  const data = query.data
  if (!data) return null

  if (!data.package) {
    return (
      <>
        <NoPackage data={data} className={className} onCreate={() => setEditOpen(true)} />
        {data.permissions.canCreate && (
          <PackageEditModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            userId={userId}
            timeframeId={timeframeId}
            allowWeights={data.permissions.canViewWeights}
          />
        )}
      </>
    )
  }

  const pkg = data.package
  const { permissions, summary } = data
  const progress = summary.total > 0 ? Math.round((summary.reviewed / summary.total) * 100) : 0
  const approveBlocked = summary.disputesOpen > 0

  const confirm = async () => {
    try {
      if (pending === 'submit') await submit.mutateAsync(pkg.id)
      else if (pending === 'approve') await approve.mutateAsync(pkg.id)
      else if (pending === 'archive') await update.mutateAsync({ id: pkg.id, body: { status: 'ARCHIVED' } })
      else if (pending === 'reopen') await update.mutateAsync({ id: pkg.id, body: { status: 'DRAFT' } })
      setPending(null)
    } catch {
      // Toast shown by the hook.
    }
  }
  const busy = submit.isPending || approve.isPending || update.isPending

  return (
    <section className={cn(cardClass, 'space-y-4', className)} aria-label="Operating package">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Eyebrow>Operating package{data.timeframeName ? ` · ${data.timeframeName}` : ''}</Eyebrow>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-section-title font-semibold text-[var(--ap-fg)]">{pkg.seatTitle || 'Operating package'}</h3>
            <span className="text-body-sm font-medium tabular-nums text-[var(--ap-fg-muted)]">{pkg.version}</span>
            <PackageStatusBadge status={pkg.status} />
          </div>
          <StatusLine pkg={pkg} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.canSubmit && (
            <Button size="sm" onClick={() => setPending('submit')} disabled={busy}>
              <Send aria-hidden />
              Send for review
            </Button>
          )}
          {permissions.canApprove && (
            <Button
              size="sm"
              variant={permissions.canSubmit ? 'outline' : 'default'}
              onClick={() => setPending('approve')}
              disabled={busy || approveBlocked}
              title={approveBlocked ? 'Resolve every open dispute before approving' : undefined}
            >
              <BadgeCheck aria-hidden />
              Approve
            </Button>
          )}
          {permissions.canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>
              <Pencil aria-hidden />
              Edit
            </Button>
          )}
          {(permissions.canReopen || permissions.canArchive) && (
          <ActionsMenu
            label="More package actions"
            items={[
              {
                key: 'reopen',
                label: pkg.status === 'APPROVED' ? `Reopen as ${nextPackageVersion(pkg.version)}` : 'Move back to draft',
                icon: RotateCcw,
                onSelect: () => setPending('reopen'),
                hidden: !permissions.canReopen,
              },
              {
                key: 'archive',
                label: 'Archive package',
                icon: Archive,
                onSelect: () => setPending('archive'),
                hidden: !permissions.canArchive,
                destructive: true,
              },
            ]}
          />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
          <span className="font-medium text-[var(--ap-fg)]">{formatReviewSummary(summary)}</span>
          {summary.reviewed > 0 && (
            <span className="text-caption text-[var(--ap-fg-subtle)]">
              {summary.agreed} agreed · {summary.disputed} disputed
            </span>
          )}
        </div>
        <Progress
          value={progress}
          fill={summary.disputesOpen > 0 ? 'var(--ap-warn)' : 'var(--ap-ok)'}
          aria-label={`${summary.reviewed} of ${summary.total} items reviewed`}
        />
        {permissions.canReview && (
          <p className="text-caption text-[var(--ap-fg-muted)]">
            Mark each item on the tabs below Agree or Dispute. A dispute needs a short comment.
          </p>
        )}
      </div>

      {pkg.weights && (
        <div className="space-y-1.5">
          <Eyebrow>Performance mix</Eyebrow>
          <WeightsMix weights={pkg.weights} />
        </div>
      )}

      {pkg.summaryLines.length > 0 && (
        <div className="space-y-1.5">
          <Eyebrow>The numbers this package commits to</Eyebrow>
          <ul className="list-disc space-y-0.5 pl-5 text-body-sm text-[var(--ap-fg)]">
            {pkg.summaryLines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.disputesOpen > 0 && <PackageDisputesList packageId={pkg.id} />}

      {permissions.canEdit && (
        <PackageEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          pkg={pkg}
          userId={userId}
          timeframeId={timeframeId}
          allowWeights={permissions.canEditWeights}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => !busy && setPending(null)}
        onConfirm={confirm}
        isLoading={busy}
        {...confirmCopy(pending, pkg, summary.total)}
      />
    </section>
  )
}

function StatusLine({ pkg }: { pkg: OperatingPackageDTO }) {
  let text = ''
  if (pkg.status === 'APPROVED' && pkg.approvedAt) {
    text = `Approved${pkg.approvedBy ? ` by ${pkg.approvedBy.name}` : ''} on ${fmtDate(pkg.approvedAt)}`
  } else if (pkg.status === 'IN_REVIEW' && pkg.submittedAt) {
    text = `Sent for review on ${fmtDate(pkg.submittedAt)}`
  } else if (pkg.status === 'DRAFT') {
    text = 'Draft — not yet sent to the employee'
  } else if (pkg.status === 'ARCHIVED') {
    text = 'Archived'
  }
  if (!text) return null
  return <p className="text-caption text-[var(--ap-fg-subtle)]">{text}</p>
}

function NoPackage({
  data,
  className,
  onCreate,
}: {
  data: OperatingPackageResponse
  className?: string
  onCreate: () => void
}) {
  return (
    <section
      className={cn(cardClass, 'flex flex-wrap items-center justify-between gap-3', className)}
      aria-label="Operating package"
    >
      <div className="flex min-w-0 items-start gap-3">
        <PackageOpen className="mt-0.5 size-5 shrink-0 text-[var(--ap-fg-subtle)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-[var(--ap-fg)]">
            No package for {data.timeframeName ? data.timeframeName : 'this timeframe'}
          </p>
          <p className="text-caption text-[var(--ap-fg-muted)]">
            Every tab still works. A package adds a version, a performance mix and the Agree / Dispute review.
          </p>
        </div>
      </div>
      {data.permissions.canCreate && (
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus aria-hidden />
          Create package
        </Button>
      )}
    </section>
  )
}

function confirmCopy(
  action: PendingAction,
  pkg: OperatingPackageDTO,
  total: number,
): {
  title: string
  message: string
  description?: string
  confirmLabel: string
  loadingLabel: string
  variant: 'danger' | 'warning' | 'info'
} {
  switch (action) {
    case 'submit':
      return {
        title: 'Send for review',
        message: `Send ${pkg.version} to the employee for review?`,
        description: `They will be notified and asked to mark each of the ${total} item${total === 1 ? '' : 's'} Agree or Dispute.`,
        confirmLabel: 'Send for review',
        loadingLabel: 'Sending…',
        variant: 'info',
      }
    case 'approve':
      return {
        title: 'Approve package',
        message: `Approve ${pkg.version} of this operating package?`,
        description: 'Later edits stay possible and are logged as "edited after approval" in the package history.',
        confirmLabel: 'Approve',
        loadingLabel: 'Approving…',
        variant: 'info',
      }
    case 'archive':
      return {
        title: 'Archive package',
        message: 'Archive this operating package?',
        description: 'Archive it when the timeframe closes. It stays readable and can be reopened.',
        confirmLabel: 'Archive',
        loadingLabel: 'Archiving…',
        variant: 'warning',
      }
    case 'reopen':
      return {
        title: 'Reopen package',
        message:
          pkg.status === 'APPROVED'
            ? `Reopen as ${nextPackageVersion(pkg.version)}? The approval is cleared and it goes back to draft.`
            : 'Move this package back to draft?',
        description: 'Existing Agree / Dispute reviews are kept.',
        confirmLabel: 'Reopen',
        loadingLabel: 'Reopening…',
        variant: 'warning',
      }
    default:
      return { title: '', message: '', confirmLabel: 'Confirm', loadingLabel: 'Working…', variant: 'info' }
  }
}
