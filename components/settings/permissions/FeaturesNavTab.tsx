'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Loader2, ToggleLeft, ToggleRight, Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    case 'module':  return 'bg-green-100 text-green-700'
    case 'page':    return 'bg-blue-100 text-blue-700'
    case 'button':  return 'bg-purple-100 text-purple-700'
    case 'tab':     return 'bg-orange-100 text-orange-700'
    default:        return 'bg-gray-100 text-gray-600'
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
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Cascade hint */}
      {cascadeNote && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Hidden modules auto-hide their pages and buttons.
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Features &amp; Navigation</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Control which features and navigation items are visible per role. Toggle to enable or disable.
        </p>
      </div>

      {/* Role selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="role-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Role
        </label>
        {rolesLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : (
          <select
            id="role-select"
            value={selectedRoleId}
            onChange={e => setSelectedRoleId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {roles.map(role => (
              <option key={role.id} value={role.id}>
                {role.label || role.name}
              </option>
            ))}
          </select>
        )}
        {saving && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* Content */}
      {featuresLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading features…
        </div>
      ) : allKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm text-center">
          <Navigation className="h-10 w-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No feature permissions configured</p>
          <p className="mt-1 text-xs">Feature and navigation permissions for this role will appear here once defined.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeGroups.map(group => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', groupColor(group))}>
                  {groupLabel(group)}
                </span>
                <span className="text-xs text-gray-400">({grouped[group].length})</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Feature Key</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-28">Visible</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-28">Enabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {grouped[group].map(featureKey => {
                      const perm = getPerm(featureKey)
                      const isModule = featureKey.startsWith('module.')

                      return (
                        <tr
                          key={featureKey}
                          className={cn(
                            'hover:bg-gray-50 transition-colors',
                            isModule && 'bg-green-50/40'
                          )}
                        >
                          <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                            <code className="text-xs bg-gray-100 rounded px-1 py-0.5 text-gray-600">
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
                            >
                              {perm.visible ? (
                                <ToggleRight className="h-6 w-6 text-blue-600 hover:text-blue-700" />
                              ) : (
                                <ToggleLeft className="h-6 w-6 text-gray-300 hover:text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggleEnabled(featureKey)}
                              disabled={saving}
                              className={cn('inline-flex items-center justify-center', saving && 'opacity-50 cursor-not-allowed')}
                              title={perm.enabled ? 'Disable' : 'Enable'}
                            >
                              {perm.enabled ? (
                                <ToggleRight className="h-6 w-6 text-green-600 hover:text-green-700" />
                              ) : (
                                <ToggleLeft className="h-6 w-6 text-gray-300 hover:text-gray-400" />
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
