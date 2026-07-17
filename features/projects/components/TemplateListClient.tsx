'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Copy,
  Edit3,
  FilePlus,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDebounce } from '@/hooks/useDebounce'
import {
  useProjectTemplates,
  useCreateProjectTemplate,
  useDeleteProjectTemplate,
  useCloneProjectTemplate,
  type ProjectTemplateSummary,
} from '../hooks/useProjects'

interface Props {
  user: { id: string; role: string }
}

const CAN_MUTATE = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

export function TemplateListClient({ user }: Props) {
  const router = useRouter()
  const canMutate = CAN_MUTATE.includes(user.role)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const { data, isLoading } = useProjectTemplates()
  const templates = data ?? []

  const filtered = useMemo(() => {
    const q = debounced.toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    )
  }, [templates, debounced])

  const [createOpen, setCreateOpen] = useState(false)
  const [cloneTarget, setCloneTarget] = useState<ProjectTemplateSummary | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<ProjectTemplateSummary | null>(
    null,
  )

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader
        title="Project Templates"
        description="Reusable delivery structures for new projects."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/projects" className="btn btn-secondary">
              <Layers className="mr-1.5 size-4" /> Projects
            </Link>
            {canMutate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 size-4" /> New Template
              </Button>
            )}
          </div>
        }
      />

      <div className="relative mb-6 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No templates found"
          description={
            canMutate
              ? 'Create a reusable project structure to speed up project kickoff.'
              : 'No templates are visible to you yet.'
          }
          action={
            canMutate
              ? { label: 'New Template', onClick: () => setCreateOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              canMutate={canMutate}
              onClone={() => setCloneTarget(t)}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      <CreateTemplateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => router.push(`/dashboard/projects/templates/${id}`)}
      />

      {cloneTarget && (
        <CloneTemplateModal
          source={cloneTarget}
          open
          onClose={() => setCloneTarget(null)}
          onCloned={(id) => router.push(`/dashboard/projects/templates/${id}`)}
        />
      )}

      {deleteTarget && (
        <DeleteTemplateDialog
          template={deleteTarget}
          open
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function TemplateCard({
  template,
  canMutate,
  onClone,
  onDelete,
}: {
  template: ProjectTemplateSummary
  canMutate: boolean
  onClone: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FilePlus className="size-5 text-primary" />
          <h3 className="line-clamp-2 font-medium leading-tight">
            {template.name}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {template.isSystem && (
            <Badge variant="secondary">System</Badge>
          )}
          {canMutate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/projects/templates/${template.id}`}
                    className="flex items-center gap-2"
                  >
                    <Edit3 className="size-4" /> Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onClone}>
                  <Copy className="mr-2 size-4" /> Clone
                </DropdownMenuItem>
                {!template.isSystem && (
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {template.description ? (
        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
          {template.description}
        </p>
      ) : (
        <div className="mb-4 flex-1" />
      )}

      <div className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span title="Phases">{template.phases} phases</span>
          <span>·</span>
          <span title="Milestones">{template.milestones} milestones</span>
          <span>·</span>
          <span title="Activities">{template.activities} activities</span>
        </div>
        <span>v{template.version}</span>
      </div>
    </div>
  )
}

function CreateTemplateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useCreateProjectTemplate()

  const reset = () => {
    setName('')
    setDescription('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
    })
    reset()
    onClose()
    onCreated(result.id)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create project template"
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-template-form"
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create & open builder'}
          </Button>
        </>
      }
    >
      <form id="create-template-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Enterprise Software Implementation"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="template-description">Description</Label>
          <Textarea
            id="template-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What kind of project is this template for?"
            rows={3}
          />
        </div>
      </form>
    </Modal>
  )
}

function CloneTemplateModal({
  source,
  open,
  onClose,
  onCloned,
}: {
  source: ProjectTemplateSummary
  open: boolean
  onClose: () => void
  onCloned: (id: string) => void
}) {
  const [name, setName] = useState(`Copy of ${source.name}`)
  const clone = useCloneProjectTemplate(source.id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await clone.mutateAsync({ name: name.trim() })
    onClose()
    onCloned(result.id)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clone template"
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={clone.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="clone-template-form"
            disabled={!name.trim() || clone.isPending}
          >
            {clone.isPending ? 'Cloning…' : 'Clone'}
          </Button>
        </>
      }
    >
      <form id="clone-template-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create an editable copy of <strong>{source.name}</strong>.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="clone-name">New template name</Label>
          <Input
            id="clone-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </form>
    </Modal>
  )
}

function DeleteTemplateDialog({
  template,
  open,
  onClose,
}: {
  template: ProjectTemplateSummary
  open: boolean
  onClose: () => void
}) {
  const remove = useDeleteProjectTemplate()

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={async () => {
        await remove.mutateAsync(template.id)
        onClose()
      }}
      title="Delete template"
      message={`Are you sure you want to delete “${template.name}”?`}
      description="This cannot be undone. Projects already created from this template are not affected."
      variant="danger"
      confirmLabel="Delete"
      isLoading={remove.isPending}
    />
  )
}
