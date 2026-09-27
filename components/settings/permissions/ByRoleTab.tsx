'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertCircle, ChevronDown, ChevronRight, Copy, Loader2, Pencil, Plus, RotateCcw, ShieldPlus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingsSelect } from '../SettingsSelect'

interface Role {
  id: string
  name: string
  key: string
  description?: string | null
  isSystem?: boolean
  _count?: { userRoles: number }
}

interface RoleFormValues {
  name: string
  key: string
  description: string
}

/** Mirrors the API's key normalisation (app/api/permissions/roles/route.ts). */
function toRoleKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

interface RoleFormModalProps {
  mode: 'create' | 'rename'
  role?: Role
  onClose: () => void
  onSaved: (role: Role) => void
}

/** Create a role, or rename an existing one (the key of a system role is fixed). */
function RoleFormModal({ mode, role, onClose, onSaved }: RoleFormModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<RoleFormValues>({
    defaultValues: {
      name: role?.name ?? '',
      key: role?.key ?? '',
      description: role?.description ?? '',
    },
  })
  const keyLocked = mode === 'rename' && Boolean(role?.isSystem)
  const nameField = register('name', {
    required: 'Name is required',
    validate: (v) => v.trim().length > 0 || 'Name is required',
  })

  const onSubmit = async (values: RoleFormValues) => {
    const payload: Record<string, string> = {
      name: values.name.trim(),
      description: values.description.trim(),
    }
    if (!keyLocked) payload.key = toRoleKey(values.key || values.name)
    try {
      const res = await fetch(
        mode === 'create' ? '/api/permissions/roles' : `/api/permissions/roles/${encodeURIComponent(role!.id)}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        const message: string = json?.error ?? 'Failed to save role'
        setError(/key/i.test(message) ? 'key' : 'name', { message })
        return
      }
      onSaved(json.data as Role)
    } catch {
      setError('name', { message: 'Could not reach the server' })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? 'New role' : 'Rename role'}
      icon={mode === 'create' ? ShieldPlus : Pencil}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="role-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Name *</Label>
          <Input
            id="role-name"
            placeholder="e.g. Finance Reviewer"
            aria-invalid={Boolean(errors.name)}
            {...nameField}
            onChange={(event) => {
              void nameField.onChange(event)
              // Suggest a key from the name until the user edits the key.
              if (mode === 'create' && !dirtyFields.key) setValue('key', toRoleKey(event.target.value))
            }}
          />
          {errors.name && <p className="text-xs text-danger-600">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-key">Key</Label>
          <Input
            id="role-key"
            className="font-mono"
            disabled={keyLocked}
            aria-invalid={Boolean(errors.key)}
            {...register('key', { setValueAs: (v: string) => toRoleKey(v ?? '') })}
          />
          <p className="text-xs text-muted-foreground">
            {keyLocked
              ? 'System role keys cannot be changed.'
              : `Stored as ${toRoleKey(watch('key') || watch('name')) || '—'}. Used in code and imports.`}
          </p>
          {errors.key && <p className="text-xs text-danger-600">{errors.key.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Textarea id="role-description" rows={3} {...register('description')} />
        </div>
      </form>
    </Modal>
  )
}

interface Permission {
  id: string
  doctypeKey: string
  permLevel: number
  canRead: boolean
  canWrite: boolean
  canCreate: boolean
  canDelete: boolean
  canSubmit: boolean
  canExport: boolean
  canPrint: boolean
  canShare: boolean
  canImport: boolean
  canReport: boolean
  applyScoping: boolean
  doctype: { key: string; displayName: string; module: string }
}

type BooleanPermissionKey =
  | 'canRead' | 'canWrite' | 'canCreate' | 'canDelete' | 'canSubmit'
  | 'canExport' | 'canPrint' | 'canShare' | 'canImport' | 'canReport'

const PERM_COLS: Array<{ key: BooleanPermissionKey; label: string; title: string }> = [
  { key: 'canRead', label: 'Rd', title: 'Read' },
  { key: 'canWrite', label: 'Wr', title: 'Write' },
  { key: 'canCreate', label: 'Cr', title: 'Create' },
  { key: 'canDelete', label: 'Del', title: 'Delete' },
  { key: 'canSubmit', label: 'Sub', title: 'Submit' },
  { key: 'canExport', label: 'Exp', title: 'Export' },
  { key: 'canPrint', label: 'Prt', title: 'Print' },
  { key: 'canShare', label: 'Shr', title: 'Share' },
  { key: 'canImport', label: 'Imp', title: 'Import' },
  { key: 'canReport', label: 'Rpt', title: 'Report' },
]

function flattenPermissions(data: unknown): Permission[] {
  const byModule = (data as { byModule?: Record<string, Permission[]> } | null)?.byModule
  return byModule ? Object.values(byModule).flat() : []
}

function permissionPayload(permission: Permission) {
  return {
    doctypeKey: permission.doctypeKey,
    permLevel: permission.permLevel,
    canRead: permission.canRead,
    canWrite: permission.canWrite,
    canCreate: permission.canCreate,
    canDelete: permission.canDelete,
    canSubmit: permission.canSubmit,
    canExport: permission.canExport,
    canPrint: permission.canPrint,
    canShare: permission.canShare,
    canImport: permission.canImport,
    canReport: permission.canReport,
    applyScoping: permission.applyScoping,
  }
}

interface ByRoleTabProps {
  onConfigureFields?: (doctypeKey: string) => void
}

export default function ByRoleTab({ onConfigureFields }: ByRoleTabProps) {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleForm, setRoleForm] = useState<'create' | 'rename' | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectedRole = roles.find((role) => role.id === selectedRoleId)
  const memberCount = selectedRole?._count?.userRoles ?? 0
  const deleteBlockedReason = !selectedRole
    ? null
    : selectedRole.isSystem
      ? 'System roles cannot be deleted.'
      : memberCount > 0
        ? `This role is assigned to ${memberCount} ${memberCount === 1 ? 'user' : 'users'}. Reassign them in the User Roles tab first.`
        : null

  const loadPermissions = useCallback(async (roleId: string) => {
    if (!roleId) return
    setLoadingPerms(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(roleId)}/permissions`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load permissions')
      setPermissions(flattenPermissions(json.data))
    } catch (err) {
      setPermissions([])
      setError(err instanceof Error ? err.message : 'Failed to load permissions')
    } finally {
      setLoadingPerms(false)
    }
  }, [])

  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await fetch('/api/permissions/roles')
        const json = await res.json()
        if (!res.ok || !json.success || !Array.isArray(json.data)) {
          throw new Error(json.error ?? 'Failed to load roles')
        }
        setRoles(json.data)
        setSelectedRoleId(json.data[0]?.id ?? '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load roles')
      } finally {
        setLoadingRoles(false)
      }
    }
    loadRoles()
  }, [])

  useEffect(() => { loadPermissions(selectedRoleId) }, [selectedRoleId, loadPermissions])

  async function persist(next: Permission[]) {
    setSaving(true)
    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(selectedRoleId)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: next.map(permissionPayload) }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save permissions')
      setPermissions(flattenPermissions(json.data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions')
      await loadPermissions(selectedRoleId)
    } finally {
      setSaving(false)
    }
  }

  function toggle(permissionId: string, field: BooleanPermissionKey | 'applyScoping') {
    const next = permissions.map((permission) =>
      permission.id === permissionId ? { ...permission, [field]: !permission[field] } : permission
    )
    setPermissions(next)
    void persist(next)
  }

  async function handleClone() {
    setCloning(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(selectedRoleId)}/clone`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to clone role')
      const newRole: Role | undefined = json.data?.newRole
      if (!newRole) throw new Error('Clone response did not include the new role')
      setRoles((current) => [...current, newRole])
      setSelectedRoleId(newRole.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone role')
    } finally {
      setCloning(false)
    }
  }

  function handleRoleSaved(saved: Role) {
    setRoles((current) =>
      current.some((role) => role.id === saved.id)
        ? current.map((role) => (role.id === saved.id ? { ...role, ...saved } : role))
        : [...current, saved],
    )
    setSelectedRoleId(saved.id)
    setRoleForm(null)
  }

  async function handleDelete() {
    if (!selectedRole) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(selectedRole.id)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Failed to delete role')
      const remaining = roles.filter((role) => role.id !== selectedRole.id)
      setRoles(remaining)
      setSelectedRoleId(remaining[0]?.id ?? '')
      setConfirmDelete(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handleReset() {
    setConfirmReset(false)
    setResetting(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(selectedRoleId)}/permissions/reset`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to reset permissions')
      await loadPermissions(selectedRoleId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset permissions')
    } finally {
      setResetting(false)
    }
  }

  const grouped = permissions.reduce<Record<string, Permission[]>>((result, permission) => {
    const moduleName = permission.doctype.module || 'General'
    ;(result[moduleName] ??= []).push(permission)
    return result
  }, {})

  if (loadingRoles) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading roles">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="ml-auto h-8 w-80" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"><AlertCircle className="size-4" />{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="by-role-select" className="text-sm font-medium text-foreground">Role</label>
        <SettingsSelect
          id="by-role-select"
          value={selectedRoleId}
          onValueChange={setSelectedRoleId}
          options={roles.map((role) => ({ value: role.id, label: `${role.name}${role.isSystem ? ' (system)' : ''}` }))}
          className="w-auto min-w-56"
        />
        {selectedRole && (
          <span className="text-xs text-muted-foreground">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saving && <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Saving…</span>}
          <Button variant="outline" size="sm" onClick={() => setRoleForm('create')}>
            <Plus />New role
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRoleForm('rename')} disabled={!selectedRole}>
            <Pencil />Rename
          </Button>
          <Button variant="outline" size="sm" onClick={handleClone} disabled={!selectedRoleId || cloning}>
            {cloning ? <Loader2 className="animate-spin" /> : <Copy />}Clone
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={!selectedRoleId || resetting}>
            {resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}Reset defaults
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={!selectedRole || Boolean(selectedRole?.isSystem)}
            title={selectedRole?.isSystem ? 'System roles cannot be deleted' : undefined}
          >
            <Trash2 />Delete
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50"><tr>
            <th className="w-56 px-3 py-2.5 text-left font-semibold text-muted-foreground">DocType</th>
            {PERM_COLS.map((column) => <th key={column.key} title={column.title} className="w-12 px-2 py-2.5 text-center font-semibold text-muted-foreground">{column.label}</th>)}
            <th className="w-16 px-2 py-2.5 text-center font-semibold text-muted-foreground">Scope</th>
            {onConfigureFields && <th className="w-24 px-2 py-2.5 text-center font-semibold text-muted-foreground">Fields</th>}
          </tr></thead>
          <tbody className="divide-y divide-border bg-card">
            {loadingPerms ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={13} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : Object.keys(grouped).length === 0 ? (
              <tr><td colSpan={13} className="py-10 text-center text-muted-foreground">No permissions configured for this role.</td></tr>
            ) : Object.keys(grouped).sort().map((moduleName) => (
              <Fragment key={moduleName}>
                <tr className="bg-muted/50 hover:bg-muted">
                  <td colSpan={13} className="p-0 text-xs font-semibold uppercase text-foreground">
                    <button
                      type="button"
                      aria-expanded={!collapsed[moduleName]}
                      onClick={() => setCollapsed((value) => ({ ...value, [moduleName]: !value[moduleName] }))}
                      className="flex w-full items-center gap-1 px-3 py-2 text-left uppercase"
                    >
                      {collapsed[moduleName] ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}{moduleName} ({grouped[moduleName].length})
                    </button>
                  </td>
                </tr>
                {!collapsed[moduleName] && grouped[moduleName].map((permission) => (
                  <tr key={permission.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2 pl-7 text-foreground">{permission.doctype.displayName}</td>
                    {PERM_COLS.map((column) => <td key={column.key} className="px-2 py-2 text-center"><input type="checkbox" aria-label={`${column.title} ${permission.doctype.displayName}`} checked={permission[column.key]} disabled={saving} onChange={() => toggle(permission.id, column.key)} className="size-4 rounded border-input accent-primary" /></td>)}
                    <td className="px-2 py-2 text-center"><button disabled={saving} aria-label={`Record scoping for ${permission.doctype.displayName}`} aria-pressed={permission.applyScoping} onClick={() => toggle(permission.id, 'applyScoping')} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', permission.applyScoping ? 'bg-success-50 text-success-700' : 'bg-muted text-muted-foreground')}>{permission.applyScoping ? 'ON' : 'OFF'}</button></td>
                    {onConfigureFields && <td className="px-2 py-2 text-center"><button onClick={() => onConfigureFields(permission.doctypeKey)} className="text-xs text-primary hover:underline">Configure</button></td>}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {roleForm && (
        <RoleFormModal
          mode={roleForm}
          role={roleForm === 'rename' ? selectedRole : undefined}
          onClose={() => setRoleForm(null)}
          onSaved={handleRoleSaved}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        variant="warning"
        icon={RotateCcw}
        title="Reset role permissions"
        message={`Reset ${selectedRole?.name ?? 'this role'} to the default permission matrix?`}
        description="Every document-type permission you changed for this role is replaced by the seeded defaults."
        confirmLabel="Reset defaults"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        onConfirm={handleDelete}
        variant="danger"
        title="Delete role"
        message={`Delete ${selectedRole?.name ?? 'this role'}?`}
        description={
          deleteBlockedReason ??
          'Its document-type, field and feature permissions are removed with it. This cannot be undone.'
        }
        disabled={Boolean(deleteBlockedReason)}
        confirmLabel="Delete role"
        loadingLabel="Deleting…"
        isLoading={deleting}
      />
    </div>
  )
}
