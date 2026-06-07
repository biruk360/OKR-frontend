'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
  userName: string
  onClose: () => void
}

interface EffectivePermission {
  doctypeKey: string
  featureKey: string
  action: string
  allowed: boolean
  source: string
  scope?: string | null
}

interface PreviewData {
  visibleFeatures: string[]
  hiddenFeatures: string[]
  effectivePermissions: EffectivePermission[]
}

const MODULE_LABELS: Record<string, string> = {
  'module.okr': 'OKR',
  'module.letters': 'Letters',
  'module.dtp': 'Travel',
  'module.reports': 'Reports & Analytics',
  'module.admin': 'Administration',
  'module.settings': 'Settings',
  'module.org': 'People & Org',
}

const ALL_MODULES = Object.keys(MODULE_LABELS)

const COMMON_DOCTYPES = [
  'Objective',
  'KeyResult',
  'Todo',
  'Comment',
  'Department',
  'User',
  'Timeframe',
  'Sprint',
  'ActivityLog',
  'Letter',
  'TravelRequest',
  'Report',
]

const ACTIONS = ['read', 'write', 'create', 'delete', 'submit', 'export', 'approve']

const TABLE_ACTIONS = ['read', 'write', 'create', 'delete', 'submit'] as const

function getModulePages(feature: string, allFeatures: string[]): string[] {
  const prefix = feature + '.'
  return allFeatures.filter((f) => f.startsWith(prefix) && !f.startsWith('module.'))
}

function pageLabel(feature: string): string {
  const parts = feature.split('.')
  return parts[parts.length - 1]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function EffectivePermissionsPreview({ userId, userName, onClose }: Props) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedDoctype, setSelectedDoctype] = useState('')
  const [selectedAction, setSelectedAction] = useState('')
  const [checkResult, setCheckResult] = useState<string | null>(null)

  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/permissions/preview/${userId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load preview data')
        const json = await res.json()
        setPreviewData(json.data ?? json)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load preview'))
      .finally(() => setLoading(false))
  }, [userId])

  const toggleModule = (mod: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  const handleCheck = () => {
    if (!selectedDoctype || !selectedAction || !previewData) return

    const perms = previewData.effectivePermissions.filter(
      (p) => p.doctypeKey === selectedDoctype && p.action === selectedAction,
    )

    const allowed = perms.find((p) => p.allowed)
    const denied = perms.find((p) => !p.allowed)
    const scoped = allowed?.scope

    if (allowed) {
      if (scoped) {
        const roleName = allowed.source || 'an active role'
        setCheckResult(`warn:${userName} CAN ${selectedAction} ${selectedDoctype} but record scoping applies (${scoped} filter). Granted by '${roleName}'.`)
      } else {
        const roleName = allowed.source || 'an active role'
        setCheckResult(`ok:${userName} CAN ${selectedAction} ${selectedDoctype} because Role '${roleName}' grants it.`)
      }
    } else if (denied) {
      setCheckResult(`no:${userName} CANNOT ${selectedAction} ${selectedDoctype}. No active role grants this permission.`)
    } else {
      setCheckResult(`no:${userName} CANNOT ${selectedAction} ${selectedDoctype}. No active role grants this permission.`)
    }
  }

  const groupedByDoctype = (() => {
    if (!previewData) return new Map<string, Record<string, EffectivePermission>>()
    const map = new Map<string, Record<string, EffectivePermission>>()
    for (const p of previewData.effectivePermissions) {
      if (!map.has(p.doctypeKey)) map.set(p.doctypeKey, {})
      map.get(p.doctypeKey)![p.action] = p
    }
    return map
  })()

  const doctypeModuleGroup = (() => {
    const groups: Record<string, string[]> = {}
    for (const [doctype] of groupedByDoctype) {
      const mod = doctype.toLowerCase().startsWith('letter')
        ? 'module.letters'
        : doctype.toLowerCase().startsWith('travel')
        ? 'module.dtp'
        : doctype.toLowerCase().startsWith('report')
        ? 'module.reports'
        : doctype === 'User' || doctype === 'Department'
        ? 'module.org'
        : 'module.okr'
      if (!groups[mod]) groups[mod] = []
      groups[mod].push(doctype)
    }
    return groups
  })()

  const allFeatures = previewData
    ? [...previewData.visibleFeatures, ...previewData.hiddenFeatures]
    : []

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border border-border w-full max-w-3xl max-h-screen overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-base font-semibold text-foreground">
            Previewing as{' '}
            <span className="text-blue-600">{userName}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading preview…</span>
          </div>
        )}

        {error && !loading && (
          <div className="px-6 py-4 text-sm text-red-600 bg-red-50 border-b border-red-200">
            {error}
          </div>
        )}

        {!loading && !error && previewData && (
          <div className="px-6 py-5 space-y-8">
            {/* Nav Preview */}
            <section>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                Navigation Preview
              </h3>
              <div className="rounded-md border border-border bg-muted/40 divide-y divide-border overflow-hidden">
                {ALL_MODULES.map((mod) => {
                  const isVisible = previewData.visibleFeatures.includes(mod)
                  const visiblePages = getModulePages(mod, previewData.visibleFeatures)
                  const collapsed = collapsedModules.has(mod)

                  return (
                    <div key={mod}>
                      <button
                        onClick={() => isVisible && toggleModule(mod)}
                        className={cn(
                          'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors',
                          isVisible
                            ? 'hover:bg-muted cursor-pointer'
                            : 'cursor-default opacity-60',
                        )}
                      >
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full shrink-0',
                            isVisible ? 'bg-green-500' : 'bg-muted-foreground/40',
                          )}
                        />
                        <span
                          className={cn(
                            'flex-1 font-medium',
                            isVisible ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {MODULE_LABELS[mod]}
                        </span>
                        {isVisible && visiblePages.length > 0 && (
                          collapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {!isVisible && (
                          <span className="text-xs text-muted-foreground">hidden</span>
                        )}
                      </button>

                      {isVisible && !collapsed && visiblePages.length > 0 && (
                        <div className="pl-8 pb-1.5 space-y-0.5">
                          {visiblePages.map((page) => (
                            <div
                              key={page}
                              className="px-3 py-1 text-xs text-muted-foreground flex items-center gap-2"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                              {pageLabel(page)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Why can/can't they do X */}
            <section>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                Why can / can't they do X?
              </h3>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-medium">DocType</label>
                  <select
                    value={selectedDoctype}
                    onChange={(e) => { setSelectedDoctype(e.target.value); setCheckResult(null) }}
                    className="rounded border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-w-[160px]"
                  >
                    <option value="">Select DocType…</option>
                    {COMMON_DOCTYPES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-medium">Action</label>
                  <select
                    value={selectedAction}
                    onChange={(e) => { setSelectedAction(e.target.value); setCheckResult(null) }}
                    className="rounded border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-w-[120px]"
                  >
                    <option value="">Select action…</option>
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleCheck}
                  disabled={!selectedDoctype || !selectedAction}
                  className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Check
                </button>
              </div>

              {checkResult && (() => {
                const [type, ...rest] = checkResult.split(':')
                const message = rest.join(':')
                return (
                  <div
                    className={cn(
                      'mt-3 rounded-md px-4 py-3 text-sm font-medium',
                      type === 'ok' && 'bg-green-50 text-green-800 border border-green-200',
                      type === 'no' && 'bg-red-50 text-red-800 border border-red-200',
                      type === 'warn' && 'bg-amber-50 text-amber-800 border border-amber-200',
                    )}
                  >
                    {type === 'ok' && '✅ '}
                    {type === 'no' && '❌ '}
                    {type === 'warn' && '⚠️ '}
                    {message}
                  </div>
                )
              })()}
            </section>

            {/* DocType Permissions Table */}
            <section>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                DocType Permissions
              </h3>

              {groupedByDoctype.size === 0 ? (
                <p className="text-sm text-muted-foreground">No permissions data available.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(doctypeModuleGroup).map(([mod, doctypes]) => {
                    const allHidden = doctypes.every((dt) =>
                      TABLE_ACTIONS.every((a) => !groupedByDoctype.get(dt)?.[a]?.allowed),
                    )
                    const modCollapsed = collapsedModules.has(`perm-${mod}`)

                    return (
                      <div key={mod} className="rounded-md border border-border overflow-hidden">
                        <button
                          onClick={() => toggleModule(`perm-${mod}`)}
                          className={cn(
                            'w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                            allHidden
                              ? 'bg-muted/50 text-muted-foreground'
                              : 'bg-muted text-foreground hover:bg-muted/70',
                          )}
                        >
                          {modCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />
                          }
                          {MODULE_LABELS[mod] ?? mod}
                          {allHidden && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground normal-case tracking-normal">
                              (all denied)
                            </span>
                          )}
                        </button>

                        {!modCollapsed && (
                          <table className="min-w-full divide-y divide-border text-sm">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">DocType</th>
                                {TABLE_ACTIONS.map((a) => (
                                  <th key={a} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    {a}
                                  </th>
                                ))}
                                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Scope</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                              {doctypes.map((dt) => {
                                const row = groupedByDoctype.get(dt) ?? {}
                                return (
                                  <tr key={dt}>
                                    <td className="px-4 py-2 font-medium text-foreground text-sm">{dt}</td>
                                    {TABLE_ACTIONS.map((a) => {
                                      const perm = row[a]
                                      return (
                                        <td key={a} className="px-3 py-2 text-center">
                                          {perm == null ? (
                                            <span className="text-muted-foreground/40 text-xs">—</span>
                                          ) : perm.allowed ? (
                                            <span className="inline-block h-3.5 w-3.5 rounded-full bg-green-500 mx-auto" title="Allowed" />
                                          ) : (
                                            <span className="inline-block h-3.5 w-3.5 rounded-full bg-red-400/60 mx-auto" title="Denied" />
                                          )}
                                        </td>
                                      )
                                    })}
                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                      {Object.values(row).find((p) => p.scope)?.scope ?? '—'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
