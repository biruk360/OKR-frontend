'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Trash2, Plus, X, AlertTriangle, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import EffectivePermissionsPreview from './EffectivePermissionsPreview'

interface UserRoleProfile {
  id: string
  profileId: string
  profile: {
    id: string
    name: string
    description?: string | null
  }
}

interface UserRole {
  id: string
  roleName: string
  grantedBy?: string | null
  grantedAt?: string | null
  expiresAt?: string | null
}

interface UserOverride {
  id: string
  doctypeKey: string
  featureKey: string
  action: string
  overrideType: 'grant' | 'deny'
  reason?: string | null
  expiresAt?: string | null
}

interface EffectivePermission {
  doctypeKey: string
  featureKey: string
  action: string
  allowed: boolean
  source: string
}

interface UserPermissionsData {
  assignedProfiles?: UserRoleProfile[]
  assignedRoles?: UserRole[]
  effectivePermissions?: EffectivePermission[]
}

interface AvailableProfile {
  id: string
  name: string
  description?: string | null
}

interface AvailableRole {
  id: string
  name: string
  label?: string | null
}

interface Props {
  userId: string
  userName: string
  currentUserId: string
}

const isSelf = (userId: string, currentUserId: string) => userId === currentUserId

function SelfBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-6">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>Use another admin account to modify your own permissions.</span>
    </div>
  )
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h4>
      {action}
    </div>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={10} className="px-4 py-6 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}

export default function UserRolesPanel({ userId, userName, currentUserId }: Props) {
  const self = isSelf(userId, currentUserId)
  const [showPreview, setShowPreview] = useState(false)

  const [data, setData] = useState<UserPermissionsData | null>(null)
  const [overrides, setOverrides] = useState<UserOverride[]>([])
  const [availableProfiles, setAvailableProfiles] = useState<AvailableProfile[]>([])
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showAssignProfile, setShowAssignProfile] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [assigningProfile, setAssigningProfile] = useState(false)

  const [showAssignRole, setShowAssignRole] = useState(false)
  const [selectedRoleName, setSelectedRoleName] = useState('')
  const [roleExpiry, setRoleExpiry] = useState('')
  const [assigningRole, setAssigningRole] = useState(false)

  const [showAddOverride, setShowAddOverride] = useState(false)
  const [overrideForm, setOverrideForm] = useState({
    doctypeKey: '',
    featureKey: '',
    action: '',
    overrideType: 'grant' as 'grant' | 'deny',
    reason: '',
    expiresAt: '',
  })
  const [addingOverride, setAddingOverride] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [userRes, profilesRes, rolesRes, overridesRes] = await Promise.all([
        fetch(`/api/permissions/users/${userId}`),
        fetch('/api/permissions/profiles'),
        fetch('/api/permissions/roles'),
        fetch(`/api/permissions/users/${userId}/overrides`),
      ])

      if (!userRes.ok) throw new Error('Failed to load user permissions')

      const userData = await userRes.json()
      setData(userData.data ?? userData)

      if (profilesRes.ok) {
        const pd = await profilesRes.json()
        setAvailableProfiles(pd.data ?? pd)
      }

      if (rolesRes.ok) {
        const rd = await rolesRes.json()
        setAvailableRoles(rd.data ?? rd)
      }

      if (overridesRes.ok) {
        const od = await overridesRes.json()
        setOverrides(od.data ?? od)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const removeProfile = async (profileId: string) => {
    try {
      const res = await fetch(`/api/permissions/users/${userId}/profiles/${profileId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Failed to remove profile')
        return
      }
      toast.success('Profile removed')
      await loadData()
    } catch {
      toast.error('Failed to remove profile')
    }
  }

  const assignProfile = async () => {
    if (!selectedProfileId) return
    setAssigningProfile(true)
    try {
      const res = await fetch(`/api/permissions/users/${userId}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedProfileId }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Failed to assign profile')
        return
      }
      toast.success('Profile assigned')
      setShowAssignProfile(false)
      setSelectedProfileId('')
      await loadData()
    } catch {
      toast.error('Failed to assign profile')
    } finally {
      setAssigningProfile(false)
    }
  }

  const revokeRole = async (roleId: string) => {
    try {
      const res = await fetch(`/api/permissions/users/${userId}/roles/${roleId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Failed to revoke role')
        return
      }
      toast.success('Role revoked')
      await loadData()
    } catch {
      toast.error('Failed to revoke role')
    }
  }

  const assignRole = async () => {
    if (!selectedRoleName) return
    setAssigningRole(true)
    try {
      const res = await fetch(`/api/permissions/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: selectedRoleName,
          expiresAt: roleExpiry || undefined,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Failed to assign role')
        return
      }
      toast.success('Role assigned')
      setShowAssignRole(false)
      setSelectedRoleName('')
      setRoleExpiry('')
      await loadData()
    } catch {
      toast.error('Failed to assign role')
    } finally {
      setAssigningRole(false)
    }
  }

  const removeOverride = async (overrideId: string) => {
    try {
      const res = await fetch(`/api/permissions/users/${userId}/overrides/${overrideId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Failed to remove override')
        return
      }
      toast.success('Override removed')
      await loadData()
    } catch {
      toast.error('Failed to remove override')
    }
  }

  const addOverride = async () => {
    const { doctypeKey, featureKey, action, overrideType, reason, expiresAt } = overrideForm
    if (!doctypeKey || !featureKey || !action) {
      toast.error('DocType, Feature, and Action are required')
      return
    }
    if (reason.trim().length > 0 && reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters')
      return
    }
    setAddingOverride(true)
    try {
      const res = await fetch(`/api/permissions/users/${userId}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctypeKey,
          featureKey,
          action,
          overrideType,
          reason: reason || undefined,
          expiresAt: expiresAt || undefined,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Failed to add override')
        return
      }
      toast.success('Override added')
      setShowAddOverride(false)
      setOverrideForm({ doctypeKey: '', featureKey: '', action: '', overrideType: 'grant', reason: '', expiresAt: '' })
      await loadData()
    } catch {
      toast.error('Failed to add override')
    } finally {
      setAddingOverride(false)
    }
  }

  const formatDate = (d?: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading permissions…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  const profiles = data?.assignedProfiles ?? []
  const roles = data?.assignedRoles ?? []
  const effectivePerms = data?.effectivePermissions ?? []

  const assignedProfileIds = new Set(profiles.map((p) => p.profileId))
  const assignedRoleNames = new Set(roles.map((r) => r.roleName))

  const unassignedProfiles = availableProfiles.filter((p) => !assignedProfileIds.has(p.id))
  const unassignedRoles = availableRoles.filter((r) => !assignedRoleNames.has(r.name))

  return (
    <div className="space-y-8">
      {self && <SelfBanner />}

      {/* Role Profiles */}
      <section>
        <SectionHeader
          title="Role Profiles"
          action={
            !self && (
              <button
                onClick={() => setShowAssignProfile((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Assign Profile
              </button>
            )
          }
        />

        {showAssignProfile && !self && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted p-3">
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a profile…</option>
              {unassignedProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={assignProfile}
              disabled={!selectedProfileId || assigningProfile}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {assigningProfile && <Loader2 className="h-3 w-3 animate-spin" />}
              Assign
            </button>
            <button
              onClick={() => { setShowAssignProfile(false); setSelectedProfileId('') }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Profile Name</th>
                {!self && <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {profiles.length === 0 ? (
                <EmptyRow message="No profiles assigned" />
              ) : (
                profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium text-foreground">{p.profile.name}</td>
                    {!self && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => removeProfile(p.profileId)}
                          className="text-red-500 hover:text-red-700"
                          title="Remove profile"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Individually Assigned Roles */}
      <section>
        <SectionHeader
          title="Individually Assigned Roles"
          action={
            !self && (
              <button
                onClick={() => setShowAssignRole((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Assign Role
              </button>
            )
          }
        />

        {showAssignRole && !self && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-3">
            <select
              value={selectedRoleName}
              onChange={(e) => setSelectedRoleName(e.target.value)}
              className="flex-1 min-w-[150px] rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a role…</option>
              {unassignedRoles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.label ?? r.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground">Expires</label>
              <input
                type="date"
                value={roleExpiry}
                onChange={(e) => setRoleExpiry(e.target.value)}
                className="rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={assignRole}
              disabled={!selectedRoleName || assigningRole}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {assigningRole && <Loader2 className="h-3 w-3 animate-spin" />}
              Assign
            </button>
            <button
              onClick={() => { setShowAssignRole(false); setSelectedRoleName(''); setRoleExpiry('') }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Granted By</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires</th>
                {!self && <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {roles.length === 0 ? (
                <EmptyRow message="No individually assigned roles" />
              ) : (
                roles.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium text-foreground">{r.roleName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.grantedBy ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(r.grantedAt)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(r.expiresAt)}</td>
                    {!self && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => revokeRole(r.id)}
                          className="text-red-500 hover:text-red-700"
                          title="Revoke role"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* User-Specific Overrides */}
      <section>
        <SectionHeader
          title="User-Specific Overrides"
          action={
            !self && (
              <button
                onClick={() => setShowAddOverride((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Override
              </button>
            )
          }
        />

        {showAddOverride && !self && (
          <div className="mb-3 rounded-md border border-border bg-muted p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">DocType Key *</label>
                <input
                  type="text"
                  value={overrideForm.doctypeKey}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, doctypeKey: e.target.value }))}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Objective"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Feature Key *</label>
                <input
                  type="text"
                  value={overrideForm.featureKey}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, featureKey: e.target.value }))}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. export"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Action *</label>
                <input
                  type="text"
                  value={overrideForm.action}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, action: e.target.value }))}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. read"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
                <div className="flex gap-4 mt-1">
                  {(['grant', 'deny'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        value={t}
                        checked={overrideForm.overrideType === t}
                        onChange={() => setOverrideForm((f) => ({ ...f, overrideType: t }))}
                        className="h-3.5 w-3.5 text-blue-600 focus:ring-ring"
                      />
                      <span className={cn('font-medium', t === 'grant' ? 'text-green-700' : 'text-red-700')}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Expires At</label>
                <input
                  type="date"
                  value={overrideForm.expiresAt}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Reason (min 10 chars)</label>
              <textarea
                value={overrideForm.reason}
                onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))}
                rows={2}
                className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Explain why this override is needed…"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddOverride(false)
                  setOverrideForm({ doctypeKey: '', featureKey: '', action: '', overrideType: 'grant', reason: '', expiresAt: '' })
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={addOverride}
                disabled={addingOverride}
                className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {addingOverride && <Loader2 className="h-3 w-3 animate-spin" />}
                Add Override
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">DocType</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Feature</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires</th>
                {!self && <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {overrides.length === 0 ? (
                <EmptyRow message="No user-specific overrides" />
              ) : (
                overrides.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2 font-medium text-foreground">{o.doctypeKey}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.featureKey}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.action}</td>
                    <td className="px-4 py-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        o.overrideType === 'grant' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      )}>
                        {o.overrideType}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate" title={o.reason ?? undefined}>
                      {o.reason ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(o.expiresAt)}</td>
                    {!self && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => removeOverride(o.id)}
                          className="text-red-500 hover:text-red-700"
                          title="Remove override"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showPreview && (
        <EffectivePermissionsPreview
          userId={userId}
          userName={userName}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Effective Permissions */}
      <section>
        <SectionHeader
          title="Effective Permissions"
          action={
            <button
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview as User
            </button>
          }
        />
        <div className="overflow-hidden rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">DocType</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Feature</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Allowed</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {effectivePerms.length === 0 ? (
                <EmptyRow message="No effective permissions computed" />
              ) : (
                effectivePerms.map((ep, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium text-foreground">{ep.doctypeKey}</td>
                    <td className="px-4 py-2 text-muted-foreground">{ep.featureKey}</td>
                    <td className="px-4 py-2 text-muted-foreground">{ep.action}</td>
                    <td className="px-4 py-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        ep.allowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      )}>
                        {ep.allowed ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{ep.source}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
