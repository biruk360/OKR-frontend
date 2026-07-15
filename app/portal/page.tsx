import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eye, LockKeyhole } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { getPortalSessionSafe } from '@/lib/portal-auth'
import { prisma } from '@/lib/prisma'
import { portalProjectWhere } from '@/features/projects/services/portal-serializer'

export default async function PortalPage() {
  const [portalSession, internalSession] = await Promise.all([
    getPortalSessionSafe(),
    getServerSessionSafe(),
  ])

  if (!portalSession && !internalSession) redirect('/portal/signin')

  if (portalSession) {
    const projects = await prisma.project.findMany({
      where: portalProjectWhere(portalSession.user.projectIds),
      select: { id: true, code: true, name: true, ragStatus: true, percentComplete: true },
      orderBy: { name: 'asc' },
    })
    return (
      <PortalShell title="Client Portal" subtitle={portalSession.user.clientName}>
        <ProjectList projects={projects} />
      </PortalShell>
    )
  }

  const previewProjects = await prisma.project.findMany({
    where: internalPreviewWhere(internalSession!.user),
    select: { id: true, code: true, name: true, ragStatus: true, percentComplete: true },
    orderBy: { name: 'asc' },
    take: 12,
  })
  return (
    <PortalShell title="Client Portal Preview" subtitle="Viewing as client - this is what they see.">
      <div className="mb-4 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm font-medium text-warning-700">
        <Eye className="mr-2 inline size-4" /> Viewing as client - this is what they see.
      </div>
      <ProjectList projects={previewProjects} />
    </PortalShell>
  )
}

function PortalShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-muted px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-page-title text-ink-primary">{title}</h1>
            <p className="text-body text-ink-secondary">{subtitle}</p>
          </div>
          <LockKeyhole className="size-6 text-ink-tertiary" />
        </div>
        {children}
      </div>
    </main>
  )
}

function ProjectList({ projects }: { projects: { id: string; code: string; name: string; ragStatus: string; percentComplete: number }[] }) {
  if (projects.length === 0) {
    return <div className="rounded-card bg-surface-card p-6 text-body text-ink-secondary shadow-card">No portal-enabled projects are available.</div>
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
              <div className="text-body-sm font-medium text-ink-primary">{Math.round(project.percentComplete)}%</div>
              <div className="text-[12px] text-ink-tertiary">{project.ragStatus}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function internalPreviewWhere(user: { id: string; role: string; departmentId?: string | null }) {
  if (user.role === 'ADMIN' || user.role === 'EXECUTIVE') {
    return { portalEnabled: true, archivedAt: null }
  }
  return { portalEnabled: true, archivedAt: null, projectManagerId: user.id }
}
