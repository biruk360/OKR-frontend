'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, AlertCircle, Loader2, Copy, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Role {
  id: string
  name: string
  label: string
}

interface Permission {
  id: string
  docType: string
  module: string
  canRead: boolean
  canWrite: boolean
  canCreate: boolean
  canDelete: boolean
  canSubmit: boolean
  canExport: boolean
  canPrint: boolean
  scopeEnabled: boolean
}

interface GroupedPermissions {
  [module: string]: Permission[]
}

const PERM_COLS: { key: keyof Permission; label: string }[] = [
  { key: 'canRead', label: 'Rd' },
  { key: 'canWrite', label: 'Wr' },
  { key: 'canCreate', label: 'Cr' },
  { key: 'canDelete', label: 'Del' },
  { key: 'canSubmit', label: 'Sub' },
  { key: 'canExport', label: 'Exp' },
  { key: 'canPrint', label: 'Prt' },
]

function groupByModule(permissions: Permission[]): GroupedPermissions {
  return permissions.reduce<GroupedPermissions>((acc, perm) => {
    const mod = perm.module || 'General'
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(perm)
    return acc
  }, {})
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
      </td>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-3 py-2 text-center">
          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse mx-auto" />
        </td>
      ))}
    </tr>
  )
}

interface ByRoleTabProps {
  onConfigureFields?: (doctypeKey: string) => void
}

export default function ByRoleTab({ onConfigureFields }: ByRoleTabProps = {}) {
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingToast, setPendingToast] = useState(false)
  const [pendingChange, setPendingChange] = useState<Permission[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Permission[]>([])

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch('/api/permissions/roles')
        if (!res.ok) throw new Error('Failed to load roles')
        const json = await res.json()
        const data: Role[] = json.data ?? json
        setRoles(data)
        if (data.length > 0) setSelectedRoleId(data[0].id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load roles')
      } finally {
        setLoadingRoles(false)
      }
    }
    fetchRoles()
  }, [])

  useEffect(() => {
    if (!selectedRoleId) return
    setLoadingPerms(true)
    setError(null)
    async function fetchPerms() {
      try {
        const res = await fetch(`/api/permissions/roles/${selectedRoleId}/permissions`)
        if (!res.ok) throw new Error('Failed to load permissions')
        const json = await res.json()
        setPermissions(json.data ?? json)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load permissions')
      } finally {
        setLoadingPerms(false)
      }
    }
    fetchPerms()
  }, [selectedRoleId])

  const flushSave = useCallback(async (perms: Permission[]) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/permissions/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: perms }),
      })
      if (!res.ok) throw new Error('Failed to save permissions')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [selectedRoleId])

  const handleUndo = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setPermissions(pendingChange)
    setPendingToast(false)
  }, [pendingChange])

  const scheduleToastSave = useCallback(
    (prev: Permission[], next: Permission[]) => {
      setPendingChange(prev)
      pendingRef.current = next
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setPendingToast(true)
      saveTimeoutRef.current = setTimeout(() => {
        flushSave(pendingRef.current)
        setPendingToast(false)
      }, 5000)
    },
    [flushSave]
  )

  const handlePermChange = useCallback(
    (permId: string, field: keyof Permission, value: boolean) => {
      setPermissions((prev) => {
        const next = prev.map((p) => (p.id === permId ? { ...p, [field]: value } : p))
        scheduleToastSave(prev, next)
        return next
      })
    },
    [scheduleToastSave]
  )

  const handleScopeToggle = useCallback(
    (permId: string) => {
      setPermissions((prev) => {
        const next = prev.map((p) =>
          p.id === permId ? { ...p, scopeEnabled: !p.scopeEnabled } : p
        )
        scheduleToastSave(prev, next)
        return next
      })
    },
    [scheduleToastSave]
  )

  async function handleClone() {
    if (!selectedRoleId) return
    setCloning(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${selectedRoleId}/clone`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to clone role')
      const json = await res.json()
      const newRole: Role = json.data ?? json
      setRoles((prev) => [...prev, newRole])
      setSelectedRoleId(newRole.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clone failed')
    } finally {
      setCloning(false)
    }
  }

  async function handleReset() {
    if (!selectedRoleId) return
    setResetting(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/roles/${selectedRoleId}/permissions/reset`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to reset permissions')
      const json = await res.json()
      setPermissions(json.data ?? json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  function toggleModule(mod: string) {
    setCollapsed((prev) => ({ ...prev, [mod]: !prev[mod] }))
  }

  const grouped = groupByModule(permissions)
  const modules = Object.keys(grouped).sort()

  if (loadingRoles) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading roles…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Role</label>
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label || r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {saving && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          )}
          <button
            onClick={handleClone}
            disabled={cloning || !selectedRoleId}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {cloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Clone Role
          </button>
          <button
            onClick={handleReset}
            disabled={resetting || !selectedRoleId}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {resetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reset Defaults
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-56">DocType</th>
              {PERM_COLS.map((col) => (
                <th key={col.key} className="px-3 py-2.5 text-center font-semibold text-gray-600 w-12">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-16">Scope</th>
              {onConfigureFields && <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-28">Fields</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loadingPerms ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : modules.length === 0 ? (
              <tr>
                <td colSpan={onConfigureFields ? 10 : 9} className="px-3 py-8 text-center text-sm text-gray-400">
                  No permissions configured for this role.
                </td>
              </tr>
            ) : (
              modules.map((mod) => (
                <>
                  <tr
                    key={`mod-${mod}`}
                    className="bg-gray-50 cursor-pointer select-none hover:bg-gray-100"
                    onClick={() => toggleModule(mod)}
                  >
                    <td
                      colSpan={onConfigureFields ? 10 : 9}
                      className="px-3 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide"
                    >
                      <span className="inline-flex items-center gap-1">
                        {collapsed[mod] ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {mod}
                        <span className="ml-1 text-gray-400 font-normal normal-case tracking-normal">
                          ({grouped[mod].length})
                        </span>
                      </span>
                    </td>
                  </tr>
                  {!collapsed[mod] &&
                    grouped[mod].map((perm) => (
                      <tr
                        key={perm.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-800 pl-7">{perm.docType}</td>
                        {PERM_COLS.map((col) => (
                          <td key={col.key} className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={perm[col.key] as boolean}
                              onChange={(e) =>
                                handlePermChange(perm.id, col.key, e.target.checked)
                              }
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleScopeToggle(perm.id)}
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                              perm.scopeEnabled
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            )}
                          >
                            {perm.scopeEnabled ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        {onConfigureFields && (
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => onConfigureFields(perm.docType)}
                              className="text-xs text-blue-500 hover:text-blue-700 hover:underline ml-2 whitespace-nowrap"
                            >
                              Configure Fields &rarr;
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pendingToast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <span className="text-sm">Permission change pending...</span>
          <button onClick={handleUndo} className="text-sm text-blue-400 hover:text-blue-300 font-medium">Undo</button>
        </div>
      )}
    </div>
  )
}
