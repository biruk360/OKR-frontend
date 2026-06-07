'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, Loader2, Shield, Plus, Trash2, Search, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const [newDoctypeKey, setNewDoctypeKey] = useState('')
  const [newFieldName, setNewFieldName] = useState('')
  const [newOperator, setNewOperator] = useState<Operator>('equals')
  const [newValueType, setNewValueType] = useState<ValueType>('user_id')
  const [newStaticValue, setNewStaticValue] = useState('')
  const [adding, setAdding] = useState(false)

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
  }, [selectedRoleId, rules])

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
  const addRule = useCallback(async () => {
    if (!newDoctypeKey.trim() || !newFieldName.trim() || !selectedRoleId) return
    if (newValueType === 'static' && !newStaticValue.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/permissions/roles/${selectedRoleId}/scope-rules`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctypeKey: newDoctypeKey.trim(),
            fieldName: newFieldName.trim(),
            operator: newOperator,
            valueType: newValueType,
            staticValue: newValueType === 'static' ? newStaticValue.trim() : undefined,
          }),
        }
      )
      const json = await res.json()
      if (json.success) {
        setRules(prev => [...prev, json.data])
        setNewDoctypeKey('')
        setNewFieldName('')
        setNewOperator('equals')
        setNewValueType('user_id')
        setNewStaticValue('')
        setShowAdd(false)
      } else {
        setError(json.error ?? 'Failed to add rule')
      }
    } catch {
      setError('Failed to add scope rule')
    } finally {
      setAdding(false)
    }
  }, [selectedRoleId, newDoctypeKey, newFieldName, newOperator, newValueType, newStaticValue])

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
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading roles…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Error banner                                                         */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-xs underline"
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
          <h2 className="text-base font-semibold text-gray-900">Record Scoping Rules</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Field-level filters applied when a role queries a DocType.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Role</label>
            <select
              value={selectedRoleId}
              onChange={e => { setSelectedRoleId(e.target.value); setShowAdd(false) }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.label || r.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Filter by DocType</label>
            <input
              type="text"
              value={doctypeFilter}
              onChange={e => setDoctypeFilter(e.target.value)}
              placeholder="All"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-36"
            />
          </div>
          <div className="pb-0.5">
            <button
              onClick={() => setShowAdd(v => !v)}
              disabled={!selectedRoleId}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-800">
            New Scope Rule for <span className="font-semibold">{selectedRole?.label || selectedRole?.name}</span>
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">DocType key</label>
              <input
                type="text"
                value={newDoctypeKey}
                onChange={e => setNewDoctypeKey(e.target.value)}
                placeholder="e.g. Objective"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">Field name</label>
              <input
                type="text"
                value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                placeholder="e.g. ownerId"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">Operator</label>
              <select
                value={newOperator}
                onChange={e => setNewOperator(e.target.value as Operator)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {VALID_OPERATORS.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">Value type</label>
              <select
                value={newValueType}
                onChange={e => setNewValueType(e.target.value as ValueType)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {VALID_VALUE_TYPES.map(vt => (
                  <option key={vt} value={vt}>{valueTypeLabel(vt)}</option>
                ))}
              </select>
            </div>
            {newValueType === 'static' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">Static value</label>
                <input
                  type="text"
                  value={newStaticValue}
                  onChange={e => setNewStaticValue(e.target.value)}
                  placeholder="e.g. active"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={addRule}
                disabled={
                  adding ||
                  !newDoctypeKey.trim() ||
                  !newFieldName.trim() ||
                  (newValueType === 'static' && !newStaticValue.trim())
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Rules table                                                           */}
      {/* ------------------------------------------------------------------ */}
      {loadingRules ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading rules…
        </div>
      ) : visibleRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm text-center">
          <Shield className="h-10 w-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">
            {rules.length === 0
              ? 'No scope rules configured for this role'
              : 'No rules match the current DocType filter'}
          </p>
          <p className="mt-1 text-xs">Add a rule to control which records this role can see.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">DocType</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Field</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-20">Op</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Value type</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Static value</th>
                <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-20">Active</th>
                <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {visibleRules.map(rule => (
                <tr
                  key={rule.id}
                  className={cn(
                    'hover:bg-gray-50 transition-colors',
                    !rule.isActive && 'opacity-50'
                  )}
                >
                  <td className="px-3 py-2 font-medium text-gray-800 font-mono text-xs">{rule.doctypeKey}</td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{rule.fieldName}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{operatorLabel(rule.operator as Operator)}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{valueTypeLabel(rule.valueType as ValueType)}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs font-mono">
                    {rule.staticValue ?? <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleActive(rule)}
                      disabled={saving === rule.id}
                      title={rule.isActive ? 'Deactivate' : 'Activate'}
                      className={cn(
                        'inline-flex items-center justify-center h-6 w-6 rounded transition-colors',
                        rule.isActive
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-gray-300 hover:bg-gray-100',
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
                      className="inline-flex items-center justify-center h-7 w-7 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Live Preview</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Check whether scoping is ON or OFF for a specific user and DocType based on their effective permissions.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          {/* User search */}
          <div className="space-y-1 relative">
            <label className="block text-xs font-medium text-gray-700">User</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={previewUser ? previewUser.name : previewUserSearch}
                onChange={e => {
                  setPreviewUserSearch(e.target.value)
                  setPreviewUser(null)
                  setPreviewResult(null)
                }}
                placeholder="Search user…"
                className="rounded-md border border-gray-300 bg-white pl-8 pr-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
              />
            </div>
            {/* Dropdown suggestions */}
            {!previewUser && userSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-0.5 w-52 rounded-md border border-gray-200 bg-white shadow-lg text-sm divide-y divide-gray-100">
                {userSuggestions.map(u => (
                  <li key={u.id}>
                    <button
                      onClick={() => {
                        setPreviewUser(u)
                        setPreviewUserSearch(u.name)
                        setPreviewResult(null)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
                    >
                      <span className="font-medium text-gray-800">{u.name}</span>
                      <span className="ml-1.5 text-gray-400 text-xs">{u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* DocType selector */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">DocType</label>
            {knownDoctypes.length > 0 ? (
              <select
                value={previewDoctypeKey}
                onChange={e => { setPreviewDoctypeKey(e.target.value); setPreviewResult(null) }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select…</option>
                {knownDoctypes.map(dk => (
                  <option key={dk} value={dk}>{dk}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={previewDoctypeKey}
                onChange={e => { setPreviewDoctypeKey(e.target.value); setPreviewResult(null) }}
                placeholder="e.g. Objective"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
              />
            )}
          </div>

          {/* Run button */}
          <button
            onClick={runPreview}
            disabled={!previewUser || !previewDoctypeKey || previewLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-green-200 bg-green-50 text-green-800'
          )}>
            {previewResult.scopingOn
              ? <Shield className="h-4 w-4 shrink-0 text-amber-500" />
              : <Eye className="h-4 w-4 shrink-0 text-green-500" />
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
