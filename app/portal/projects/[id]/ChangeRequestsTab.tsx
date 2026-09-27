import { CheckCircle2, GitPullRequestArrow } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { ClientChangeRequest } from '@/features/projects/services/portal-serializer'

const TYPE_LABEL: Record<string, string> = {
  SCOPE_ADD: 'Scope add',
  REQUIREMENT_CHANGE: 'Requirement change',
  DESCOPE: 'Descope',
}

const STATUS_TONE: Record<string, string> = {
  SUBMITTED: 'bg-warning-50 text-warning-700',
  UNDER_REVIEW: 'bg-primary-50 text-primary-700',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
  IMPLEMENTED: 'bg-surface-muted text-ink-secondary',
}

/**
 * Portal "Change Requests" tab. Renders DTOs that already went through the
 * portal serializer: only CLIENT_VISIBLE rows (SQL filter, invariant 5), the
 * requester as a party label and no approver identity or cost (invariant 4).
 */
export default function ChangeRequestsTab({ rows }: { rows: readonly ClientChangeRequest[] }) {
  const approvedImpact = rows
    .filter((row) => row.status === 'APPROVED' || row.status === 'IMPLEMENTED')
    .reduce((sum, row) => sum + Math.max(0, row.scheduleImpactDays), 0)
  const pending = rows.filter((row) => row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW').length

  return (
    <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section-title text-ink-primary">Change Requests</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">Scope and requirement changes the project team has shared with you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-caption font-medium text-ink-secondary">{pending} under review</span>
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-caption font-medium text-ink-secondary">+{approvedImpact}d approved schedule impact</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState bare className="mt-4" icon={<GitPullRequestArrow className="size-6" />} title="No change requests shared yet" />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-body-sm">
            <thead className="text-ink-tertiary">
              <tr className="border-b border-ink-primary/[0.08]">
                <th className="py-2 pr-4 font-semibold">CR</th>
                <th className="py-2 pr-4 font-semibold">Request</th>
                <th className="py-2 pr-4 font-semibold">Requested by</th>
                <th className="whitespace-nowrap py-2 pr-4 font-semibold">Requested</th>
                <th className="py-2 pr-4 font-semibold">Schedule impact</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 font-semibold">Sign-off</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink-primary/[0.06] align-top last:border-0">
                  <td className="whitespace-nowrap py-3 pr-4 font-semibold text-ink-primary">{row.crCode}</td>
                  <td className="max-w-md py-3 pr-4">
                    <div className="font-medium text-ink-primary">{row.title}</div>
                    <div className="text-xs text-ink-tertiary">{TYPE_LABEL[row.type] ?? formatConstant(row.type)}</div>
                    <p className="mt-1 text-body-sm text-ink-secondary">{row.description}</p>
                    {row.status === 'REJECTED' && row.rejectionReason && (
                      <p className="mt-1 text-xs text-danger-700">Reason: {row.rejectionReason}</p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ink-secondary">{row.requestedBy}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">{formatShortDate(row.requestDate)}</td>
                  <td className="py-3 pr-4 text-ink-secondary">
                    <span className="tabular-nums font-semibold text-ink-primary">+{row.scheduleImpactDays}d</span>
                    {row.affectedActivityCount > 0 && <div className="text-xs text-ink-tertiary">{row.affectedActivityCount} activities</div>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={cn('rounded-pill px-2 py-0.5 text-xs font-medium', STATUS_TONE[row.status] ?? 'bg-surface-muted text-ink-secondary')}>
                      {formatConstant(row.status)}
                    </span>
                    {row.decisionDate && <div className="mt-1 text-xs text-ink-tertiary">{formatShortDate(row.decisionDate)}</div>}
                  </td>
                  <td className="py-3 pr-4">
                    {row.clientSignOff ? (
                      <span className="inline-flex items-center gap-1 text-success-700"><CheckCircle2 className="size-3.5" /> Signed</span>
                    ) : (
                      <span className="text-ink-tertiary">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatShortDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatConstant(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}
