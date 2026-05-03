'use client'

import { useState } from 'react'
import { Building2, ChevronDown, ChevronRight, UserPlus, X, Star, Crown } from 'lucide-react'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import {
  useAddMember, useRemoveMember, useSetDepartmentHead, useUpdateMember,
} from '../hooks/useOrgData'
import type { OrgDepartment, OrgTree } from '../types'
import { Avatar } from './shared/Avatar'

export function DepartmentsTab({ tree }: { tree: OrgTree }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (tree.departments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Building2 className="size-8" style={{ color: 'var(--ap-fg-subtle)' }} />
        <p className="text-sm" style={{ color: 'var(--ap-fg-subtle)' }}>
          No active departments. Create one from Settings → Teams.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tree.departments.map((d) => {
        const open = expanded[d.id] ?? false
        return (
          <DepartmentCard
            key={d.id}
            dept={d}
            open={open}
            onToggle={() => setExpanded((p) => ({ ...p, [d.id]: !open }))}
          />
        )
      })}
    </div>
  )
}

function DepartmentCard({ dept, open, onToggle }: { dept: OrgDepartment; open: boolean; onToggle: () => void }) {
  return (
    <div
      className="overflow-hidden rounded-[var(--ap-radius-md)]"
      style={{
        background: '#fff',
        border: '1px solid var(--ap-border)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
      >
        {open
          ? <ChevronDown className="size-4 shrink-0" style={{ color: 'var(--ap-fg-muted)' }} />
          : <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--ap-fg-muted)' }} />}
        <Building2 className="size-4 shrink-0" style={{ color: 'var(--ap-accent)' }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold" style={{ color: 'var(--ap-fg)' }}>{dept.name}</p>
          {dept.description && (
            <p className="truncate text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>{dept.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dept.head ? (
            <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: 'rgba(180,83,9,0.10)', color: '#b45309' }}>
              <Crown className="size-3" />
              {dept.head.name ?? dept.head.email}
            </span>
          ) : (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: 'rgba(180,83,9,0.10)', color: '#b45309' }}>
              No head
            </span>
          )}
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ background: 'rgba(0,122,255,0.10)', color: 'var(--ap-accent)' }}>
            {dept.members.length} {dept.members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
      </button>

      {open && <MembersPanel dept={dept} />}
    </div>
  )
}

function MembersPanel({ dept }: { dept: OrgDepartment }) {
  const [adding, setAdding] = useState(false)
  const [pickedId, setPickedId] = useState('')
  const { users } = useUsersForSelection({ enabled: true })
  const addMember = useAddMember()
  const removeMember = useRemoveMember()
  const updateMember = useUpdateMember()
  const setHead = useSetDepartmentHead()

  const memberIds = new Set(dept.members.map((m) => m.user.id))
  const candidates = users.filter((u) => !memberIds.has(u.id))

  return (
    <div className="border-t px-4 py-3" style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
          Members
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/5"
            style={{ color: 'var(--ap-accent)' }}
          >
            <UserPlus className="size-3" />
            Add member
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 flex items-center gap-2">
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="flex-1 rounded-md border bg-white px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--ap-border-strong)' }}
          >
            <option value="">Select a user…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email} ({u.role})</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickedId}
            onClick={() => {
              if (!pickedId) return
              addMember.mutate({ departmentId: dept.id, userId: pickedId, role: 'MEMBER' },
                { onSuccess: () => { setAdding(false); setPickedId('') } })
            }}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--ap-accent)' }}
          >
            Add
          </button>
          <button type="button" onClick={() => { setAdding(false); setPickedId('') }}
            className="rounded-md p-1.5 hover:bg-black/5">
            <X className="size-3.5" style={{ color: 'var(--ap-fg-subtle)' }} />
          </button>
        </div>
      )}

      {dept.members.length === 0 ? (
        <p className="py-3 text-center text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
          No members yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {dept.members.map((m) => (
            <li
              key={m.membershipId}
              className="flex items-center gap-3 rounded-md px-2 py-1.5"
              style={{ background: '#fff', border: '1px solid var(--ap-border)' }}
            >
              <Avatar name={m.user.name ?? m.user.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium" style={{ color: 'var(--ap-fg)' }}>
                  {m.user.name ?? m.user.email}
                </p>
                <p className="truncate text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                  {m.user.email}
                </p>
              </div>

              {m.isPrimary && (
                <Star className="size-3.5 shrink-0" style={{ color: '#eab308' }} />
              )}

              <select
                value={m.role}
                onChange={(e) => {
                  const role = e.target.value as 'HEAD' | 'MEMBER' | 'SECONDARY_MEMBER'
                  if (role === 'HEAD') {
                    setHead.mutate({ departmentId: dept.id, userId: m.user.id })
                  } else {
                    updateMember.mutate({ departmentId: dept.id, membershipId: m.membershipId, role })
                  }
                }}
                className="rounded-md border bg-white px-2 py-1 text-xs"
                style={{ borderColor: 'var(--ap-border-strong)' }}
              >
                <option value="HEAD">Head</option>
                <option value="MEMBER">Member</option>
                <option value="SECONDARY_MEMBER">Secondary</option>
              </select>

              <button
                type="button"
                onClick={() => removeMember.mutate({ departmentId: dept.id, membershipId: m.membershipId })}
                className="rounded p-1 hover:bg-black/5"
                title="Remove from department"
              >
                <X className="size-3.5" style={{ color: 'var(--ap-fg-subtle)' }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
