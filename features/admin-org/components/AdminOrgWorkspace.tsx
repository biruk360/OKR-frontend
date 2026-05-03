'use client'

import { useState } from 'react'
import { Building2, Users, Network, AlertTriangle, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrgDiagnostics, useOrgSettings, useOrgTree } from '../hooks/useOrgData'
import { PeopleTab } from './PeopleTab'
import { DepartmentsTab } from './DepartmentsTab'
import { OrgChartTab } from './OrgChartTab'
import { CompanyHeader } from './CompanyHeader'

type Tab = 'people' | 'departments' | 'chart'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'people',      label: 'People',      icon: Users },
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'chart',       label: 'Org Chart',   icon: Network },
]

export function AdminOrgWorkspace() {
  const [tab, setTab] = useState<Tab>('people')
  const tree = useOrgTree()
  const settings = useOrgSettings()
  const diagnostics = useOrgDiagnostics()

  const diag = diagnostics.data

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--ap-bg)' }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-6 py-4"
        style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--ap-accent)', color: '#fff' }}
          >
            <Network className="size-4" />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--ap-fg)' }}>
              Organization Admin
            </h1>
            <p className="text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
              Manage CEO designation, departments, members, and reporting lines
            </p>
          </div>
        </div>
      </div>

      {/* Diagnostics strip */}
      {diag && (diag.usersWithoutDepartment + diag.departmentsWithoutHead +
                 diag.departmentObjectivesMissingDepartment + diag.individualObjectivesUnaligned > 0) && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-2"
          style={{
            borderColor: 'var(--ap-border)',
            background: 'rgba(255,193,7,0.08)',
          }}
        >
          <AlertTriangle className="size-4 shrink-0" style={{ color: '#b45309' }} />
          {diag.usersWithoutDepartment > 0 && (
            <Pill label={`${diag.usersWithoutDepartment} users without department`} />
          )}
          {diag.departmentsWithoutHead > 0 && (
            <Pill label={`${diag.departmentsWithoutHead} departments without head`} />
          )}
          {diag.departmentObjectivesMissingDepartment > 0 && (
            <Pill label={`${diag.departmentObjectivesMissingDepartment} dept OKRs missing department`} />
          )}
          {diag.individualObjectivesUnaligned > 0 && (
            <Pill label={`${diag.individualObjectivesUnaligned} individual OKRs unaligned`} />
          )}
        </div>
      )}

      {/* Company / CEO header card */}
      <div className="shrink-0 px-6 pt-4">
        <CompanyHeader settings={settings.data} loading={settings.isLoading} />
      </div>

      {/* Tab bar */}
      <div
        className="mt-4 flex shrink-0 items-center border-b px-6"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        {TABS.map((t) => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all',
                active ? '' : 'opacity-60 hover:opacity-100'
              )}
              style={active ? { color: 'var(--ap-accent)' } : { color: 'var(--ap-fg-muted)' }}
            >
              <Icon className="size-3.5" />
              {t.label}
              {active && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: 'var(--ap-accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-auto px-6 py-5">
        {tree.isLoading ? (
          <div className="flex w-full items-center justify-center py-20">
            <div className="size-6 animate-spin rounded-full border-2 border-[var(--ap-accent)] border-t-transparent" />
          </div>
        ) : tree.data ? (
          <div className="w-full">
            {tab === 'people'      && <PeopleTab tree={tree.data} settings={settings.data} />}
            {tab === 'departments' && <DepartmentsTab tree={tree.data} />}
            {tab === 'chart'       && <OrgChartTab tree={tree.data} />}
          </div>
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-2 py-20">
            <Crown className="size-6" style={{ color: 'var(--ap-fg-subtle)' }} />
            <p className="text-sm" style={{ color: 'var(--ap-fg-subtle)' }}>
              Failed to load org tree.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Pill({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ background: 'rgba(180,83,9,0.10)', color: '#b45309' }}
    >
      {label}
    </span>
  )
}
