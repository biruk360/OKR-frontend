'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Copy, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Role {
  id: string
  name: string
  key: string
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

  async function handleReset() {
    if (!window.confirm('Reset this role to the default permission matrix?')) return
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
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading roles…</div>
  }

  return (
    <div className="space-y-5">
      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Role</label>
        <select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm">
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {saving && <span className="flex items-center gap-1 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>}
          <button onClick={handleClone} disabled={!selectedRoleId || cloning} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
            {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}Clone Role
          </button>
          <button onClick={handleReset} disabled={!selectedRoleId || resetting} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Reset Defaults
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="w-56 px-3 py-2.5 text-left font-semibold text-gray-600">DocType</th>
            {PERM_COLS.map((column) => <th key={column.key} title={column.title} className="w-12 px-2 py-2.5 text-center font-semibold text-gray-600">{column.label}</th>)}
            <th className="w-16 px-2 py-2.5 text-center font-semibold text-gray-600">Scope</th>
            {onConfigureFields && <th className="w-24 px-2 py-2.5 text-center font-semibold text-gray-600">Fields</th>}
          </tr></thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loadingPerms ? <tr><td colSpan={13} className="py-12 text-center text-gray-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading permissions…</td></tr> : Object.keys(grouped).length === 0 ? (
              <tr><td colSpan={13} className="py-10 text-center text-gray-400">No permissions configured for this role.</td></tr>
            ) : Object.keys(grouped).sort().map((moduleName) => (
              <Fragment key={moduleName}>
                <tr onClick={() => setCollapsed((value) => ({ ...value, [moduleName]: !value[moduleName] }))} className="cursor-pointer bg-gray-50 hover:bg-gray-100">
                  <td colSpan={13} className="px-3 py-2 text-xs font-semibold uppercase text-gray-700">
                    <span className="inline-flex items-center gap-1">{collapsed[moduleName] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{moduleName} ({grouped[moduleName].length})</span>
                  </td>
                </tr>
                {!collapsed[moduleName] && grouped[moduleName].map((permission) => (
                  <tr key={permission.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 pl-7 text-gray-800">{permission.doctype.displayName}</td>
                    {PERM_COLS.map((column) => <td key={column.key} className="px-2 py-2 text-center"><input type="checkbox" checked={permission[column.key]} disabled={saving} onChange={() => toggle(permission.id, column.key)} className="h-4 w-4 rounded border-gray-300 text-blue-600" /></td>)}
                    <td className="px-2 py-2 text-center"><button disabled={saving} onClick={() => toggle(permission.id, 'applyScoping')} className={cn('rounded-full px-2 py-0.5 text-xs font-medium', permission.applyScoping ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{permission.applyScoping ? 'ON' : 'OFF'}</button></td>
                    {onConfigureFields && <td className="px-2 py-2 text-center"><button onClick={() => onConfigureFields(permission.doctypeKey)} className="text-xs text-blue-600 hover:underline">Configure</button></td>}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
