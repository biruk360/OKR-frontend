'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, Loader2, Eye, EyeOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const FIELD_PERMS = ['visible', 'editable', 'mandatory'] as const
type FieldPerm = typeof FIELD_PERMS[number]

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

interface FieldDef {
  fieldname: string
  label: string
  fieldtype: string
}

interface FieldPermRow {
  fieldname: string
  label: string
  fieldtype: string
  visible: boolean
  editable: boolean
  mandatory: boolean
}

type FieldMatrix = Record<string, FieldPermRow[]>

function fieldtypeIcon(ft: string) {
  switch (ft.toLowerCase()) {
    case 'link': return '🔗'
    case 'date': return '📅'
    case 'check': return '☑'
    case 'select': return '▼'
    case 'text':
    case 'small text':
    case 'long text': return '📝'
    case 'int':
    case 'float':
    case 'currency': return '#'
    default: return '▪'
  }
}

interface FieldReadWrite {
  canRead: boolean
  canWrite: boolean
}

interface FieldLevelsTabProps {
  initialDoctype?: string
}

export default function FieldLevelsTab({ initialDoctype }: FieldLevelsTabProps = {}) {
  const [doctypes, setDoctypes] = useState<DocType[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedDoctype, setSelectedDoctype] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [fields, setFields] = useState<FieldPermRow[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingFields, setLoadingFields] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldPerms, setFieldPerms] = useState<Map<string, FieldReadWrite>>(new Map())
  const [fieldPermsLoading, setFieldPermsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/permissions/doctypes').then(r => r.json()),
      fetch('/api/permissions/roles').then(r => r.json()),
    ])
      .then(([dtRes, rolesRes]) => {
        if (dtRes.success) setDoctypes(dtRes.data)
        if (rolesRes.success) {
          setRoles(rolesRes.data)
          if (rolesRes.data.length > 0) setSelectedRole(rolesRes.data[0].id)
        }
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoadingInit(false))
  }, [])

  useEffect(() => {
    if (!initialDoctype) return
    setSelectedDoctype(initialDoctype)
  }, [initialDoctype])

  useEffect(() => {
    if (!selectedDoctype || !selectedRole) return
    setLoadingFields(true)
    setError(null)
    fetch(`/api/permissions/field-levels?doctype=${encodeURIComponent(selectedDoctype)}&roleId=${encodeURIComponent(selectedRole)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setFields(json.data)
        else setError(json.error ?? 'Failed to load field permissions')
      })
      .catch(() => setError('Failed to load field permissions'))
      .finally(() => setLoadingFields(false))
  }, [selectedDoctype, selectedRole])

  useEffect(() => {
    if (!selectedDoctype || !selectedRole) {
      setFieldPerms(new Map())
      return
    }
    setFieldPermsLoading(true)
    fetch(`/api/permissions/roles/${encodeURIComponent(selectedRole)}/field-permissions/${encodeURIComponent(selectedDoctype)}`)
      .then(r => r.json())
      .then(json => {
        if (json.fieldPerms) {
          const map = new Map<string, FieldReadWrite>()
          for (const entry of json.fieldPerms as Array<{ fieldName: string; canRead: boolean; canWrite: boolean }>) {
            map.set(entry.fieldName, { canRead: entry.canRead, canWrite: entry.canWrite })
          }
          setFieldPerms(map)
        }
      })
      .catch(() => {/* silently ignore — checkboxes fall back to defaults */})
      .finally(() => setFieldPermsLoading(false))
  }, [selectedDoctype, selectedRole])

  const handleFieldPermChange = useCallback(
    (fieldName: string, key: 'canRead' | 'canWrite', value: boolean) => {
      setFieldPerms(prev => {
        const next = new Map(prev)
        const current = next.get(fieldName) ?? { canRead: true, canWrite: false }
        next.set(fieldName, { ...current, [key]: value })
        return next
      })

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setFieldPerms(snapshot => {
          const payload = Array.from(snapshot.entries()).map(([fn, perms]) => ({
            fieldName: fn,
            canRead: perms.canRead,
            canWrite: perms.canWrite,
          }))
          fetch(
            `/api/permissions/roles/${encodeURIComponent(selectedRole)}/field-permissions/${encodeURIComponent(selectedDoctype)}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fieldPerms: payload }),
            }
          ).catch(() => setError('Failed to save read/write permissions'))
          return snapshot
        })
      }, 800)
    },
    [selectedDoctype, selectedRole]
  )

  const toggleField = useCallback(async (fieldname: string, perm: FieldPerm) => {
    const current = fields.find(f => f.fieldname === fieldname)
    if (!current) return
    const next = { ...current, [perm]: !current[perm] }
    setFields(prev => prev.map(f => f.fieldname === fieldname ? next : f))
    setSaving(true)
    try {
      const res = await fetch('/api/permissions/field-levels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctype: selectedDoctype, roleId: selectedRole, fieldname, [perm]: next[perm] }),
      })
      const json = await res.json()
      if (!json.success) {
        setFields(prev => prev.map(f => f.fieldname === fieldname ? current : f))
        setError(json.error ?? 'Failed to save')
      }
    } catch {
      setFields(prev => prev.map(f => f.fieldname === fieldname ? current : f))
      setError('Failed to save field permission')
    } finally {
      setSaving(false)
    }
  }, [fields, selectedDoctype, selectedRole])

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        {loadingInit ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Document Type</label>
              <select
                value={selectedDoctype}
                onChange={e => setSelectedDoctype(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-48"
              >
                <option value="">Select a document type…</option>
                {doctypes.map(dt => (
                  <option key={dt.key} value={dt.key}>{dt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.label || r.name}</option>
                ))}
              </select>
            </div>
            {saving && (
              <div className="flex items-center gap-1 text-xs text-gray-400 pb-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </div>
            )}
          </>
        )}
      </div>

      {!selectedDoctype && (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm text-center">
          <Lock className="h-10 w-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">Select a document type to configure field-level permissions</p>
          <p className="mt-1 text-xs">Control visibility, editability, and mandatory status per role per field.</p>
        </div>
      )}

      {selectedDoctype && loadingFields && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading fields…
        </div>
      )}

      {selectedDoctype && !loadingFields && fields.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground mb-2">
            Field level controls which roles can see a field. Read/Write toggles apply within that level.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-8">Type</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Field</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">
                    <span className="flex items-center justify-center gap-1"><Eye className="h-3.5 w-3.5" /> Visible</span>
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">Editable</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">Mandatory</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-20">Read</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-20">Write</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {fields.map(field => (
                  <tr key={field.fieldname} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 text-center text-xs text-gray-400" title={field.fieldtype}>
                      {fieldtypeIcon(field.fieldtype)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-gray-800">{field.label}</span>
                      <span className="ml-2 text-xs text-gray-400">{field.fieldname}</span>
                    </td>
                    {FIELD_PERMS.map(perm => (
                      <td key={perm} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={field[perm]}
                          onChange={() => toggleField(field.fieldname, perm)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={fieldPerms.get(field.fieldname)?.canRead ?? true}
                        onChange={(e) => handleFieldPermChange(field.fieldname, 'canRead', e.target.checked)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={fieldPerms.get(field.fieldname)?.canWrite ?? false}
                        onChange={(e) => handleFieldPermChange(field.fieldname, 'canWrite', e.target.checked)}
                        className="rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedDoctype && !loadingFields && fields.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
          <EyeOff className="h-8 w-8 text-gray-300 mb-2" />
          <p>No field definitions found for this document type.</p>
        </div>
      )}
    </div>
  )
}
