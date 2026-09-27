'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertCircle, EyeOff, Loader2, Lock, Plus, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SettingsSelect } from '../SettingsSelect'

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

interface AddFieldValues { fieldName: string; displayLabel: string }

function humanise(fieldName: string) {
  return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()).trim()
}

const PERM_LEVEL_OPTIONS = [
  { value: '0', label: '0 · Public' },
  { value: '1', label: '1 · Internal' },
  { value: '2', label: '2 · Restricted' },
  { value: '3', label: '3 · Sensitive' },
]

/** Replaces the two window.prompt() calls that used to collect a new field. */
function AddFieldModal({
  existing,
  onClose,
  onAdd,
}: {
  existing: string[]
  onClose: () => void
  onAdd: (values: AddFieldValues) => void
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<AddFieldValues>({ defaultValues: { fieldName: '', displayLabel: '' } })
  const fieldNameInput = register('fieldName', {
    required: 'Field name is required',
    validate: (value) => {
      const name = value.trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'Use letters, digits and underscores (e.g. status)'
      if (existing.includes(name)) return `Field "${name}" already exists`
      return true
    },
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Add field"
      icon={Plus}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-field-form">Add field</Button>
        </>
      }
    >
      <form
        id="add-field-form"
        onSubmit={handleSubmit((values) => onAdd({ fieldName: values.fieldName.trim(), displayLabel: values.displayLabel.trim() || humanise(values.fieldName.trim()) }))}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="add-field-name">Field name *</Label>
          <Input
            id="add-field-name"
            className="font-mono"
            placeholder="status"
            aria-invalid={Boolean(errors.fieldName)}
            {...fieldNameInput}
            onChange={(event) => {
              void fieldNameInput.onChange(event)
              if (!dirtyFields.displayLabel) setValue('displayLabel', humanise(event.target.value.trim()))
            }}
          />
          {errors.fieldName && <p className="text-xs text-danger-600">{errors.fieldName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-field-label">Display label</Label>
          <Input id="add-field-label" {...register('displayLabel')} />
        </div>
      </form>
    </Modal>
  )
}

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
  const [addingField, setAddingField] = useState(false)

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
    setAddingField(true)
  }

  function handleAddField({ fieldName, displayLabel }: AddFieldValues) {
    setFields((current) => [...current, { fieldName, displayLabel, permLevel: 0, isSensitive: false }])
    setAccess((current) => ({ ...current, [fieldName]: { canRead: true, canWrite: false } }))
    setAddingField(false)
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
      {error && <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"><AlertCircle className="size-4" />{error}</div>}
      <div className="flex flex-wrap items-end gap-4">
        {loadingInit ? (
          <div className="flex flex-wrap items-end gap-4" aria-busy="true" aria-label="Loading document types and roles">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-8 w-56" />
          </div>
        ) : <>
          <div className="space-y-1">
            <label htmlFor="field-levels-doctype" className="block text-sm font-medium text-foreground">Document Type</label>
            <SettingsSelect
              id="field-levels-doctype"
              value={selectedDoctype}
              onValueChange={setSelectedDoctype}
              placeholder="Select a document type…"
              options={doctypes.map((doctype) => ({ value: doctype.key, label: doctype.displayName }))}
              className="min-w-56"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="field-levels-role" className="block text-sm font-medium text-foreground">Role</label>
            <SettingsSelect
              id="field-levels-role"
              value={selectedRole}
              onValueChange={setSelectedRole}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
              className="min-w-48"
            />
          </div>
          <Button variant="outline" onClick={addField} disabled={!selectedDoctype || loadingFields}><Plus />Add field</Button>
          <Button onClick={() => void save()} disabled={!selectedDoctype || !selectedRole || loadingFields || saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save changes</Button>
        </>}
      </div>

      {!selectedDoctype ? (
        <EmptyState
          bare
          icon={Lock}
          className="rounded-lg border border-dashed border-border"
          title="Select a document type to configure field-level permissions"
        />
      ) : loadingFields ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading fields">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : fields.length === 0 ? (
        <EmptyState
          bare
          icon={EyeOff}
          title="No fields are registered for this document type."
          action={{ label: 'Add the first field', onClick: addField }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border"><table className="min-w-full text-sm"><thead className="border-b border-border bg-muted/50"><tr><th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Field</th><th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Label</th><th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Level</th><th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Sensitive</th><th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Read</th><th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Write</th></tr></thead><tbody className="divide-y divide-border">
          {fields.map((field) => { const fieldAccess = access[field.fieldName] ?? { canRead: true, canWrite: false }; return <tr key={field.fieldName} className="hover:bg-muted/50"><td className="px-3 py-2 font-mono text-xs text-foreground">{field.fieldName}</td><td className="px-3 py-2"><input aria-label={`Label for ${field.fieldName}`} value={field.displayLabel} onChange={(event) => updateField(field.fieldName, { displayLabel: event.target.value })} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm" /></td><td className="px-3 py-2 text-center"><SettingsSelect size="sm" aria-label={`Permission level for ${field.fieldName}`} value={String(field.permLevel)} onValueChange={(value) => updateField(field.fieldName, { permLevel: Number(value) })} options={PERM_LEVEL_OPTIONS} className="w-auto min-w-36" /></td><td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`${field.fieldName} is sensitive`} checked={field.isSensitive} onChange={(event) => updateField(field.fieldName, { isSensitive: event.target.checked })} /></td><td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`Can read ${field.fieldName}`} checked={fieldAccess.canRead} onChange={(event) => updateAccess(field.fieldName, { canRead: event.target.checked })} /></td><td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`Can write ${field.fieldName}`} checked={fieldAccess.canWrite} onChange={(event) => updateAccess(field.fieldName, { canWrite: event.target.checked })} /></td></tr> })}
        </tbody></table></div>
      )}

      {addingField && (
        <AddFieldModal
          existing={fields.map((field) => field.fieldName)}
          onClose={() => setAddingField(false)}
          onAdd={handleAddField}
        />
      )}
    </div>
  )
}
