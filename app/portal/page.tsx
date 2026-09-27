import Link from 'next/link'
import { Eye, FolderOpen, LockKeyhole } from 'lucide-react'
import { loadPortalHomePage, type PortalProjectRow } from '@/features/projects/services/portal-pages.server'
import { ProjectProgress } from '@/features/projects/components/ProjectProgress'
import { EmptyState } from '@/components/ui/EmptyState'
import PortalSignOutButton from './PortalSignOutButton'

export default async function PortalPage() {
  const data = await loadPortalHomePage()

  if (data.mode === 'portal') {
    return (
      <PortalShell title="Client Portal" subtitle={data.clientName} signOut>
        <ProjectList projects={data.projects} />
      </PortalShell>
    )
  }

  return (
    <PortalShell title="Client Portal Preview" subtitle="Viewing as client - this is what they see.">
      <div className="mb-4 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm font-medium text-warning-700">
        <Eye className="mr-2 inline size-4" /> Viewing as client - this is what they see.
      </div>
      <ProjectList projects={data.projects} />
    </PortalShell>
  )
}

function PortalShell({ title, subtitle, children, signOut = false }: { title: string; subtitle: string; children: React.ReactNode; signOut?: boolean }) {
  return (
    <main className="min-h-screen bg-surface-muted px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-page-title text-ink-primary">{title}</h1>
            <p className="text-body text-ink-secondary">{subtitle}</p>
          </div>
          {signOut ? <PortalSignOutButton /> : <LockKeyhole className="size-6 text-ink-tertiary" />}
        </div>
        {children}
      </div>
    </main>
  )
}

function ProjectList({ projects }: { projects: PortalProjectRow[] }) {
  if (projects.length === 0) {
    return <EmptyState icon={FolderOpen} title="No projects yet" description="No portal-enabled projects are available." />
  }
  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Link key={project.id} href={`/portal/projects/${project.id}`} className="rounded-card bg-surface-card p-4 shadow-card hover:shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-body-sm text-ink-tertiary">{project.code}</div>
              <div className="text-body font-semibold text-ink-primary">{project.name}</div>
            </div>
            <div className="text-right">
              <ProjectProgress actual={project.percentComplete} variant="value" showPlanned={false} className="text-body-sm font-medium text-ink-primary" />
              <div className="text-xs text-ink-tertiary">{project.ragStatus}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
