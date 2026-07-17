'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus, Search, LayoutGrid, BookOpen } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useProjectsList } from '../hooks/useProjects'
import { CreateProjectWizard } from './CreateProjectWizard'
import { RagBadge, ProjectStatusBadge } from './ProjectBadges'

interface Props {
  user: { id: string; role: string }
}

const CAN_CREATE = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

export function ProjectsListClient({ user }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const { data, isLoading } = useProjectsList({ search: debounced, limit: 50 })
  const projects = data?.data ?? []

  const counts = useMemo(() => {
    const c = { total: projects.length, green: 0, amber: 0, red: 0 }
    for (const p of projects) {
      if (p.ragStatus === 'GREEN') c.green++
      else if (p.ragStatus === 'AMBER') c.amber++
      else if (p.ragStatus === 'RED') c.red++
    }
    return c
  }, [projects])

  const canCreate = CAN_CREATE.includes(user.role)

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader
        title="Projects"
        description="Delivery schedule of record, baselines, and delay intelligence."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/projects/portfolio" className="btn btn-secondary">
              <LayoutGrid className="mr-1.5 size-4" /> Portfolio
            </Link>
            <Link href="/dashboard/projects/templates" className="btn btn-secondary">
              <BookOpen className="mr-1.5 size-4" /> Templates
            </Link>
            {canCreate && (
              <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
                <Plus className="mr-1.5 size-4" /> New Project
              </button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={counts.total} icon={FolderKanban} tone="gray" />
        <StatCard label="On track" value={counts.green} tone="green" />
        <StatCard label="At risk" value={counts.amber} tone="yellow" />
        <StatCard label="Off track" value={counts.red} tone="red" />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          className="input pl-9"
          placeholder="Search by name, code, or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={canCreate ? 'Create your first project to start tracking delivery.' : 'No projects are visible to you yet.'}
          action={canCreate ? { label: 'New Project', onClick: () => setWizardOpen(true) } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-card bg-surface-card shadow-card">
          <div className="hidden grid-cols-12 gap-4 border-b border-black/[0.06] px-4 py-2.5 text-overline text-ink-secondary sm:grid">
            <div className="col-span-4">Project</div>
            <div className="col-span-2">Client</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Health</div>
            <div className="col-span-3">Progress</div>
            <div className="col-span-1 text-right">Conf.</div>
          </div>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="grid grid-cols-1 items-center gap-2 border-b border-black/[0.04] px-4 py-3 transition-colors last:border-0 hover:bg-surface-hover sm:grid-cols-12 sm:gap-4"
            >
              <div className="col-span-4 min-w-0">
                <div className="truncate text-body font-medium text-ink-primary">{p.name}</div>
                <div className="text-body-sm text-ink-tertiary">{p.code}</div>
              </div>
              <div className="col-span-2 truncate text-body-sm text-ink-secondary">{p.clientName}</div>
              <div className="col-span-1"><ProjectStatusBadge status={p.status} /></div>
              <div className="col-span-1"><RagBadge rag={p.ragStatus} /></div>
              <div className="col-span-3">
                <ProgressVsPlanned complete={p.percentComplete} planned={p.percentPlanned} />
              </div>
              <div className="col-span-1 text-right text-body font-semibold tabular-nums text-ink-primary">{p.confidence}</div>
            </Link>
          ))}
        </div>
      )}

      <CreateProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} currentUserId={user.id} />
    </div>
  )
}

/** Actual vs planned bar — planned shown as a marker so behind-schedule is visible. */
function ProgressVsPlanned({ complete, planned }: { complete: number; planned: number }) {
  const behind = planned - complete > 5
  return (
    <div>
      <div className="relative h-1.5 w-full rounded-full bg-surface-muted">
        <div className={cn('h-1.5 rounded-full', behind ? 'bg-warning-500' : 'bg-primary-500')} style={{ width: `${Math.min(100, complete)}%` }} />
        <div className="absolute top-[-2px] h-2.5 w-px bg-ink-secondary" style={{ left: `${Math.min(100, planned)}%` }} title={`Planned ${planned}%`} />
      </div>
      <div className="mt-1 text-body-sm text-ink-tertiary tabular-nums">{complete.toFixed(0)}% · planned {planned.toFixed(0)}%</div>
    </div>
  )
}
