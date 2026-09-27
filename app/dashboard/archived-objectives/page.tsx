import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { NestedObjectivesList } from '@/features/objectives'
import { loadArchivedObjectivesPage } from '@/features/objectives/services/archived-objectives.server'

export default async function ArchivedObjectivesPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  const { objectives, timeframes, departments } = await loadArchivedObjectivesPage(session.user)

  return (
    <div className="space-y-4">
      <div
        className="rounded-[var(--ap-radius-md)] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <PageHeader
          className="mb-0"
          breadcrumb={
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-bold uppercase tracking-wide"
              style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
            >
              Archived
            </span>
          }
          title="Archived Objectives"
          description="Objectives that have been archived. Restore them from each objective's detail page when permitted."
        />
      </div>

      <NestedObjectivesList
        objectives={objectives}
        timeframes={timeframes}
        departments={departments}
        userRole={session.user.role}
      />
    </div>
  )
}
