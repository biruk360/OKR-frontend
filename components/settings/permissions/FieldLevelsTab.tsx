'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, EyeOff, Loader2, Lock, Plus, Save } from 'lucide-react'

interface DocType { key: string; displayName: string; module: string }
interface Role { id: string; name: string; key: string }
interface FieldDefinition {
  id?: string
  fieldName: string
  displayLabel: string
  permLevel: number
  isSensitive: boolean
}
interface FieldAccess { canRead: boolean; canWrite: boolean }

interface FieldLevelsTabProps { initialDoctype?: string }

export default function FieldLevelsTab({ initialDoctype }: FieldLevelsTabProps) {
  const [doctypes, setDoctypes] = useState<DocType[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedDoctype, setSelectedDoctype] = useState(initialDoctype ?? '')
  const [selectedRole, setSelectedRole] = useState('')
  const [fields, setFields] = useState<FieldDefinition[]>([])
  const [access, setAccess] = useState<Record<string, FieldAccess>>({})
  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingFields, setLoadingFields] = useState(false)
  const [saving, setSaving] = useState(false)
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
      setSelectedRole(roleResponse.data?.[0]?.id ?? '')
    }).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load permission data'))
      .finally(() => setLoadingInit(false))
  }, [])

  useEffect(() => { if (initialDoctype) setSelectedDoctype(initialDoctype) }, [initialDoctype])

  useEffect(() => {
    if (!selectedDoctype || !selectedRole) return
    setLoadingFields(true)
    setError(null)
    Promise.all([
      fetch(`/api/permissions/doctypes/${encodeURIComponent(selectedDoctype)}`).then((response) => response.json()),
      fetch(`/api/permissions/roles/${encodeURIComponent(selectedRole)}/field-permissions/${encodeURIComponent(selectedDoctype)}`).then((response) => response.json()),
    ]).then(([doctypeResponse, accessResponse]) => {
      if (!doctypeResponse.success) throw new Error(doctypeResponse.error ?? 'Failed to load fields')
      if (!accessResponse.success) throw new Error(accessResponse.error ?? 'Failed to load field access')
      setFields(doctypeResponse.data.fields ?? [])
      const nextAccess: Record<string, FieldAccess> = {}
      for (const row of accessResponse.data?.fieldPerms ?? []) {
        nextAccess[row.fieldName] = { canRead: row.canRead, canWrite: row.canWrite }
      }
      setAccess(nextAccess)
    }).catch((err) => {
      setFields([])
      setError(err instanceof Error ? err.message : 'Failed to load field permissions')
    }).finally(() => setLoadingFields(false))
  }, [selectedDoctype, selectedRole])

  function updateField(fieldName: string, changes: Partial<FieldDefinition>) {
    setFields((current) => current.map((field) => field.fieldName === fieldName ? { ...field, ...changes } : field))
  }

  function updateAccess(fieldName: string, changes: Partial<FieldAccess>) {
    setAccess((current) => ({ ...current, [fieldName]: { ...(current[fieldName] ?? { canRead: true, canWrite: false }), ...changes } }))
  }

  function addField() {
    const fieldName = window.prompt('Field name (for example: status)')?.trim()
    if (!fieldName) return
    if (fields.some((field) => field.fieldName === fieldName)) {
      setError(`Field "${fieldName}" already exists`)
      return
    }
    const displayLabel = window.prompt('Display label', fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()))?.trim()
    if (!displayLabel) return
    setFields((current) => [...current, { fieldName, displayLabel, permLevel: 0, isSensitive: false }])
    setAccess((current) => ({ ...current, [fieldName]: { canRead: true, canWrite: false } }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const [fieldResponse, accessResponse] = await Promise.all([
        fetch(`/api/permissions/doctypes/${encodeURIComponent(selectedDoctype)}/fields`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fields.map(({ fieldName, displayLabel, permLevel, isSensitive }) => ({ fieldName, displayLabel, permLevel, isSensitive })) }),
        }),
        fetch(`/api/permissions/roles/${encodeURIComponent(selectedRole)}/field-permissions/${encodeURIComponent(selectedDoctype)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldPerms: fields.map((field) => ({ fieldName: field.fieldName, ...(access[field.fieldName] ?? { canRead: true, canWrite: false }) })) }),
        }),
      ])
      const [fieldJson, accessJson] = await Promise.all([fieldResponse.json(), accessResponse.json()])
      if (!fieldResponse.ok || !fieldJson.success) throw new Error(fieldJson.error ?? 'Failed to save field definitions')
      if (!accessResponse.ok || !accessJson.success) throw new Error(accessJson.error ?? 'Failed to save field access')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save field permissions')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
      <div className="flex flex-wrap items-end gap-4">
        {loadingInit ? <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div> : <>
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Document Type</label><select value={selectedDoctype} onChange={(event) => setSelectedDoctype(event.target.value)} className="min-w-56 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"><option value="">Select a document type…</option>{doctypes.map((doctype) => <option key={doctype.key} value={doctype.key}>{doctype.displayName}</option>)}</select></div>
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Role</label><select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} className="min-w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
          <button onClick={addField} disabled={!selectedDoctype || loadingFields} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"><Plus className="h-4 w-4" />Add Field</button>
          <button onClick={() => void save()} disabled={!selectedDoctype || !selectedRole || loadingFields || saving} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes</button>
        </>}
      </div>

      {!selectedDoctype ? <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-20 text-sm text-gray-400"><Lock className="mb-3 h-10 w-10 text-gray-300" /><p className="font-medium text-gray-500">Select a document type to configure field-level permissions</p></div> : loadingFields ? <div className="py-20 text-center text-gray-400"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Loading fields…</div> : fields.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-400"><EyeOff className="mb-2 h-8 w-8 text-gray-300" /><p>No fields are registered for this document type.</p><button onClick={addField} className="mt-3 text-blue-600 hover:underline">Add the first field</button></div> : (
        <div className="overflow-x-auto rounded-lg border border-gray-200"><table className="min-w-full text-sm"><thead className="border-b border-gray-200 bg-gray-50"><tr><th className="px-3 py-2.5 text-left font-semibold text-gray-600">Field</th><th className="px-3 py-2.5 text-left font-semibold text-gray-600">Label</th><th className="px-3 py-2.5 text-center font-semibold text-gray-600">Level</th><th className="px-3 py-2.5 text-center font-semibold text-gray-600">Sensitive</th><th className="px-3 py-2.5 text-center font-semibold text-gray-600">Read</th><th className="px-3 py-2.5 text-center font-semibold text-gray-600">Write</th></tr></thead><tbody className="divide-y divide-gray-100">
          {fields.map((field) => { const fieldAccess = access[field.fieldName] ?? { canRead: true, canWrite: false }; return <tr key={field.fieldName} className="hover:bg-gray-50"><td className="px-3 py-2 font-mono text-xs text-gray-700">{field.fieldName}</td><td className="px-3 py-2"><input value={field.displayLabel} onChange={(event) => updateField(field.fieldName, { displayLabel: event.target.value })} className="w-full rounded border border-gray-300 px-2 py-1.5" /></td><td className="px-3 py-2 text-center"><select value={field.permLevel} onChange={(event) => updateField(field.fieldName, { permLevel: Number(event.target.value) })} className="rounded border border-gray-300 px-2 py-1.5"><option value={0}>0 · Public</option><option value={1}>1 · Internal</option><option value={2}>2 · Restricted</option><option value={3}>3 · Sensitive</option></select></td><td className="px-3 py-2 text-center"><input type="checkbox" checked={field.isSensitive} onChange={(event) => updateField(field.fieldName, { isSensitive: event.target.checked })} /></td><td className="px-3 py-2 text-center"><input type="checkbox" checked={fieldAccess.canRead} onChange={(event) => updateAccess(field.fieldName, { canRead: event.target.checked })} /></td><td className="px-3 py-2 text-center"><input type="checkbox" checked={fieldAccess.canWrite} onChange={(event) => updateAccess(field.fieldName, { canWrite: event.target.checked })} /></td></tr> })}
        </tbody></table></div>
      )}
    </div>
  )
}
