'use client'

import { Building2, Crown, User, Users as UsersIcon } from 'lucide-react'
import type { OrgTree } from '../types'
import { Avatar } from './shared/Avatar'

/**
 * Read-only org tree:
 *   Company (CEO) → Departments (Head + members) → Members
 *
 * Renders entirely from the single tree payload. Verifies what the strategy
 * map will show in Combined mode.
 */
export function OrgChartTab({ tree }: { tree: OrgTree }) {
  return (
    <div className="space-y-4">
      {/* Company root */}
      <div
        className="flex items-center gap-3 rounded-[var(--ap-radius-md)] p-4"
        style={{
          background: 'linear-gradient(135deg, rgba(0,122,255,0.10), rgba(0,122,255,0.04))',
          border: '1px solid rgba(0,122,255,0.20)',
        }}
      >
        <div className="flex size-10 items-center justify-center rounded-xl" style={{ background: 'var(--ap-accent)', color: '#fff' }}>
          <Crown className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-accent)' }}>
            Company
          </p>
          <p className="text-[16px] font-semibold" style={{ color: 'var(--ap-fg)' }}>{tree.company.name}</p>
        </div>
        {tree.company.ceo ? (
          <div className="flex items-center gap-2 rounded-full px-3 py-1"
            style={{ background: '#fff', border: '1px solid var(--ap-border)' }}>
            <Avatar name={tree.company.ceo.name ?? tree.company.ceo.email} />
            <span className="text-sm font-medium" style={{ color: 'var(--ap-fg)' }}>
              {tree.company.ceo.name ?? tree.company.ceo.email}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>CEO</span>
          </div>
        ) : (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">No CEO set</span>
        )}
      </div>

      {/* Departments */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {tree.departments.map((d) => (
          <div
            key={d.id}
            className="rounded-[var(--ap-radius-md)] p-3"
            style={{ background: '#fff', border: '1px solid var(--ap-border)', boxShadow: 'var(--ap-shadow-sm)' }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="size-4 shrink-0" style={{ color: 'var(--ap-accent)' }} />
              <p className="flex-1 truncate text-[14px] font-semibold" style={{ color: 'var(--ap-fg)' }}>{d.name}</p>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'rgba(0,122,255,0.10)', color: 'var(--ap-accent)' }}>
                {d.members.length}
              </span>
            </div>

            {d.head && (
              <div className="mb-2 flex items-center gap-2 rounded px-2 py-1.5"
                style={{ background: 'rgba(180,83,9,0.06)' }}>
                <Crown className="size-3 shrink-0" style={{ color: '#b45309' }} />
                <Avatar name={d.head.name ?? d.head.email} size="xs" />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--ap-fg)' }}>
                  {d.head.name ?? d.head.email}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#b45309' }}>Head</span>
              </div>
            )}

            <ul className="space-y-1">
              {d.members.filter((m) => m.role !== 'HEAD').map((m) => (
                <li key={m.membershipId} className="flex items-center gap-2 px-1 py-0.5">
                  <Avatar name={m.user.name ?? m.user.email} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--ap-fg-muted)' }}>
                    {m.user.name ?? m.user.email}
                  </span>
                  {m.role === 'SECONDARY_MEMBER' && (
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>2°</span>
                  )}
                </li>
              ))}
            </ul>

            {d.members.length === 0 && (
              <p className="py-2 text-center text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>No members</p>
            )}
          </div>
        ))}
      </div>

      {/* Unassigned */}
      {tree.unassignedUsers.length > 0 && (
        <div
          className="rounded-[var(--ap-radius-md)] p-3"
          style={{ background: '#fff', border: '1px dashed var(--ap-border-strong)' }}
        >
          <div className="mb-2 flex items-center gap-2">
            <UsersIcon className="size-4 shrink-0" style={{ color: 'var(--ap-fg-subtle)' }} />
            <p className="flex-1 text-[12px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
              Unassigned ({tree.unassignedUsers.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tree.unassignedUsers.map((u) => (
              <span key={u.id} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px]"
                style={{ background: 'var(--ap-bg-raised)' }}>
                <User className="size-2.5" style={{ color: 'var(--ap-fg-subtle)' }} />
                {u.name ?? u.email}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
