'use client'

/**
 * The card's activity log, grouped by day. Split out of TodoCardModal.tsx;
 * behaviour unchanged.
 */

import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'
import { Avatar } from './CardModalBits'
import type { ActivityLogData, LabelDef } from './cardModalTypes'

function formatActivity(
  log: ActivityLogData,
  users: { id: string; name: string | null }[],
  labelDefs: LabelDef[],
): string {
  const userName = (id: unknown) => users.find((u) => u.id === id)?.name ?? 'someone'
  const labelName = (id: unknown) => labelDefs.find((l) => l.id === id)?.name ?? 'a label'
  const m = log.metadata ?? {}
  const c = log.changes ?? {}
  switch (log.action) {
    case 'INITIATIVE_CREATED': return 'created this card'
    case 'INITIATIVE_STATUS_CHANGED': {
      const ch = c.status as { from?: unknown; to?: unknown } | undefined
      return `changed status from "${String(ch?.from ?? '')}" to "${String(ch?.to ?? '')}"`
    }
    case 'INITIATIVE_ASSIGNEE_CHANGED': {
      const ch = c.assigneeId as { from?: unknown; to?: unknown } | undefined
      return `changed assignee to ${userName(ch?.to)}`
    }
    case 'INITIATIVE_MEMBER_ADDED': return `added ${userName((m as { userId?: unknown }).userId)} as a member`
    case 'INITIATIVE_MEMBER_REMOVED': return `removed ${userName((m as { userId?: unknown }).userId)} as a member`
    case 'INITIATIVE_LABEL_ADDED': return `added label "${labelName((m as { labelDefId?: unknown }).labelDefId)}"`
    case 'INITIATIVE_LABEL_REMOVED': return `removed label "${labelName((m as { labelDefId?: unknown }).labelDefId)}"`
    case 'INITIATIVE_CHECKLIST_CREATED': return `added checklist "${String((m as { title?: unknown }).title ?? '')}"`
    case 'INITIATIVE_CHECKLIST_ITEM_TOGGLED': {
      const completed = (m as { completed?: boolean }).completed
      const title = String((m as { title?: unknown }).title ?? 'an item')
      return `${completed ? 'completed' : 'reopened'} "${title}"`
    }
    case 'INITIATIVE_ATTACHMENT_ADDED': return `attached ${String((m as { filename?: unknown }).filename ?? 'a file')}`
    case 'INITIATIVE_COMMENTED': return 'commented'
    case 'UPDATED': {
      const fields = Object.keys(c)
      if (fields.length === 0) return 'updated this card'
      return `updated ${fields.join(', ')}`
    }
    default: return log.action.replace(/_/g, ' ').toLowerCase()
  }
}

function activityDateGroup(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

export function ActivityFeed({
  logs,
  users,
  labelDefs,
}: {
  logs: ActivityLogData[]
  users: { id: string; name: string | null }[]
  labelDefs: LabelDef[]
}) {
  if (logs.length === 0) {
    return (
      <div className="rounded-[var(--ap-radius-md)] border border-dashed border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-4 py-8 text-center">
        <p className="text-body-sm font-semibold text-[var(--ap-fg)]">No activity yet</p>
        <p className="mt-1 text-xs text-[var(--ap-fg-subtle)]">Changes to this card will appear here.</p>
      </div>
    )
  }
  // Group by date label, preserving order
  const groups: { label: string; entries: ActivityLogData[] }[] = []
  for (const log of logs) {
    const label = activityDateGroup(log.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(log)
    else groups.push({ label, entries: [log] })
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-micro font-semibold uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)]">{g.label}</p>
          <ol className="space-y-2">
            {g.entries.map((log) => (
              <li key={log.id} className="flex items-start gap-2.5">
                <Avatar id={log.actor?.id} name={log.actor?.name ?? 'System'} avatar={log.actor?.avatar} size={24} />
                <div className="flex-1 min-w-0 text-xs text-[var(--ap-fg)]">
                  <span className="font-semibold">{log.actor?.name ?? 'System'}</span>{' '}
                  <span className="text-[var(--ap-fg-muted)]">{formatActivity(log, users, labelDefs)}</span>
                </div>
                <span className="shrink-0 text-caption text-[var(--ap-fg-faint)]">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
