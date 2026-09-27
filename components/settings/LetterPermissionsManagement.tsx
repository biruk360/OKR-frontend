'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Shield, Users, FileType, Check, X, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingsSelect } from './SettingsSelect'
import {
  LETTER_PERMISSIONS,
  LETTER_PERMISSION_LABELS,
  SYSTEM_ROLES,
  ROLE_LABELS,
  type LetterPermission,
  type SystemRole,
} from '@/lib/letter-permissions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoleMatrix = Record<string, Record<string, boolean>>

interface UserOverride {
  id: string
  userId: string
  permission: string
  granted: boolean
  user: { id: string; name: string; email: string; role: string; avatar: string | null }
}

interface LetterType {
  id: string
  code: string
  name: string
  description: string | null
  isBuiltIn: boolean
}

interface UserOption {
  id: string
  name: string
  email: string
  role: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleColor(role: string) {
  switch (role) {
    case 'ADMIN':           return 'bg-danger-100 text-danger-700 border-danger-200'
    case 'EXECUTIVE':       return 'bg-warning-100 text-warning-800 border-warning-200'
    case 'DEPARTMENT_LEAD': return 'bg-primary-100 text-primary-700 border-primary-200'
    default:                return 'bg-surface-app text-ink-primary border-border'
  }
}

function TableSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Role Matrix Tab
// ---------------------------------------------------------------------------

function RoleMatrixTab() {
  const [matrix, setMatrix] = useState<RoleMatrix>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null) // "ROLE:perm" key
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/settings/letter-permissions/roles')
      .then(r => r.json())
      .then(res => {
        if (res.success) setMatrix(res.data.matrix)
        else setError(res.error)
      })
      .catch(() => setError('Failed to load permissions'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = useCallback(async (role: string, permission: string) => {
    const current = matrix[role]?.[permission] ?? false
    const next = !current
    const key = `${role}:${permission}`

    // Optimistic
    setMatrix(prev => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [permission]: next },
    }))
    setSaving(key)

    try {
      const res = await fetch('/api/settings/letter-permissions/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permission, granted: next }),
      })
      const json = await res.json()
      if (!json.success) {
        // Rollback
        setMatrix(prev => ({
          ...prev,
          [role]: { ...(prev[role] ?? {}), [permission]: current },
        }))
        setError(json.error)
      }
    } catch {
      setMatrix(prev => ({
        ...prev,
        [role]: { ...(prev[role] ?? {}), [permission]: current },
      }))
      setError('Failed to save permission')
    } finally {
      setSaving(null)
    }
  }, [matrix])

  if (loading) {
    return <TableSkeleton rows={8} label="Loading permission matrix" />
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Toggle which operations each system role can perform on letters. Changes are saved instantly.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-4 py-3 text-left font-semibold text-foreground w-56">Permission</th>
              {SYSTEM_ROLES.map(role => (
                <th key={role} className="px-4 py-3 text-center font-semibold text-foreground">
                  <span className={cn('inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium', roleColor(role))}>
                    {ROLE_LABELS[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LETTER_PERMISSIONS.map((perm, idx) => {
              const { label, description } = LETTER_PERMISSION_LABELS[perm]
              return (
                <tr
                  key={perm}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/30 transition-colors',
                    idx % 2 === 0 ? 'bg-surface-card' : 'bg-muted/10'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </td>
                  {SYSTEM_ROLES.map(role => {
                    const granted = matrix[role]?.[perm] ?? false
                    const key = `${role}:${perm}`
                    const isSaving = saving === key
                    // ADMIN always has everything — lock to prevent lockout
                    const locked = role === 'ADMIN'
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <button
                          disabled={locked || isSaving}
                          onClick={() => toggle(role, perm)}
                          title={locked ? 'Administrator always has all permissions' : undefined}
                          aria-label={`${label} for ${ROLE_LABELS[role]}: ${granted ? 'granted' : 'not granted'}`}
                          aria-pressed={granted}
                          className={cn(
                            'mx-auto flex h-7 w-7 items-center justify-center rounded-full border transition-all',
                            locked
                              ? 'cursor-not-allowed opacity-60'
                              : 'cursor-pointer hover:scale-110',
                            granted
                              ? 'bg-success-500 border-success-600 text-primary-foreground'
                              : 'bg-surface-card border-ink-tertiary text-ink-secondary',
                            isSaving && 'opacity-50'
                          )}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : granted ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Administrator role is locked — it always retains all permissions to prevent system lockout.
        Record-level rules (e.g. only own DRAFT) are enforced separately at the API level.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// User Overrides Tab
// ---------------------------------------------------------------------------

interface AddOverrideModalProps {
  open: boolean
  onClose: () => void
  users: UserOption[]
  existingOverrides: UserOverride[]
  onSaved: () => void
}

interface AddOverrideForm {
  userId: string
  permission: LetterPermission | ''
  granted: 'grant' | 'revoke'
}

const ADD_OVERRIDE_DEFAULTS: AddOverrideForm = { userId: '', permission: '', granted: 'grant' }

function AddOverrideModal({ open, onClose, users, existingOverrides, onSaved }: AddOverrideModalProps) {
  const { control, register, handleSubmit, reset: resetForm, watch } = useForm<AddOverrideForm>({
    defaultValues: ADD_OVERRIDE_DEFAULTS,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userId = watch('userId')
  const permission = watch('permission')

  const reset = () => { resetForm(ADD_OVERRIDE_DEFAULTS); setError(null) }

  const handleClose = () => { reset(); onClose() }

  const handleSave = async (values: AddOverrideForm) => {
    const { userId, permission } = values
    const granted = values.granted === 'grant'
    if (!userId || !permission) { setError('Select a user and permission'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/letter-permissions/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, permission, granted }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error); return }
      onSaved()
      handleClose()
    } catch {
      setError('Failed to save override')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add User Permission Override" size="md">
      <div className="space-y-4 py-2">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="letter-override-user" className="block text-sm font-medium text-foreground">User</label>
          <Controller
            control={control}
            name="userId"
            render={({ field }) => (
              <SettingsSelect
                id="letter-override-user"
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select a user…"
                options={users.map(u => ({
                  value: u.id,
                  label: `${u.name} (${u.email}) — ${ROLE_LABELS[u.role as SystemRole] ?? u.role}`,
                }))}
              />
            )}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="letter-override-permission" className="block text-sm font-medium text-foreground">Permission</label>
          <Controller
            control={control}
            name="permission"
            render={({ field }) => (
              <SettingsSelect
                id="letter-override-permission"
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select a permission…"
                options={LETTER_PERMISSIONS.map(p => ({
                  value: p,
                  label: `${LETTER_PERMISSION_LABELS[p].label} — ${LETTER_PERMISSION_LABELS[p].description}`,
                }))}
              />
            )}
          />
        </div>

        <fieldset className="space-y-1">
          <legend className="block text-sm font-medium text-foreground">Override type</legend>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="grant" {...register('granted')} className="accent-primary" />
              <span className="text-sm">
                <span className="font-medium text-success-700">Grant</span>
                <span className="text-muted-foreground ml-1">— give this permission even if the role doesn&apos;t have it</span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="revoke" {...register('granted')} className="accent-primary" />
              <span className="text-sm">
                <span className="font-medium text-danger-700">Revoke</span>
                <span className="text-muted-foreground ml-1">— take away this permission even if the role has it</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit(handleSave)}
            disabled={saving || !userId || !permission}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Override
          </button>
        </div>
      </div>
    </Modal>
  )
}

function UserOverridesTab() {
  const [overrides, setOverrides] = useState<UserOverride[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; permission: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ovRes, usRes] = await Promise.all([
        fetch('/api/settings/letter-permissions/users').then(r => r.json()),
        fetch('/api/users').then(r => r.json()),
      ])
      if (ovRes.success) setOverrides(ovRes.data)
      if (usRes.success) setUsers(usRes.data)
    } catch {
      setError('Failed to load overrides')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { userId, permission } = deleteTarget
    try {
      const res = await fetch(
        `/api/settings/letter-permissions/users/${userId}?permission=${encodeURIComponent(permission)}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (json.success) {
        setOverrides(prev => prev.filter(o => !(o.userId === userId && o.permission === permission)))
      } else {
        setError(json.error)
      }
    } catch {
      setError('Failed to remove override')
    } finally {
      setDeleteTarget(null)
    }
  }

  // Group by user
  const byUser = overrides.reduce<Record<string, UserOverride[]>>((acc, o) => {
    if (!acc[o.userId]) acc[o.userId] = []
    acc[o.userId].push(o)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Per-user overrides take precedence over the role matrix. Use sparingly for exceptions.
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Override
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} label="Loading overrides" />
      ) : Object.keys(byUser).length === 0 ? (
        <EmptyState
          bare
          icon={Users}
          className="rounded-lg border border-dashed border-border"
          title="No user overrides yet"
          description="Add overrides to grant or revoke specific permissions for individual users."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(byUser).map(([, rows]) => {
            const user = rows[0].user
            return (
              <div key={user.id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b border-border">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <span className={cn('ml-auto inline-block rounded-full border px-2 py-0.5 text-xs font-medium', roleColor(user.role))}>
                    {ROLE_LABELS[user.role as SystemRole] ?? user.role}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {rows.map(override => (
                    <div key={override.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {LETTER_PERMISSION_LABELS[override.permission as LetterPermission]?.label ?? override.permission}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {LETTER_PERMISSION_LABELS[override.permission as LetterPermission]?.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          override.granted
                            ? 'bg-success-100 text-success-700'
                            : 'bg-danger-100 text-danger-700'
                        )}>
                          {override.granted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {override.granted ? 'Granted' : 'Revoked'}
                        </span>
                        <button
                          onClick={() => setDeleteTarget({ userId: user.id, permission: override.permission, name: user.name })}
                          className="rounded p-1 text-muted-foreground hover:text-danger-600 hover:bg-danger-50 transition-colors"
                          title="Remove override"
                          aria-label={`Remove override ${LETTER_PERMISSION_LABELS[override.permission as LetterPermission]?.label ?? override.permission} for ${user.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddOverrideModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        users={users}
        existingOverrides={overrides}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove User Override"
        message={`Remove the override for "${deleteTarget?.name}"? The user will fall back to their role's default permission.`}
        confirmLabel="Remove Override"
        variant="danger"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Letter Types Tab
// ---------------------------------------------------------------------------

interface AddTypeModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

interface AddTypeForm {
  name: string
  code: string
  description: string
}

const ADD_TYPE_DEFAULTS: AddTypeForm = { name: '', code: '', description: '' }

function AddTypeModal({ open, onClose, onSaved }: AddTypeModalProps) {
  const { register, handleSubmit, reset: resetForm, watch } = useForm<AddTypeForm>({
    defaultValues: ADD_TYPE_DEFAULTS,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameValue = watch('name')

  const reset = () => { resetForm(ADD_TYPE_DEFAULTS); setError(null) }
  const handleClose = () => { reset(); onClose() }

  const handleSave = async (values: AddTypeForm) => {
    const name = values.name
    const code = values.code.toUpperCase()
    const description = values.description
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/letters/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code: code.trim() || undefined, description: description.trim() || undefined }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error); return }
      onSaved()
      handleClose()
    } catch {
      setError('Failed to create letter type')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Letter Type" size="sm">
      <div className="space-y-4 py-2">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="letter-type-name" className="block text-sm font-medium text-foreground">Name <span className="text-danger-500">*</span></label>
          <input
            id="letter-type-name"
            {...register('name')}
            placeholder="e.g. Notice of Default"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="letter-type-code" className="block text-sm font-medium text-foreground">
            Code <span className="text-muted-foreground text-xs">(2–4 letters, auto-derived if empty)</span>
          </label>
          <input
            id="letter-type-code"
            {...register('code', { setValueAs: (v: string) => v.toUpperCase() })}
            maxLength={4}
            placeholder="e.g. ND"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="letter-type-description" className="block text-sm font-medium text-foreground">Description</label>
          <textarea
            id="letter-type-description"
            {...register('description')}
            rows={2}
            placeholder="Optional — describes when this letter type is used"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={handleSubmit(handleSave)}
            disabled={saving || !nameValue.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Type
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LetterTypesTab() {
  const [types, setTypes] = useState<LetterType[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LetterType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/letters/types').then(r => r.json())
      if (res.success) setTypes(res.data)
      else setError(res.error)
    } catch {
      setError('Failed to load letter types')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/letters/types/${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        setTypes(prev => prev.filter(t => t.id !== deleteTarget.id))
      } else {
        setError(json.error)
      }
    } catch {
      setError('Failed to delete letter type')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define custom letter types. Built-in types (Cover, Offer, Guarantee) cannot be deleted.
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Type
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={4} label="Loading letter types" />
      ) : types.length === 0 ? (
        <EmptyState
          bare
          icon={FileType}
          className="rounded-lg border border-dashed border-border"
          title="No letter types"
          description="Create a letter type to get started."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Description</th>
                <th className="px-4 py-3 text-center font-semibold text-foreground">Type</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {types.map((t, idx) => (
                <tr key={t.id} className={cn('border-b border-border last:border-0 hover:bg-muted/20 transition-colors', idx % 2 === 0 ? 'bg-surface-card' : 'bg-muted/10')}>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{t.code}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.description ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {t.isBuiltIn ? (
                      <span className="inline-block rounded-full bg-primary-100 text-primary-700 border border-primary-200 px-2 py-0.5 text-xs font-medium">Built-in</span>
                    ) : (
                      <span className="inline-block rounded-full bg-surface-app text-ink-secondary border border-border px-2 py-0.5 text-xs font-medium">Custom</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!t.isBuiltIn && (
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="rounded p-1 text-muted-foreground hover:text-danger-600 hover:bg-danger-50 transition-colors"
                        title="Delete type"
                        aria-label={`Delete letter type ${t.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddTypeModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Letter Type"
        message={`Delete "${deleteTarget?.name}" (${deleteTarget?.code})? Existing letters using this type will retain their type code but the definition will be removed.`}
        confirmLabel="Delete Type"
        variant="danger"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Tab = 'matrix' | 'overrides' | 'types'

export default function LetterPermissionsManagement() {
  const [tab, setTab] = useState<Tab>('matrix')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'matrix',    label: 'Role Matrix',     icon: <Shield className="h-4 w-4" /> },
    { id: 'overrides', label: 'User Overrides',  icon: <Users className="h-4 w-4" /> },
    { id: 'types',     label: 'Letter Types',    icon: <FileType className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Letter Permissions"
        description="Manage which roles can perform each letter operation, set per-user overrides, and define custom letter types."
      />

      {/* Tab bar */}
      <div role="tablist" aria-label="Letter permission sections" className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-surface-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-64">
        {tab === 'matrix'    && <RoleMatrixTab />}
        {tab === 'overrides' && <UserOverridesTab />}
        {tab === 'types'     && <LetterTypesTab />}
      </div>
    </div>
  )
}
