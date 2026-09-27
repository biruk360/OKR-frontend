'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Loader2, Shield, Plus, Trash2, Search, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
// Shared Zod bridge (the repo has no @hookform/resolvers); imported by path to avoid the auth UI barrel.
import { zodFormResolver } from '@/features/auth/services/zod-resolver'
import { SettingsSelect } from '../SettingsSelect'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_OPERATORS = ['equals', 'in', 'is_child_of', 'is_owner'] as const
const VALID_VALUE_TYPES = [
  'static',
  'user_department',
  'user_id',
  'user_team',
  'user_primary_dept',
] as const

type Operator = typeof VALID_OPERATORS[number]
type ValueType = typeof VALID_VALUE_TYPES[number]

const addRuleSchema = z
  .object({
    doctypeKey: z.string().trim().min(1, 'DocType key is required'),
    fieldName: z.string().trim().min(1, 'Field name is required'),
    operator: z.enum(VALID_OPERATORS),
    valueType: z.enum(VALID_VALUE_TYPES),
    staticValue: z.string(),
  })
  .refine((v) => v.valueType !== 'static' || v.staticValue.trim().length > 0, {
    path: ['staticValue'],
    message: 'Static value is required',
  })

type AddRuleValues = z.infer<typeof addRuleSchema>

const EMPTY_RULE: AddRuleValues = {
  doctypeKey: '',
  fieldName: '',
  operator: 'equals',
  valueType: 'user_id',
  staticValue: '',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Role {
  id: string
  name: string
  label: string
}

interface ScopeRule {
  id: string
  targetType: string
  targetId: string
  doctypeKey: string
  fieldName: string
  operator: Operator
  valueType: ValueType
  staticValue: string | null
  isActive: boolean
  createdAt: string
}

interface UserOption {
  id: string
  name: string
  email: string
  role: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function operatorLabel(op: Operator): string {
  switch (op) {
    case 'equals':      return '='
    case 'in':          return 'IN'
    case 'is_child_of': return 'child of'
    case 'is_owner':    return 'owner'
  }
}

function valueTypeLabel(vt: ValueType): string {
  switch (vt) {
    case 'static':           return 'Static value'
    case 'user_department':  return "User's department"
    case 'user_id':          return "User's ID"
    case 'user_team':        return "User's team"
    case 'user_primary_dept': return "User's primary dept"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecordScopingTab() {
  // -- Role selector (drives the rule list)
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')

  // -- Rules for the selected role (all fetched, optionally filtered by doctype)
  const [rules, setRules] = useState<ScopeRule[]>([])
  const [doctypeFilter, setDoctypeFilter] = useState<string>('')

  // -- Loading / error states
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingRules, setLoadingRules] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // -- Add-rule form
  const [showAdd, setShowAdd] = useState(false)
  const addForm = useForm<AddRuleValues>({
    defaultValues: EMPTY_RULE,
    resolver: zodFormResolver<AddRuleValues>(addRuleSchema),
  })
  const [newDoctypeKey, newFieldName, newValueType, newStaticValue] = addForm.watch(['doctypeKey', 'fieldName', 'valueType', 'staticValue'])
  const adding = addForm.formState.isSubmitting

  // -- Live preview section
  const [previewUserSearch, setPreviewUserSearch] = useState('')
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [previewUser, setPreviewUser] = useState<UserOption | null>(null)
  const [previewDoctypeKey, setPreviewDoctypeKey] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewResult, setPreviewResult] = useState<{
    scopingOn: boolean
    doctypeKey: string
    userName: string
  } | null>(null)

  // ---------------------------------------------------------------------------
  // Load roles on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetch('/api/permissions/roles')
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data.length > 0) {
          setRoles(res.data)
          setSelectedRoleId(res.data[0].id)
        } else if (!res.success) {
          setError(res.error ?? 'Failed to load roles')
        }
      })
      .catch(() => setError('Failed to load roles'))
      .finally(() => setLoadingRoles(false))
  }, [])

  // ---------------------------------------------------------------------------
  // Load scope rules whenever selectedRoleId changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedRoleId) return
    setLoadingRules(true)
    setError(null)
    setRules([])
    fetch(`/api/permissions/roles/${selectedRoleId}/scope-rules`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setRules(res.data)
        else setError(res.error ?? 'Failed to load scope rules')
      })
      .catch(() => setError('Failed to load scope rules'))
      .finally(() => setLoadingRules(false))
  }, [selectedRoleId])

  // ---------------------------------------------------------------------------
  // Load users for preview (once, client-side search)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetch('/api/users/for-selection')
      .then(r => r.json())
      .then(res => {
        if (res.success) setAllUsers(res.data)
      })
      .catch(() => {/* silently ignore — preview is non-critical */})
  }, [])

  // ---------------------------------------------------------------------------
  // Derived: client-side filter by doctypeKey
  // ---------------------------------------------------------------------------
  const visibleRules = doctypeFilter.trim()
    ? rules.filter(r => r.doctypeKey.toLowerCase().includes(doctypeFilter.trim().toLowerCase()))
    : rules

  // Deduplicated list of doctypes that exist in the current rule set (for preview dropdown)
  const knownDoctypes = Array.from(new Set(rules.map(r => r.doctypeKey))).sort()

  // Filtered user suggestions for preview search
  const userSuggestions = previewUserSearch.trim().length >= 1
    ? allUsers.filter(u =>
        u.name.toLowerCase().includes(previewUserSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(previewUserSearch.toLowerCase())
      ).slice(0, 5)
    : []

  // ---------------------------------------------------------------------------
  // Update rule (toggle isActive)
  // ---------------------------------------------------------------------------
  const toggleActive = useCallback(async (rule: ScopeRule) => {
    if (!selectedRoleId) return
    setSaving(rule.id)
    setError(null)
    const original = rule
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))

    try {
      const res = await fetch(
        `/api/permissions/roles/${selectedRoleId}/scope-rules/${rule.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !rule.isActive }),
        }
      )
      const json = await res.json()
      if (!json.success) {
        setRules(prev => prev.map(r => r.id === rule.id ? original : r))
        setError(json.error ?? 'Failed to save')
      } else {
        setRules(prev => prev.map(r => r.id === rule.id ? json.data : r))
      }
    } catch {
      setRules(prev => prev.map(r => r.id === rule.id ? original : r))
      setError('Failed to update scope rule')
    } finally {
      setSaving(null)
    }
  }, [selectedRoleId])

  // ---------------------------------------------------------------------------
  // Delete rule
  // ---------------------------------------------------------------------------
  const deleteRule = useCallback(async (rule: ScopeRule) => {
    if (!selectedRoleId) return
    setDeleting(rule.id)
    setError(null)
    try {
      const res = await fetch(
        `/api/permissions/roles/${selectedRoleId}/scope-rules/${rule.id}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (json.success) {
        setRules(prev => prev.filter(r => r.id !== rule.id))
      } else {
        setError(json.error ?? 'Failed to delete')
      }
    } catch {
      setError('Failed to delete scope rule')
    } finally {
      setDeleting(null)
    }
  }, [selectedRoleId])

  // ---------------------------------------------------------------------------
  // Add rule
  // ---------------------------------------------------------------------------
  const addRule = useCallback(async (values: AddRuleValues) => {
    if (!selectedRoleId) return
    setError(null)
    try {
      const res = await fetch(
        `/api/permissions/roles/${selectedRoleId}/scope-rules`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctypeKey: values.doctypeKey.trim(),
            fieldName: values.fieldName.trim(),
            operator: values.operator,
            valueType: values.valueType,
            staticValue: values.valueType === 'static' ? values.staticValue.trim() : undefined,
          }),
        }
      )
      const json = await res.json()
      if (json.success) {
        setRules(prev => [...prev, json.data])
        addForm.reset(EMPTY_RULE)
        setShowAdd(false)
      } else {
        setError(json.error ?? 'Failed to add rule')
      }
    } catch {
      setError('Failed to add scope rule')
    }
  }, [selectedRoleId, addForm])

  // ---------------------------------------------------------------------------
  // Run preview
  // ---------------------------------------------------------------------------
  const runPreview = useCallback(async () => {
    if (!previewUser || !previewDoctypeKey) return
    setPreviewLoading(true)
    setPreviewResult(null)
    try {
      const res = await fetch(`/api/permissions/preview/${previewUser.id}`)
      const json = await res.json()
      if (json.success) {
        const perms = json.data.effectivePermissions?.doctypePermissions ?? {}
        const entry = perms[previewDoctypeKey]
        setPreviewResult({
          scopingOn: entry ? entry.applyScoping === true : false,
          doctypeKey: previewDoctypeKey,
          userName: previewUser.name,
        })
      } else {
        setError(json.error ?? 'Preview failed')
      }
    } catch {
      setError('Preview request failed')
    } finally {
      setPreviewLoading(false)
    }
  }, [previewUser, previewDoctypeKey])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const selectedRole = roles.find(r => r.id === selectedRoleId)

  if (loadingRoles) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading roles">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Error banner                                                         */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-danger-400 hover:text-danger-600 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Header + role selector                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">Record Scoping Rules</h2>
          <p className="text-sm text-ink-secondary mt-0.5">
            Field-level filters applied when a role queries a DocType.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <label htmlFor="scope-role" className="block text-xs font-medium text-ink-secondary">Role</label>
            <SettingsSelect
              id="scope-role"
              value={selectedRoleId}
              onValueChange={v => { setSelectedRoleId(v); setShowAdd(false) }}
              options={roles.map(r => ({ value: r.id, label: r.label || r.name }))}
              className="min-w-40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="scope-doctype-filter" className="block text-xs font-medium text-ink-secondary">Filter by DocType</label>
            <input
              id="scope-doctype-filter"
              type="text"
              value={doctypeFilter}
              onChange={e => setDoctypeFilter(e.target.value)}
              placeholder="All"
              className="rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-36"
            />
          </div>
          <div className="pb-0.5">
            <button
              onClick={() => setShowAdd(v => !v)}
              disabled={!selectedRoleId}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm font-medium text-ink-primary shadow-sm hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add rule form                                                         */}
      {/* ------------------------------------------------------------------ */}
      {showAdd && selectedRoleId && (
        <form
          onSubmit={addForm.handleSubmit(addRule)}
          noValidate
          className="rounded-lg border border-primary-200 bg-primary-50 p-4 space-y-3"
        >
          <p className="text-sm font-medium text-primary-800">
            New Scope Rule for <span className="font-semibold">{selectedRole?.label || selectedRole?.name}</span>
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label htmlFor="scope-new-doctype" className="block text-xs font-medium text-ink-primary">DocType key</label>
              <input
                id="scope-new-doctype"
                type="text"
                {...addForm.register('doctypeKey')}
                placeholder="e.g. Objective"
                className="rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="scope-new-field" className="block text-xs font-medium text-ink-primary">Field name</label>
              <input
                id="scope-new-field"
                type="text"
                {...addForm.register('fieldName')}
                placeholder="e.g. ownerId"
                className="rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="scope-new-operator" className="block text-xs font-medium text-ink-primary">Operator</label>
              <Controller
                control={addForm.control}
                name="operator"
                render={({ field }) => (
                  <SettingsSelect
                    id="scope-new-operator"
                    value={field.value}
                    onValueChange={v => field.onChange(v as Operator)}
                    options={VALID_OPERATORS.map(op => ({ value: op, label: op }))}
                    className="min-w-32"
                  />
                )}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="scope-new-value-type" className="block text-xs font-medium text-ink-primary">Value type</label>
              <Controller
                control={addForm.control}
                name="valueType"
                render={({ field }) => (
                  <SettingsSelect
                    id="scope-new-value-type"
                    value={field.value}
                    onValueChange={v => field.onChange(v as ValueType)}
                    options={VALID_VALUE_TYPES.map(vt => ({ value: vt, label: valueTypeLabel(vt) }))}
                    className="min-w-44"
                  />
                )}
              />
            </div>
            {newValueType === 'static' && (
              <div className="space-y-1">
                <label htmlFor="scope-new-static" className="block text-xs font-medium text-ink-primary">Static value</label>
                <input
                  id="scope-new-static"
                  type="text"
                  {...addForm.register('staticValue')}
                  placeholder="e.g. active"
                  className="rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={
                  adding ||
                  !newDoctypeKey.trim() ||
                  !newFieldName.trim() ||
                  (newValueType === 'static' && !newStaticValue.trim())
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm font-medium text-ink-primary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Rules table                                                           */}
      {/* ------------------------------------------------------------------ */}
      {loadingRules ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading rules">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : visibleRules.length === 0 ? (
        <EmptyState
          bare
          icon={Shield}
          className="rounded-lg border border-dashed border-border"
          title={rules.length === 0
            ? 'No scope rules configured for this role'
            : 'No rules match the current DocType filter'}
          description="Add a rule to control which records this role can see."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-secondary">DocType</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-secondary">Field</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-secondary w-20">Op</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-secondary">Value type</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ink-secondary">Static value</th>
                <th className="px-3 py-2.5 text-center font-semibold text-ink-secondary w-20">Active</th>
                <th className="px-3 py-2.5 text-center font-semibold text-ink-secondary w-12"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface-card">
              {visibleRules.map(rule => (
                <tr
                  key={rule.id}
                  className={cn(
                    'hover:bg-surface-hover transition-colors',
                    !rule.isActive && 'opacity-50'
                  )}
                >
                  <td className="px-3 py-2 font-medium text-ink-primary font-mono text-xs">{rule.doctypeKey}</td>
                  <td className="px-3 py-2 text-ink-primary font-mono text-xs">{rule.fieldName}</td>
                  <td className="px-3 py-2 text-ink-secondary text-xs">{operatorLabel(rule.operator as Operator)}</td>
                  <td className="px-3 py-2 text-ink-primary text-xs">{valueTypeLabel(rule.valueType as ValueType)}</td>
                  <td className="px-3 py-2 text-ink-secondary text-xs font-mono">
                    {rule.staticValue ?? <span className="text-ink-tertiary italic">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleActive(rule)}
                      disabled={saving === rule.id}
                      title={rule.isActive ? 'Deactivate' : 'Activate'}
                      aria-label={`${rule.isActive ? 'Deactivate' : 'Activate'} rule ${rule.doctypeKey}.${rule.fieldName}`}
                      aria-pressed={rule.isActive}
                      className={cn(
                        'inline-flex items-center justify-center h-6 w-6 rounded transition-colors',
                        rule.isActive
                          ? 'text-success-700 hover:bg-success-50'
                          : 'text-ink-secondary hover:bg-surface-app',
                        saving === rule.id && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {saving === rule.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : rule.isActive
                          ? <Eye className="h-3.5 w-3.5" />
                          : <EyeOff className="h-3.5 w-3.5" />
                      }
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => deleteRule(rule)}
                      disabled={deleting === rule.id}
                      aria-label={`Delete rule ${rule.doctypeKey}.${rule.fieldName}`}
                      className="inline-flex items-center justify-center h-7 w-7 rounded text-ink-secondary hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === rule.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Live preview section                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-lg border border-border bg-surface-hover p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">Live Preview</h3>
          <p className="text-xs text-ink-secondary mt-0.5">
            Check whether scoping is ON or OFF for a specific user and DocType based on their effective permissions.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          {/* User search */}
          <div className="space-y-1 relative">
            <label htmlFor="scope-preview-user" className="block text-xs font-medium text-ink-primary">User</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-secondary pointer-events-none" />
              <input
                id="scope-preview-user"
                type="text"
                value={previewUser ? previewUser.name : previewUserSearch}
                onChange={e => {
                  setPreviewUserSearch(e.target.value)
                  setPreviewUser(null)
                  setPreviewResult(null)
                }}
                placeholder="Search user…"
                className="rounded-md border border-ink-tertiary bg-surface-card pl-8 pr-3 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-52"
              />
            </div>
            {/* Dropdown suggestions */}
            {!previewUser && userSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-0.5 w-52 rounded-md border border-border bg-surface-card shadow-lg text-sm divide-y divide-border">
                {userSuggestions.map(u => (
                  <li key={u.id}>
                    <button
                      onClick={() => {
                        setPreviewUser(u)
                        setPreviewUserSearch(u.name)
                        setPreviewResult(null)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors"
                    >
                      <span className="font-medium text-ink-primary">{u.name}</span>
                      <span className="ml-1.5 text-ink-secondary text-xs">{u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* DocType selector */}
          <div className="space-y-1">
            <label htmlFor="scope-preview-doctype" className="block text-xs font-medium text-ink-primary">DocType</label>
            {knownDoctypes.length > 0 ? (
              <SettingsSelect
                id="scope-preview-doctype"
                value={previewDoctypeKey}
                onValueChange={v => { setPreviewDoctypeKey(v); setPreviewResult(null) }}
                options={knownDoctypes.map(dk => ({ value: dk, label: dk }))}
                placeholder="Select…"
                className="min-w-40"
              />
            ) : (
              <input
                id="scope-preview-doctype"
                type="text"
                value={previewDoctypeKey}
                onChange={e => { setPreviewDoctypeKey(e.target.value); setPreviewResult(null) }}
                placeholder="e.g. Objective"
                className="rounded-md border border-ink-tertiary bg-surface-card px-3 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-40"
              />
            )}
          </div>

          {/* Run button */}
          <button
            onClick={runPreview}
            disabled={!previewUser || !previewDoctypeKey || previewLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink-primary px-3 py-1.5 text-sm font-medium text-surface-card hover:bg-ink-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Preview
          </button>
        </div>

        {/* Result */}
        {previewResult && (
          <div className={cn(
            'flex items-center gap-2.5 rounded-md border px-4 py-3 text-sm',
            previewResult.scopingOn
              ? 'border-warning-200 bg-warning-50 text-warning-800'
              : 'border-success-200 bg-success-50 text-success-800'
          )}>
            {previewResult.scopingOn
              ? <Shield className="h-4 w-4 shrink-0 text-warning-500" />
              : <Eye className="h-4 w-4 shrink-0 text-success-500" />
            }
            <span>
              Based on effective permissions, <strong>{previewResult.userName}</strong> would have
              record scoping <strong>{previewResult.scopingOn ? 'ON' : 'OFF'}</strong> for DocType{' '}
              <strong className="font-mono">{previewResult.doctypeKey}</strong>.
              {previewResult.scopingOn
                ? ' Row-level filters will be applied.'
                : ' All records of this type are visible (no scoping applied).'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
