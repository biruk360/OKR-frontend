'use client'

import { useState, useMemo } from 'react'
import { Search, Calendar, Shield, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActivityLogActor {
  id: string
  name: string | null
  email: string | null
}

interface ActivityLogEntry {
  id: string
  entityType: string
  action: string
  actorId: string | null
  changes: unknown | null
  metadata: unknown | null
  createdAt: Date | string
  actor?: ActivityLogActor | null
}

interface AuditLogsViewProps {
  initialLogs: ActivityLogEntry[]
}

// ─── Category definitions ─────────────────────────────────────────────────────

type Category = 'All' | 'OKR' | 'Letters' | 'DTP' | 'Sprints' | 'Permissions' | 'System'

const CATEGORIES: Category[] = ['All', 'OKR', 'Letters', 'DTP', 'Sprints', 'Permissions', 'System']

const CATEGORY_ENTITY_TYPES: Record<Exclude<Category, 'All' | 'System'>, string[]> = {
  OKR: ['OBJECTIVE', 'KEY_RESULT', 'objective', 'key_result', 'key_result_check_in'],
  Letters: ['LETTER', 'letter', 'letter_enclosure'],
  DTP: ['daily_trip_plan', 'trip_stop', 'dtp_event', 'DTP'],
  Sprints: ['SPRINT', 'sprint'],
  Permissions: [
    'role',
    'user_role',
    'role_doctype_permission',
    'feature_permission',
    'user_permission_override',
    'record_scope_rule',
    'migration',
  ],
}

function getCategory(entityType: string): Exclude<Category, 'All'> {
  for (const [cat, types] of Object.entries(CATEGORY_ENTITY_TYPES)) {
    if (types.includes(entityType)) return cat as Exclude<Category, 'All'>
  }
  return 'System'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatChangesPreview(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return '—'
  const entries = Object.entries(changes as Record<string, unknown>)
  if (entries.length === 0) return '—'
  const preview = entries.slice(0, 2).map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    const truncated = val.length > 40 ? `${val.slice(0, 40)}…` : val
    return `${k}: ${truncated}`
  })
  const suffix = entries.length > 2 ? ` +${entries.length - 2} more` : ''
  return preview.join(', ') + suffix
}

function actionBadgeClass(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('create') || a.includes('add') || a.includes('insert')) {
    return 'bg-success-subtle text-success-foreground'
  }
  if (a.includes('delete') || a.includes('remove') || a.includes('archive')) {
    return 'bg-danger-subtle text-danger-foreground'
  }
  if (a.includes('update') || a.includes('edit') || a.includes('change')) {
    return 'bg-warning-subtle text-warning-foreground'
  }
  return 'bg-muted text-muted-foreground'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditLogsView({ initialLogs }: AuditLogsViewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category>('All')

  const filteredLogs = useMemo(() => {
    let result = initialLogs

    // Category filter
    if (activeCategory !== 'All') {
      result = result.filter((log) => getCategory(log.entityType) === activeCategory)
    }

    // Search filter — entityType, action, actor name/email
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (log) =>
          log.entityType.toLowerCase().includes(term) ||
          log.action.toLowerCase().includes(term) ||
          (log.actor?.name?.toLowerCase().includes(term) ?? false) ||
          (log.actor?.email?.toLowerCase().includes(term) ?? false),
      )
    }

    return result
  }, [initialLogs, activeCategory, searchTerm])

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      All: initialLogs.length,
      OKR: 0,
      Letters: 0,
      DTP: 0,
      Sprints: 0,
      Permissions: 0,
      System: 0,
    }
    for (const log of initialLogs) {
      const cat = getCategory(log.entityType)
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return counts
  }, [initialLogs])

  const isPermission = (entityType: string) => getCategory(entityType) === 'Permissions'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Security and compliance log of admin and system actions.
        </p>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={[
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors',
              activeCategory === cat
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            ].join(' ')}
          >
            {cat === 'Permissions' && <Shield className="h-3.5 w-3.5" />}
            {cat}
            <span
              className={[
                'ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
                activeCategory === cat
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {categoryCounts[cat]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by entity type, action, or actor…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 input w-full"
          />
        </div>
      </div>

      {/* Table */}
      {filteredLogs.length > 0 ? (
        <div className="bg-card shadow rounded-lg overflow-hidden border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Entity Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                    {/* Timestamp */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        {formatDate(new Date(log.createdAt), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </td>

                    {/* Actor */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground font-medium">
                          {log.actor?.name ?? 'System'}
                        </span>
                        {log.actor?.email && (
                          <span className="text-muted-foreground text-xs hidden sm:inline">
                            ({log.actor.email})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Entity Type */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="inline-flex items-center gap-1 font-mono text-xs bg-muted px-2 py-0.5 rounded">
                        {isPermission(log.entityType) && (
                          <Shield className="h-3 w-3 text-primary shrink-0" />
                        )}
                        {log.entityType}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={[
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          actionBadgeClass(log.action),
                        ].join(' ')}
                      >
                        {log.action}
                      </span>
                    </td>

                    {/* Details */}
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs">
                      <span
                        className="block truncate font-mono text-xs"
                        title={
                          log.changes
                            ? JSON.stringify(log.changes, null, 2)
                            : log.metadata
                              ? JSON.stringify(log.metadata, null, 2)
                              : undefined
                        }
                      >
                        {formatChangesPreview(log.changes ?? log.metadata)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer row count */}
          <div className="px-6 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            Showing {filteredLogs.length} of {initialLogs.length} entries
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Shield}
          title="No audit logs found"
          description={
            searchTerm || activeCategory !== 'All'
              ? 'Try adjusting your search or category filter.'
              : 'Audit logs will appear here as actions are performed.'
          }
        />
      )}
    </div>
  )
}
