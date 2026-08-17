'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderKanban, Plus, Search, LayoutGrid, BookOpen } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDebounce } from '@/hooks/useDebounce'
import {
  useCreateProjectCreationDraft,
  useDiscardProjectCreationDraft,
  useProjectCreationDraft,
  useProjectsList,
  useUpdateProjectCreationDraft,
  type ProjectCreationDraftNode,
} from '../hooks/useProjects'
import type { ProjectCreationSourceMethod } from '@/lib/projects/creation-draft'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'
import { NewProjectEntry } from './creation/NewProjectEntry'
import { CreationDraftShell } from './creation/CreationDraftShell'
import { ImportUploadStep } from './creation/ImportUploadStep'
import { CreateProjectWizard } from './CreateProjectWizard'
import { projectCreationMethodLabel } from './creation/methods'
import { RagBadge, ProjectStatusBadge } from './ProjectBadges'
import { ProjectProgress } from './ProjectProgress'

interface Props {
  canCreateProject: boolean
  aiFeatureEnabled: boolean
  aiAvailable: boolean
  currentUserId: string
  initialDraftId?: string | null
}

export function ProjectsListClient({
  canCreateProject,
  aiFeatureEnabled,
  aiAvailable,
  currentUserId,
  initialDraftId = null,
}: Props) {
  const router = useRouter()
  const [creationOpen, setCreationOpen] = useState(false)
  const [creationScreen, setCreationScreen] = useState<'entry' | 'draft'>('entry')
  const [activeDraft, setActiveDraft] = useState<ProjectCreationDraftNode | null>(null)
  const [resumeDraftId, setResumeDraftId] = useState(initialDraftId)
  const [pendingMethod, setPendingMethod] = useState<ProjectCreationSourceMethod | null>(null)
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false)
  const [manualProgressStep, setManualProgressStep] = useState<1 | 2 | 3>(1)
  const [importProgressStep, setImportProgressStep] = useState<1 | 2 | 3>(1)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const { data, isLoading } = useProjectsList({ search: debounced, limit: 50 })
  const savedDraft = useProjectCreationDraft(resumeDraftId, canCreateProject)
  const createDraft = useCreateProjectCreationDraft()
  const updateDraft = useUpdateProjectCreationDraft(activeDraft?.id ?? '')
  const discardDraft = useDiscardProjectCreationDraft()
  const projects = data?.data ?? []

  useEffect(() => {
    if (savedDraft.data) setActiveDraft(savedDraft.data)
  }, [savedDraft.data])

  const rememberDraft = (id: string | null) => {
    setResumeDraftId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('creationDraft', id)
    else url.searchParams.delete('creationDraft')
    window.history.replaceState(window.history.state, '', url)
  }

  const openCreation = () => {
    setCreationScreen(activeDraft || resumeDraftId ? 'draft' : 'entry')
    setCreationOpen(true)
  }

  const selectMethod = async (sourceMethod: ProjectCreationSourceMethod) => {
    if (activeDraft) {
      if (activeDraft.sourceMethod === sourceMethod) {
        setCreationScreen('draft')
        return
      }
      setPendingMethod(sourceMethod)
      setSwitchConfirmOpen(true)
      return
    }
    const draft = await createDraft.mutateAsync({ sourceMethod })
    setActiveDraft(draft)
    rememberDraft(draft.id)
    setCreationScreen('draft')
  }

  const confirmMethodSwitch = async () => {
    if (!activeDraft || !pendingMethod) return
    const updated = await updateDraft.mutateAsync({
      version: activeDraft.version,
      sourceMethod: pendingMethod,
      discardMethodData: true,
    })
    setActiveDraft(updated)
    setPendingMethod(null)
    setSwitchConfirmOpen(false)
    setCreationScreen('draft')
  }

  const discardActiveDraft = async () => {
    if (!activeDraft) return
    await discardDraft.mutateAsync({ id: activeDraft.id, version: activeDraft.version })
    setActiveDraft(null)
    rememberDraft(null)
    setCreationOpen(false)
    setCreationScreen('entry')
  }

  const completeDraftProject = async (project: CommitProjectCreationDraftResult) => {
    setActiveDraft(null)
    rememberDraft(null)
    setCreationOpen(false)
    setCreationScreen('entry')
    router.push(`/projects/${project.id}?created=1&warnings=${project.acknowledgedWarnings}`)
  }

  const counts = useMemo(() => {
    const c = { total: projects.length, green: 0, amber: 0, red: 0 }
    for (const p of projects) {
      if (p.ragStatus === 'GREEN') c.green++
      else if (p.ragStatus === 'AMBER') c.amber++
      else if (p.ragStatus === 'RED') c.red++
    }
    return c
  }, [projects])

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
            {canCreateProject && (
              <button className="btn btn-primary" onClick={openCreation}>
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
          description={canCreateProject ? 'Create your first project to start tracking delivery.' : 'No projects are visible to you yet.'}
          action={canCreateProject ? { label: 'New Project', onClick: openCreation } : undefined}
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
              href={`/projects/${p.id}`}
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
                <ProjectProgress actual={p.percentComplete} planned={p.percentPlanned} />
              </div>
              <div className="col-span-1 text-right text-body font-semibold tabular-nums text-ink-primary">{p.confidence}</div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={creationOpen}
        onClose={() => setCreationOpen(false)}
        title="New Project"
        size="xl"
        scrollBehavior="internal"
        closeOnBackdrop={!createDraft.isPending && !updateDraft.isPending}
        closeOnEsc={!createDraft.isPending && !updateDraft.isPending}
      >
        {creationScreen === 'entry' ? (
          <NewProjectEntry
            aiFeatureEnabled={aiFeatureEnabled}
            aiAvailable={aiAvailable}
            currentDraftMethod={activeDraft?.sourceMethod}
            isStarting={createDraft.isPending || updateDraft.isPending}
            onSelect={selectMethod}
            onResume={activeDraft ? () => setCreationScreen('draft') : undefined}
          />
        ) : activeDraft ? (
          <CreationDraftShell
            draft={activeDraft}
            onBack={() => setCreationScreen('entry')}
            onSaveExit={() => setCreationOpen(false)}
            onDiscard={discardActiveDraft}
            isDiscarding={discardDraft.isPending}
            progressStep={activeDraft.sourceMethod === 'MANUAL'
              ? manualProgressStep
              : activeDraft.sourceMethod === 'FILE_IMPORT'
              ? importProgressStep
              : 1}
          >
            {activeDraft.sourceMethod === 'MANUAL' ? (
              <CreateProjectWizard
                draft={activeDraft}
                currentUserId={currentUserId}
                onDraftUpdated={setActiveDraft}
                onCreated={completeDraftProject}
                onSaveExit={() => setCreationOpen(false)}
                onProgressChange={setManualProgressStep}
              />
            ) : activeDraft.sourceMethod === 'FILE_IMPORT' ? (
              <ImportUploadStep
                draft={activeDraft}
                onDraftUpdated={setActiveDraft}
                onProgressChange={setImportProgressStep}
                onSaveExit={() => setCreationOpen(false)}
                onCommitted={completeDraftProject}
              />
            ) : undefined}
          </CreationDraftShell>
        ) : savedDraft.isLoading ? (
          <div className="space-y-3" aria-label="Loading saved project draft">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-52 rounded-card" />
          </div>
        ) : (
          <NewProjectEntry
            aiFeatureEnabled={aiFeatureEnabled}
            aiAvailable={aiAvailable}
            isStarting={createDraft.isPending}
            onSelect={selectMethod}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={switchConfirmOpen}
        onClose={() => {
          setSwitchConfirmOpen(false)
          setPendingMethod(null)
        }}
        onConfirm={confirmMethodSwitch}
        title="Switch creation method?"
        message={pendingMethod
          ? `Switch to ${projectCreationMethodLabel(pendingMethod).toLowerCase()}?`
          : 'Switch creation method?'}
        description="Common project details will be preserved. Method-specific schedule, source, and validation work will be discarded only after you confirm."
        confirmLabel="Switch method"
        isLoading={updateDraft.isPending}
        loadingLabel="Switching"
        variant="warning"
      />
    </div>
  )
}
