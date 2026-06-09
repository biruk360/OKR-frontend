'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTIONS = [
  'read',
  'write',
  'create',
  'delete',
  'submit',
  'cancel',
  'amend',
  'export',
  'share',
] as const

type Action = typeof ACTIONS[number]

const SCOPES = ['own', 'department', 'all'] as const
type Scope = typeof SCOPES[number]

interface DocType {
  key: string
  label: string
  module: string
}

interface Role {
  id: string
  name: string
  label: string
}

interface ActionPermission {
  granted: boolean
  scope: Scope
}

type RolePermissions = Record<string, Record<Action, ActionPermission>>

interface DocTypePermissionsResponse {
  doctype: DocType
  permissions: Array<{
    roleId: string
    roleName: string
    actions: Record<Action, ActionPermission>
  }>
}

function scopeColor(scope: Scope) {
  switch (scope) {
    case 'own':        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'department': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'all':        return 'bg-green-100 text-green-700 border-green-200'
  }
}

function groupByModule(doctypes: DocType[]) {
  return doctypes.reduce<Record<string, DocType[]>>((acc, dt) => {
    if (!acc[dt.module]) acc[dt.module] = []
    acc[dt.module].push(dt)
    return acc
  }, {})
}

export default function ByDocTypeTab() {
  const [selectedDoctypeKey, setSelectedDoctypeKey] = useState<string>('')
  const [doctypes, setDoctypes] = useState<DocType[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({})
  const [loadingDoctypes, setLoadingDoctypes] = useState(true)
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoadingDoctypes(true)
    Promise.all([
      fetch('/api/permissions/doctypes').then(r => r.json()),
      fetch('/api/permissions/roles').then(r => r.json()),
    ])
      .then(([dtRes, rolesRes]) => {
        if (dtRes.success) {
          // API returns { modules: { okr: [...], work: [...] } } — flatten to array
          const modules: Record<string, DocType[]> = dtRes.data?.modules ?? {}
          setDoctypes(Object.values(modules).flat())
        } else setError(dtRes.error ?? 'Failed to load doc types')
        if (rolesRes.success && Array.isArray(rolesRes.data)) setRoles(rolesRes.data)
        else if (!rolesRes.success) setError(rolesRes.error ?? 'Failed to load roles')
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoadingDoctypes(false))
  }, [])

  const loadDocTypePermissions = useCallback(async (key: string) => {
    setLoadingGrid(true)
    setError(null)
    try {
      const res = await fetch(`/api/permissions/doctypes/${encodeURIComponent(key)}`).then(r => r.json())
      if (!res.success) { setError(res.error ?? 'Failed to load permissions'); return }
      const data: DocTypePermissionsResponse = res.data
      const matrix: RolePermissions = {}
      for (const row of data.permissions) {
        matrix[row.roleId] = row.actions
      }
      setRolePermissions(matrix)
    } catch {
      setError('Failed to load permissions')
    } finally {
      setLoadingGrid(false)
    }
  }, [])

  const handleDoctypeChange = (key: string) => {
    setSelectedDoctypeKey(key)
    setRolePermissions({})
    if (key) loadDocTypePermissions(key)
  }

  const toggleAction = useCallback(async (roleId: string, action: Action) => {
    const current = rolePermissions[roleId]?.[action] ?? { granted: false, scope: 'own' as Scope }
    const next: ActionPermission = { ...current, granted: !current.granted }
    const cellKey = `${roleId}:${action}`

    setRolePermissions(prev => ({
      ...prev,
      [roleId]: { ...(prev[roleId] ?? {}), [action]: next },
    }))
    setSavingKey(cellKey)
    setError(null)

    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(roleId)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctypeKey: selectedDoctypeKey,
          action,
          granted: next.granted,
          scope: next.scope,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        setRolePermissions(prev => ({
          ...prev,
          [roleId]: { ...(prev[roleId] ?? {}), [action]: current },
        }))
        setError(json.error ?? 'Failed to save')
      }
    } catch {
      setRolePermissions(prev => ({
        ...prev,
        [roleId]: { ...(prev[roleId] ?? {}), [action]: current },
      }))
      setError('Failed to save permission')
    } finally {
      setSavingKey(null)
    }
  }, [rolePermissions, selectedDoctypeKey])

  const updateScope = useCallback(async (roleId: string, action: Action, scope: Scope) => {
    const current = rolePermissions[roleId]?.[action] ?? { granted: false, scope: 'own' as Scope }
    const next: ActionPermission = { ...current, scope }
    const cellKey = `${roleId}:${action}:scope`

    setRolePermissions(prev => ({
      ...prev,
      [roleId]: { ...(prev[roleId] ?? {}), [action]: next },
    }))
    setSavingKey(cellKey)
    setError(null)

    try {
      const res = await fetch(`/api/permissions/roles/${encodeURIComponent(roleId)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctypeKey: selectedDoctypeKey,
          action,
          granted: next.granted,
          scope,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        setRolePermissions(prev => ({
          ...prev,
          [roleId]: { ...(prev[roleId] ?? {}), [action]: current },
        }))
        setError(json.error ?? 'Failed to save')
      }
    } catch {
      setRolePermissions(prev => ({
        ...prev,
        [roleId]: { ...(prev[roleId] ?? {}), [action]: current },
      }))
      setError('Failed to save scope')
    } finally {
      setSavingKey(null)
    }
  }, [rolePermissions, selectedDoctypeKey])

  const grouped = groupByModule(doctypes)

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-start gap-4 flex-wrap">
        <div className="space-y-1 min-w-64">
          <label className="block text-sm font-medium text-foreground">Document Type</label>
          {loadingDoctypes ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <select
              value={selectedDoctypeKey}
              onChange={e => handleDoctypeChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a document type…</option>
              {Object.entries(grouped).map(([module, types]) => (
                <optgroup key={module} label={module}>
                  {types.map(dt => (
                    <option key={dt.key} value={dt.key}>{dt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {selectedDoctypeKey && !loadingGrid && (
          <div className="pt-6 text-xs text-muted-foreground self-end pb-2">
            Showing permissions for <span className="font-semibold text-foreground">
              {doctypes.find(d => d.key === selectedDoctypeKey)?.label ?? selectedDoctypeKey}
            </span>. Changes are saved instantly.
          </div>
        )}
      </div>

      {!selectedDoctypeKey && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border border-dashed border-border text-muted-foreground text-sm text-center">
          <p className="font-medium">Select a document type to configure role permissions</p>
          <p className="mt-1 text-xs">The grid will show all roles and their 9 actions + scope.</p>
        </div>
      )}

      {selectedDoctypeKey && loadingGrid && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading permissions…
        </div>
      )}

      {selectedDoctypeKey && !loadingGrid && roles.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-foreground sticky left-0 bg-muted/50 min-w-36">
                  Role
                </th>
                {ACTIONS.map(action => (
                  <th key={action} className="px-3 py-3 text-center font-semibold text-foreground capitalize min-w-20">
                    {action}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-semibold text-foreground min-w-32">Scope</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, idx) => {
                const perms = rolePermissions[role.id] ?? {}
                const firstGrantedAction = ACTIONS.find(a => perms[a]?.granted)
                const currentScope: Scope = firstGrantedAction
                  ? (perms[firstGrantedAction]?.scope ?? 'own')
                  : 'own'
                const hasAnyGranted = ACTIONS.some(a => perms[a]?.granted)

                return (
                  <tr
                    key={role.id}
                    className={cn(
                      'border-b border-border last:border-0 hover:bg-muted/20 transition-colors',
                      idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'
                    )}
                  >
                    <td className="px-4 py-3 sticky left-0 bg-inherit font-medium text-foreground whitespace-nowrap">
                      {role.label}
                    </td>
                    {ACTIONS.map(action => {
                      const perm = perms[action] ?? { granted: false, scope: 'own' as Scope }
                      const cellKey = `${role.id}:${action}`
                      const isSaving = savingKey === cellKey

                      return (
                        <td key={action} className="px-3 py-3 text-center">
                          <button
                            onClick={() => toggleAction(role.id, action)}
                            disabled={isSaving}
                            className={cn(
                              'mx-auto flex h-7 w-7 items-center justify-center rounded-full border transition-all cursor-pointer hover:scale-110',
                              perm.granted
                                ? 'bg-green-500 border-green-600 text-white'
                                : 'bg-white border-gray-300 text-gray-400',
                              isSaving && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : perm.granted ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 py-3 text-center">
                      {hasAnyGranted ? (
                        <select
                          value={currentScope}
                          onChange={e => {
                            const newScope = e.target.value as Scope
                            const grantedActions = ACTIONS.filter(a => perms[a]?.granted)
                            for (const a of grantedActions) {
                              updateScope(role.id, a, newScope)
                            }
                          }}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer',
                            scopeColor(currentScope)
                          )}
                        >
                          {SCOPES.map(s => (
                            <option key={s} value={s} className="bg-white text-foreground capitalize">{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedDoctypeKey && !loadingGrid && (
        <p className="text-xs text-muted-foreground">
          Scope applies to all granted actions for that role.{' '}
          <span className="font-medium">Own</span> = records they created,{' '}
          <span className="font-medium">Department</span> = their department's records,{' '}
          <span className="font-medium">All</span> = every record.
        </p>
      )}
    </div>
  )
}
