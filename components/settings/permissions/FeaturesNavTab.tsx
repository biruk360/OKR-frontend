'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Loader2, ToggleLeft, ToggleRight, Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingsSelect } from '../SettingsSelect'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Role {
  id: string
  name: string
  label: string
}

interface FeaturePermission {
  id: string
  roleId: string
  featureKey: string
  visible: boolean
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Module → child feature hierarchy for cascade-hide
// ---------------------------------------------------------------------------

const MODULE_CHILDREN: Record<string, string[]> = {
  'module.letters': [
    'page.letters',
    'page.letters.detail',
    'button.letter.create',
    'button.letter.submit',
    'button.letter.approve',
    'button.letter.reject',
    'button.letter.send',
    'button.letter.archive',
    'button.letter.delete',
    'button.letter.admin',
    'tab.letter.enclosures',
    'tab.letter.pdf-preview',
  ],
  'module.dtp': [
    'page.dtp.home',
    'page.dtp.plan',
    'page.dtp.console',
    'page.dtp.sheet',
    'page.dtp.runsheet',
    'page.dtp.pool',
    'button.dtp.approve',
    'button.dtp.reject',
    'button.dtp.assign-driver',
    'button.dtp.endorse',
  ],
  'module.reports': ['page.reports', 'page.initiative-report', 'page.analytics'],
  'module.admin': ['page.admin.ai-logs', 'page.admin.org-settings', 'page.admin.telegram'],
  'module.settings': [
    'page.settings',
    'page.settings.profile',
    'page.settings.account',
    'page.settings.notifications',
    'page.settings.notification-defaults',
    'page.settings.users',
    'page.settings.teams',
    'page.settings.timeframes',
    'page.settings.okr-rules',
    'page.settings.branding',
    'page.settings.integrations',
    'page.settings.audit-logs',
    'page.settings.letter-permissions',
    'page.settings.permissions',
    'page.settings.travel',
  ],
  'module.org': ['page.org.teams', 'page.org.users', 'page.profile'],
  'module.performance': [
    'page.performance.my',
    'page.performance.evaluations',
    'page.performance.score',
    'page.performance.calibration',
    'page.performance.cycles',
    'page.performance.templates',
    'page.performance.actions',
    'page.settings.performance',
    'button.performance.template.create',
    'button.performance.template.edit',
    'button.performance.template.publish',
    'button.performance.template.archive',
    'button.performance.template.fork',
    'button.performance.template.map-role',
    'button.performance.template.map-metric',
    'button.performance.cycle.create',
    'button.performance.cycle.open',
    'button.performance.cycle.close',
    'button.performance.panel.manage',
    'button.performance.score.save',
    'button.performance.score.submit',
    'button.performance.calibration.resolve',
    'button.performance.draft.share',
    'button.performance.evaluation.finalize',
    'button.performance.report.acknowledge',
    'button.performance.report.dispute',
    'button.performance.action.approve',
    'button.performance.action.reject',
    'button.performance.action.execute',
  ],
}

/** Return the set of child featureKeys for a module key, or [] if not a module. */
function getChildren(featureKey: string): string[] {
  return MODULE_CHILDREN[featureKey] ?? []
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function keyPrefix(key: string) {
  if (key.startsWith('module.')) return 'module'
  if (key.startsWith('page.')) return 'page'
  if (key.startsWith('button.')) return 'button'
  if (key.startsWith('tab.')) return 'tab'
  return 'other'
}

type GroupKey = 'module' | 'page' | 'button' | 'tab' | 'other'

const GROUP_ORDER: GroupKey[] = ['module', 'page', 'button', 'tab', 'other']

function groupLabel(g: GroupKey) {
  switch (g) {
    case 'module':  return 'Modules'
    case 'page':    return 'Pages'
    case 'button':  return 'Buttons & Actions'
    case 'tab':     return 'Tabs'
    default:        return 'Other'
  }
}

function groupColor(g: GroupKey) {
  switch (g) {
    case 'module':  return 'bg-success-100 text-success-700'
    case 'page':    return 'bg-primary-100 text-primary-700'
    case 'button':  return 'bg-ink-primary/10 text-ink-primary'
    case 'tab':     return 'bg-warning-100 text-warning-700'
    default:        return 'bg-surface-app text-ink-secondary'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FeaturesNavTab() {
  const [roles, setRoles]                     = useState<Role[]>([])
  const [selectedRoleId, setSelectedRoleId]   = useState<string>('')
  const [permissions, setPermissions]         = useState<FeaturePermission[]>([])
  const [rolesLoading, setRolesLoading]       = useState(true)
  const [featuresLoading, setFeaturesLoading] = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [cascadeNote, setCascadeNote]         = useState(false)

  // Fetch roles once on mount
  useEffect(() => {
    fetch('/api/permissions/roles')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const roleList: Role[] = res.data
          setRoles(roleList)
          if (roleList.length > 0) setSelectedRoleId(roleList[0].id)
        } else {
          setError(res.error ?? 'Failed to load roles')
        }
      })
      .catch(() => setError('Failed to load roles'))
      .finally(() => setRolesLoading(false))
  }, [])

  // Fetch features whenever the selected role changes
  useEffect(() => {
    if (!selectedRoleId) return
    setFeaturesLoading(true)
    setError(null)
    setPermissions([])
    setCascadeNote(false)

    fetch(`/api/permissions/roles/${encodeURIComponent(selectedRoleId)}/features`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setPermissions(res.data.features ?? [])
        } else {
          setError(res.error ?? 'Failed to load feature permissions')
        }
      })
      .catch(() => setError('Failed to load feature permissions'))
      .finally(() => setFeaturesLoading(false))
  }, [selectedRoleId])

  // Helper: get a permission row by featureKey (may not exist yet — defaults visible=true, enabled=true)
  const getPerm = useCallback(
    (featureKey: string): FeaturePermission => {
      return (
        permissions.find(p => p.featureKey === featureKey) ?? {
          id: '',
          roleId: selectedRoleId,
          featureKey,
          visible: true,
          enabled: true,
        }
      )
    },
    [permissions, selectedRoleId]
  )

  // Toggle a single feature's `visible` field, then bulk-save all permissions
  const toggleVisible = useCallback(
    async (featureKey: string) => {
      const current = getPerm(featureKey)
      const newVisible = !current.visible

      // Build updated permissions map, applying cascade if this is a module
      setPermissions(prev => {
        const childKeys = getChildren(featureKey)
        const isModuleOff = featureKey.startsWith('module.') && !newVisible

        // Keys we need to ensure exist in our local state
        const allKeys = new Set<string>([
          ...prev.map(p => p.featureKey),
          featureKey,
          ...(isModuleOff ? childKeys : []),
        ])

        const merged = Array.from(allKeys).map(key => {
          const existing = prev.find(p => p.featureKey === key) ?? {
            id: '',
            roleId: selectedRoleId,
            featureKey: key,
            visible: true,
            enabled: true,
          }
          if (key === featureKey) return { ...existing, visible: newVisible }
          if (isModuleOff && childKeys.includes(key)) return { ...existing, visible: false }
          return existing
        })

        return merged
      })

      if (featureKey.startsWith('module.') && !newVisible) {
        setCascadeNote(true)
      }

      // After state update, save the full current set via bulk PUT
      // We read permissions directly from the setter callback above — so we
      // need to fire save after React flushes. Use a micro-task.
      setSaving(true)
      setError(null)

      // Build the payload from the latest local state synchronously
      // (we capture the to-be state inline here since setPermissions is async)
      const childKeys = getChildren(featureKey)
      const isModuleOff = featureKey.startsWith('module.') && !newVisible

      const latestPerms = (() => {
        const allKeys = new Set<string>([
          ...permissions.map(p => p.featureKey),
          featureKey,
          ...(isModuleOff ? childKeys : []),
        ])
        return Array.from(allKeys).map(key => {
          const existing = permissions.find(p => p.featureKey === key) ?? {
            featureKey: key,
            visible: true,
            enabled: true,
          }
          if (key === featureKey) return { ...existing, visible: newVisible }
          if (isModuleOff && childKeys.includes(key)) return { ...existing, visible: false }
          return existing
        })
      })()

      try {
        const res = await fetch(
          `/api/permissions/roles/${encodeURIComponent(selectedRoleId)}/features`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              features: latestPerms.map(p => ({
                featureKey: p.featureKey,
                visible: p.visible,
                enabled: p.enabled ?? true,
              })),
            }),
          }
        )
        const json = await res.json()
        if (!json.success) {
          setError(json.error ?? 'Failed to save')
          // Revert the toggled key
          setPermissions(prev =>
            prev.map(p =>
              p.featureKey === featureKey ? { ...p, visible: current.visible } : p
            )
          )
        } else {
          // Sync server-returned rows (they have real DB ids)
          setPermissions(json.data.features ?? [])
        }
      } catch {
        setError('Failed to save feature permissions')
        setPermissions(prev =>
          prev.map(p =>
            p.featureKey === featureKey ? { ...p, visible: current.visible } : p
          )
        )
      } finally {
        setSaving(false)
      }
    },
    [permissions, selectedRoleId, getPerm]
  )

  const toggleEnabled = useCallback(async (featureKey: string) => {
    const current = getPerm(featureKey)
    const latestPerms = permissions.map(permission =>
      permission.featureKey === featureKey
        ? { ...permission, enabled: !permission.enabled }
        : permission
    )
    setPermissions(latestPerms)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(selectedRoleId)}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: latestPerms.map(permission => ({
            featureKey: permission.featureKey,
            visible: permission.visible,
            enabled: permission.enabled,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save')
      setPermissions(json.data.features ?? [])
    } catch (err) {
      setPermissions(previous => previous.map(permission =>
        permission.featureKey === featureKey ? { ...permission, enabled: current.enabled } : permission
      ))
      setError(err instanceof Error ? err.message : 'Failed to save feature permissions')
    } finally {
      setSaving(false)
    }
  }, [getPerm, permissions, selectedRoleId])

  // ---------------------------------------------------------------------------
  // Derive unique featureKeys and group them
  // ---------------------------------------------------------------------------

  const allKeys: string[] = Array.from(new Set(permissions.map(p => p.featureKey))).sort()

  const grouped: Record<GroupKey, string[]> = {
    module: [],
    page: [],
    button: [],
    tab: [],
    other: [],
  }
  for (const key of allKeys) {
    grouped[keyPrefix(key) as GroupKey].push(key)
  }

  const activeGroups = GROUP_ORDER.filter(g => grouped[g].length > 0)

  const loading = rolesLoading || featuresLoading

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Cascade hint */}
      {cascadeNote && (
        <div className="flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Hidden modules auto-hide their pages and buttons.
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-ink-primary">Features &amp; Navigation</h2>
        <p className="text-sm text-ink-secondary mt-0.5">
          Control which features and navigation items are visible per role. Toggle to enable or disable.
        </p>
      </div>

      {/* Role selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="role-select" className="text-sm font-medium text-ink-primary whitespace-nowrap">
          Role
        </label>
        {rolesLoading ? (
          <Skeleton className="h-9 w-48" aria-label="Loading roles" />
        ) : (
          <SettingsSelect
            id="role-select"
            value={selectedRoleId}
            onValueChange={setSelectedRoleId}
            options={roles.map(role => ({ value: role.id, label: role.label || role.name }))}
            className="w-auto min-w-48"
          />
        )}
        {saving && (
          <span role="status" className="flex items-center gap-1 text-xs text-ink-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading features">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : allKeys.length === 0 ? (
        <EmptyState
          bare
          icon={Navigation}
          className="rounded-lg border border-dashed border-border"
          title="No feature permissions configured"
          description="Feature and navigation permissions for this role will appear here once defined."
        />
      ) : (
        <div className="space-y-6">
          {activeGroups.map(group => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', groupColor(group))}>
                  {groupLabel(group)}
                </span>
                <span className="text-xs text-ink-secondary">({grouped[group].length})</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-ink-secondary">Feature Key</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-ink-secondary w-28">Visible</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-ink-secondary w-28">Enabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface-card">
                    {grouped[group].map(featureKey => {
                      const perm = getPerm(featureKey)
                      const isModule = featureKey.startsWith('module.')

                      return (
                        <tr
                          key={featureKey}
                          className={cn(
                            'hover:bg-surface-hover transition-colors',
                            isModule && 'bg-success-50/40'
                          )}
                        >
                          <td className="px-3 py-2 font-medium text-ink-primary whitespace-nowrap">
                            <code className="text-xs bg-surface-app rounded px-1 py-0.5 text-ink-secondary">
                              {featureKey}
                            </code>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggleVisible(featureKey)}
                              disabled={saving}
                              className={cn(
                                'inline-flex items-center justify-center transition-opacity',
                                saving && 'opacity-50 cursor-not-allowed'
                              )}
                              title={perm.visible ? 'Hide' : 'Show'}
                              role="switch"
                              aria-checked={perm.visible}
                              aria-label={`Visible: ${featureKey}`}
                            >
                              {perm.visible ? (
                                <ToggleRight className="h-6 w-6 text-primary-600 hover:text-primary-700" />
                              ) : (
                                <ToggleLeft className="h-6 w-6 text-ink-secondary hover:text-ink-primary" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggleEnabled(featureKey)}
                              disabled={saving}
                              className={cn('inline-flex items-center justify-center', saving && 'opacity-50 cursor-not-allowed')}
                              title={perm.enabled ? 'Disable' : 'Enable'}
                              role="switch"
                              aria-checked={perm.enabled}
                              aria-label={`Enabled: ${featureKey}`}
                            >
                              {perm.enabled ? (
                                <ToggleRight className="h-6 w-6 text-success-700 hover:text-success-800" />
                              ) : (
                                <ToggleLeft className="h-6 w-6 text-ink-secondary hover:text-ink-primary" />
                              )}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
