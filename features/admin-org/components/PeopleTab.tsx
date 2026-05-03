'use client'

import { useMemo, useState } from 'react'
import { Search, Crown } from 'lucide-react'
import { useUpdateOrgSettings, useUpdateUserOrg } from '../hooks/useOrgData'
import type { OrgPerson, OrgSettings, OrgTree } from '../types'
import { Avatar } from './shared/Avatar'

interface Row extends OrgPerson {
  primaryDept?: { id: string; name: string } | null
  managerName?: string | null
  managerId?: string | null
}

export function PeopleTab({ tree, settings }: { tree: OrgTree; settings?: OrgSettings }) {
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const update = useUpdateUserOrg()
  const updateSettings = useUpdateOrgSettings()

  // Flatten + dedupe (a user with multiple memberships still shows once with primary).
  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>()
    for (const d of tree.departments) {
      for (const m of d.members) {
        const existing = map.get(m.user.id)
        if (!existing || m.isPrimary) {
          map.set(m.user.id, {
            ...m.user,
            primaryDept: m.isPrimary ? { id: d.id, name: d.name } : existing?.primaryDept ?? null,
          })
        }
      }
    }
    for (const u of tree.unassignedUsers) {
      if (!map.has(u.id)) map.set(u.id, { ...u, primaryDept: null })
    }
    return Array.from(map.values())
  }, [tree])

  const filtered = rows.filter((r) => {
    if (roleFilter && r.role !== roleFilter) return false
    if (!q) return true
    const needle = q.toLowerCase()
    return (r.name ?? '').toLowerCase().includes(needle) ||
           r.email.toLowerCase().includes(needle) ||
           (r.primaryDept?.name ?? '').toLowerCase().includes(needle)
  })

  const ceoId = settings?.companyCeoUserId

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2" style={{ color: 'var(--ap-fg-subtle)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, or department"
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm focus:outline-none"
            style={{ borderColor: 'var(--ap-border-strong)' }}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border bg-white px-3 py-2 text-sm"
          style={{ borderColor: 'var(--ap-border-strong)', color: 'var(--ap-fg-muted)' }}
        >
          <option value="">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="EXECUTIVE">Executive</option>
          <option value="DEPARTMENT_LEAD">Department Lead</option>
          <option value="EMPLOYEE">Employee</option>
        </select>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-[var(--ap-radius-md)]"
        style={{ background: '#fff', border: '1px solid var(--ap-border)' }}
      >
        <div
          className="grid items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{
            background: 'var(--ap-bg-raised)',
            borderBottom: '1px solid var(--ap-border)',
            gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.4fr) minmax(0,1.4fr) 100px 70px',
            color: 'var(--ap-fg-subtle)',
          }}
        >
          <span>Person</span>
          <span>Primary Department</span>
          <span>Role</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {filtered.map((r) => (
          <PersonRow
            key={r.id}
            row={r}
            departments={tree.departments}
            isCeo={r.id === ceoId}
            onSetCeo={() => updateSettings.mutate({ companyCeoUserId: r.id })}
            onChangePrimaryDept={(deptId) => update.mutate({ userId: r.id, primaryDepartmentId: deptId || null })}
            onChangeRole={(role) => update.mutate({ userId: r.id, role })}
          />
        ))}

        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--ap-fg-subtle)' }}>
            No people match the current filters.
          </p>
        )}
      </div>
    </div>
  )
}

function PersonRow({
  row, departments, isCeo, onSetCeo, onChangePrimaryDept, onChangeRole,
}: {
  row: Row
  departments: OrgTree['departments']
  isCeo: boolean
  onSetCeo: () => void
  onChangePrimaryDept: (deptId: string) => void
  onChangeRole: (role: string) => void
}) {
  return (
    <div
      className="grid items-center gap-3 px-4 py-2.5"
      style={{
        borderBottom: '1px solid var(--ap-border)',
        gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.4fr) minmax(0,1.4fr) 100px 70px',
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={row.name ?? row.email} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold" style={{ color: 'var(--ap-fg)' }}>
            {row.name ?? row.email}
            {isCeo && <Crown className="size-3" style={{ color: '#b45309' }} />}
          </p>
          <p className="truncate text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>{row.email}</p>
        </div>
      </div>

      <select
        value={row.primaryDept?.id ?? ''}
        onChange={(e) => onChangePrimaryDept(e.target.value)}
        className="w-full rounded-md border bg-white px-2 py-1 text-xs"
        style={{ borderColor: 'var(--ap-border-strong)' }}
      >
        <option value="">— No department —</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      <select
        value={row.role}
        onChange={(e) => onChangeRole(e.target.value)}
        className="w-full rounded-md border bg-white px-2 py-1 text-xs"
        style={{ borderColor: 'var(--ap-border-strong)' }}
      >
        <option value="ADMIN">Admin</option>
        <option value="EXECUTIVE">Executive</option>
        <option value="DEPARTMENT_LEAD">Department Lead</option>
        <option value="EMPLOYEE">Employee</option>
      </select>

      <span className="ap-status-pill" data-tone={row.isActive === false ? 'none' : 'ontrack'}>
        {row.isActive === false ? 'Inactive' : 'Active'}
      </span>

      <div className="flex justify-end">
        {!isCeo && (row.role === 'ADMIN' || row.role === 'EXECUTIVE') && (
          <button
            type="button"
            onClick={onSetCeo}
            title="Set as CEO"
            className="rounded-md px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-black/5"
            style={{ color: 'var(--ap-accent)' }}
          >
            Set CEO
          </button>
        )}
      </div>
    </div>
  )
}
