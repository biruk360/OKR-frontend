'use client'

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface ExplainDetails {
  adminBypass: boolean
  explicitDeny: string | null
  explicitGrant: string | null
  roleGrants: { role: string; field: string; value: boolean }[]
  scopingApplied: boolean
  scopeRules: { field: string; operator: string; value: string }[]
}

interface ExplainResult {
  allowed: boolean
  explanation: string
  details: ExplainDetails
}

const DOCTYPES = [
  { value: 'objective', label: 'Objective' },
  { value: 'key_result', label: 'Key Result' },
  { value: 'todo', label: 'Todo' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'letter', label: 'Letter' },
  { value: 'daily_trip_plan', label: 'Daily Trip Plan' },
  { value: 'user', label: 'User' },
  { value: 'department', label: 'Department' },
]

const ACTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'create', label: 'Create' },
  { value: 'delete', label: 'Delete' },
  { value: 'submit', label: 'Submit' },
  { value: 'export', label: 'Export' },
]

export default function ExplainPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedDoctype, setSelectedDoctype] = useState('objective')
  const [selectedAction, setSelectedAction] = useState('read')
  const [result, setResult] = useState<ExplainResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/users/for-selection')
        const json = await res.json()
        const list: User[] = json.data ?? []
        setUsers(list)
        if (list.length > 0) setSelectedUserId(list[0].id)
      } catch {
        setUsers([])
      } finally {
        setUsersLoading(false)
      }
    }
    fetchUsers()
  }, [])

  async function handleCheck() {
    if (!selectedUserId) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const params = new URLSearchParams({
        userId: selectedUserId,
        doctypeKey: selectedDoctype,
        action: selectedAction,
      })
      const res = await fetch(`/api/permissions/explain?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      setResult(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check permission')
    } finally {
      setLoading(false)
    }
  }

  const selectedUser = users.find((u) => u.id === selectedUserId)

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Permission Check</h3>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-600">User</label>
            {usersLoading ? (
              <div className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-300 bg-gray-50 text-xs text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </div>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">DocType</label>
            <select
              value={selectedDoctype}
              onChange={(e) => setSelectedDoctype(e.target.value)}
              className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {DOCTYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Action</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCheck}
            disabled={loading || !selectedUserId}
            className="h-9 px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Check Permission
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-3 pt-1">
            <div
              className={cn(
                'flex items-start gap-3 rounded-lg px-4 py-3 border',
                result.allowed
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              )}
            >
              {result.allowed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              )}
              <div>
                <span
                  className={cn(
                    'text-xs font-bold uppercase tracking-wide',
                    result.allowed ? 'text-green-700' : 'text-red-700'
                  )}
                >
                  {result.allowed ? 'Allowed' : 'Denied'}
                </span>
                <p className="text-sm font-medium text-gray-800 mt-0.5">
                  {selectedUser?.name ?? 'User'}{' '}
                  <span className={result.allowed ? 'text-green-700' : 'text-red-700'}>
                    {result.allowed ? 'CAN' : 'CANNOT'}
                  </span>{' '}
                  {selectedAction}{' '}
                  {DOCTYPES.find((d) => d.value === selectedDoctype)?.label ?? selectedDoctype}
                </p>
                <p className="text-sm text-gray-600 mt-1">{result.explanation}</p>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Details
              </p>

              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-gray-500 w-32 shrink-0">Admin bypass:</span>
                <span className={result.details.adminBypass ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                  {result.details.adminBypass ? 'Yes' : 'No'}
                </span>
              </div>

              <div className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-gray-500 w-32 shrink-0">Explicit deny:</span>
                <span className={result.details.explicitDeny ? 'text-red-600 font-medium' : 'text-gray-500'}>
                  {result.details.explicitDeny ?? 'None'}
                </span>
              </div>

              <div className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-gray-500 w-32 shrink-0">Explicit grant:</span>
                <span className={result.details.explicitGrant ? 'text-green-600 font-medium' : 'text-gray-500'}>
                  {result.details.explicitGrant ?? 'None'}
                </span>
              </div>

              {result.details.roleGrants.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-gray-500 w-32 shrink-0">Role grants:</span>
                  <ul className="space-y-0.5">
                    {result.details.roleGrants.map((g, i) => (
                      <li key={i} className="font-medium">
                        {g.role} → {g.field} ={' '}
                        <span className={g.value ? 'text-green-600' : 'text-red-600'}>
                          {String(g.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-gray-500 w-32 shrink-0">Record scoping:</span>
                <span className={result.details.scopingApplied ? 'text-blue-600 font-medium' : 'text-gray-500'}>
                  {result.details.scopingApplied ? 'On' : 'Off'}
                </span>
              </div>

              {result.details.scopeRules.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-gray-500 w-32 shrink-0">Scope rules:</span>
                  <ul className="space-y-0.5">
                    {result.details.scopeRules.map((r, i) => (
                      <li key={i} className="font-mono text-xs text-gray-700">
                        {r.field} {r.operator} {r.value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
