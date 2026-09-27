'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingsSelect } from '../SettingsSelect'

function GridSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  )
}

interface DocType { key: string; displayName: string; module: string }
interface Role { id: string; name: string; key: string }

type ActionField =
  | 'canRead' | 'canWrite' | 'canCreate' | 'canDelete' | 'canSubmit'
  | 'canExport' | 'canPrint' | 'canShare' | 'canImport' | 'canReport'

interface PermissionState extends Record<ActionField, boolean> {
  doctypeKey: string
  permLevel: number
  applyScoping: boolean
}

const ACTIONS: Array<{ field: ActionField; label: string }> = [
  { field: 'canRead', label: 'Read' },
  { field: 'canWrite', label: 'Write' },
  { field: 'canCreate', label: 'Create' },
  { field: 'canDelete', label: 'Delete' },
  { field: 'canSubmit', label: 'Submit' },
  { field: 'canExport', label: 'Export' },
  { field: 'canPrint', label: 'Print' },
  { field: 'canShare', label: 'Share' },
  { field: 'canImport', label: 'Import' },
  { field: 'canReport', label: 'Report' },
]

function emptyPermission(doctypeKey: string): PermissionState {
  return {
    doctypeKey, permLevel: 0, applyScoping: false,
    canRead: false, canWrite: false, canCreate: false, canDelete: false,
    canSubmit: false, canExport: false, canPrint: false, canShare: false,
    canImport: false, canReport: false,
  }
}

export default function ByDocTypeTab() {
  const [doctypes, setDoctypes] = useState<DocType[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedDoctypeKey, setSelectedDoctypeKey] = useState('')
  const [permissions, setPermissions] = useState<Record<string, PermissionState>>({})
  const [loading, setLoading] = useState(true)
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/permissions/doctypes').then((response) => response.json()),
      fetch('/api/permissions/roles').then((response) => response.json()),
    ]).then(([doctypeResponse, roleResponse]) => {
      if (!doctypeResponse.success) throw new Error(doctypeResponse.error ?? 'Failed to load document types')
      if (!roleResponse.success) throw new Error(roleResponse.error ?? 'Failed to load roles')
      const modules: Record<string, DocType[]> = doctypeResponse.data?.modules ?? {}
      setDoctypes(Object.values(modules).flat())
      setRoles(roleResponse.data ?? [])
    }).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load permission data'))
      .finally(() => setLoading(false))
  }, [])

  const loadPermissions = useCallback(async (doctypeKey: string) => {
    if (!doctypeKey) return
    setLoadingGrid(true)
    setError(null)
    try {
      const response = await fetch(`/api/permissions/doctypes/${encodeURIComponent(doctypeKey)}`)
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? 'Failed to load permissions')
      const next: Record<string, PermissionState> = {}
      for (const row of json.data.permissions ?? []) {
        if (row.permLevel === 0 || next[row.roleId] === undefined) {
          next[row.roleId] = {
            doctypeKey,
            permLevel: row.permLevel,
            applyScoping: row.applyScoping,
            canRead: row.canRead,
            canWrite: row.canWrite,
            canCreate: row.canCreate,
            canDelete: row.canDelete,
            canSubmit: row.canSubmit,
            canExport: row.canExport,
            canPrint: row.canPrint,
            canShare: row.canShare,
            canImport: row.canImport,
            canReport: row.canReport,
          }
        }
      }
      setPermissions(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions')
    } finally {
      setLoadingGrid(false)
    }
  }, [])

  async function save(roleId: string, next: PermissionState, cellKey: string) {
    setSavingKey(cellKey)
    setError(null)
    setPermissions((current) => ({ ...current, [roleId]: next }))
    try {
      const response = await fetch(`/api/permissions/roles/${encodeURIComponent(roleId)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [next] }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error ?? 'Failed to save permission')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permission')
      await loadPermissions(selectedDoctypeKey)
    } finally {
      setSavingKey(null)
    }
  }

  const grouped = doctypes.reduce<Record<string, DocType[]>>((result, doctype) => {
    ;(result[doctype.module] ??= []).push(doctype)
    return result
  }, {})

  if (loading) return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-full max-w-sm" />
      <GridSkeleton label="Loading permission data" />
    </div>
  )

  return (
    <div className="space-y-5">
      {error && <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"><AlertCircle className="h-4 w-4" />{error}</div>}
      <div className="max-w-sm space-y-1">
        <label htmlFor="by-doctype-select" className="block text-sm font-medium text-ink-primary">Document Type</label>
        <SettingsSelect
          id="by-doctype-select"
          value={selectedDoctypeKey}
          onValueChange={(key) => { setSelectedDoctypeKey(key); setPermissions({}); void loadPermissions(key) }}
          placeholder="Select a document type…"
          options={Object.entries(grouped).flatMap(([moduleName, items]) =>
            items.map((doctype) => ({ value: doctype.key, label: doctype.displayName, group: moduleName })),
          )}
        />
      </div>

      {!selectedDoctypeKey ? (
        <EmptyState
          bare
          className="rounded-lg border border-dashed border-border"
          title="Select a document type to configure role permissions"
          description="The grid shows every role, action, and record-scope setting."
        />
      ) : loadingGrid ? (
        <GridSkeleton label="Loading permissions" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface-hover"><tr>
              <th className="sticky left-0 min-w-44 bg-surface-hover px-4 py-3 text-left font-semibold text-ink-primary">Role</th>
              {ACTIONS.map((action) => <th key={action.field} className="min-w-20 px-2 py-3 text-center font-semibold text-ink-primary">{action.label}</th>)}
              <th className="min-w-24 px-2 py-3 text-center font-semibold text-ink-primary">Scoping</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {roles.map((role) => {
                const permission = permissions[role.id] ?? emptyPermission(selectedDoctypeKey)
                return <tr key={role.id} className="hover:bg-surface-hover">
                  <td className="sticky left-0 bg-surface-card px-4 py-3 font-medium text-ink-primary">{role.name}</td>
                  {ACTIONS.map((action) => {
                    const cellKey = `${role.id}:${action.field}`
                    return <td key={action.field} className="px-2 py-3 text-center"><button disabled={savingKey !== null} aria-label={`${action.label} for ${role.name}: ${permission[action.field] ? 'allowed' : 'not allowed'}`} aria-pressed={permission[action.field]} onClick={() => void save(role.id, { ...permission, [action.field]: !permission[action.field] }, cellKey)} className={cn('mx-auto flex h-7 w-7 items-center justify-center rounded-full border', permission[action.field] ? 'border-success-600 bg-success-500 text-primary-foreground' : 'border-ink-tertiary bg-surface-card text-ink-secondary', savingKey !== null && 'opacity-60')}>
                      {savingKey === cellKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : permission[action.field] ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </button></td>
                  })}
                  <td className="px-2 py-3 text-center"><button disabled={savingKey !== null} aria-label={`Record scoping for ${role.name}`} aria-pressed={permission.applyScoping} onClick={() => void save(role.id, { ...permission, applyScoping: !permission.applyScoping }, `${role.id}:scope`)} className={cn('rounded-full px-2 py-1 text-xs font-medium', permission.applyScoping ? 'bg-primary-100 text-primary-700' : 'bg-surface-app text-ink-secondary')}>{savingKey === `${role.id}:scope` ? 'Saving…' : permission.applyScoping ? 'ON' : 'OFF'}</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
