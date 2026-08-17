'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  useProjectTemplate,
  useCreateProjectTemplate,
  useUpdateProjectTemplate,
  useCloneProjectTemplate,
  type ProjectTemplateDetail,
} from '../hooks/useProjects'
import { PROJECT_TYPES, PROJECT_TYPE_LABEL, type ProjectType } from '../types'

type OwnerParty = '360GROUND' | 'CLIENT' | 'SHARED'

interface ActivityNode {
  clientId: string
  title: string
  ownerParty: OwnerParty
  weight?: number
  isApproval: boolean
}

interface MilestoneNode {
  clientId: string
  name: string
  weight?: number
  isKeyMilestone: boolean
  activities: ActivityNode[]
}

interface PhaseNode {
  clientId: string
  name: string
  weight: number
  milestones: MilestoneNode[]
}

interface Props {
  templateId?: string
  userRole: string
}

const CAN_MUTATE = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']
const OWNER_PARTIES: { value: OwnerParty; label: string }[] = [
  { value: '360GROUND', label: '360Ground' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'SHARED', label: 'Shared' },
]

export function TemplateBuilderClient({ templateId, userRole }: Props) {
  const router = useRouter()
  const canMutate = CAN_MUTATE.includes(userRole)
  const isNew = !templateId
  const { data, isLoading } = useProjectTemplate(templateId ?? null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState<ProjectType | ''>('WEBSITE')
  const [phases, setPhases] = useState<PhaseNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<string[]>([])
  const [cloneOpen, setCloneOpen] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!data || initialized.current) return
    initialized.current = true
    const loaded = toNodes(data.structureJson)
    setName(data.name)
    setDescription(data.description ?? '')
    setProjectType(data.projectType ?? '')
    setPhases(loaded)
    const allIds = collectIds(loaded)
    setExpanded(new Set(allIds))
    setSelectedId(loaded[0]?.clientId ?? null)
  }, [data])

  const readOnly = !canMutate || (!isNew && data?.isSystem === true)

  const selected = useMemo(
    () => (selectedId ? findNode(phases, selectedId) : null),
    [phases, selectedId],
  )

  const create = useCreateProjectTemplate()
  const update = useUpdateProjectTemplate(templateId ?? '')
  const clone = useCloneProjectTemplate(templateId ?? '')

  const handleSave = async () => {
    const validation = validate(phases, name)
    if (!projectType) validation.push('Project type is required')
    setErrors(validation)
    if (validation.length > 0 || !projectType) return

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      projectType,
      structureJson: fromNodes(phases),
    }

    if (isNew) {
      const result = await create.mutateAsync(payload)
      router.push(`/dashboard/projects/templates/${result.id}`)
    } else {
      await update.mutateAsync(payload)
    }
  }

  const handleDrop = (
    kind: 'phase' | 'milestone' | 'activity',
    parentId: string | null,
    sourceId: string,
    targetId: string,
  ) => {
    if (sourceId === targetId) return
    if (kind === 'phase') {
      setPhases((prev) => reorderList(prev, sourceId, targetId))
    } else if (kind === 'milestone' && parentId) {
      setPhases((prev) =>
        prev.map((p) =>
          p.clientId === parentId
            ? { ...p, milestones: reorderList(p.milestones, sourceId, targetId) }
            : p,
        ),
      )
    } else if (kind === 'activity' && parentId) {
      setPhases((prev) =>
        prev.map((p) => ({
          ...p,
          milestones: p.milestones.map((m) =>
            m.clientId === parentId
              ? { ...m, activities: reorderList(m.activities, sourceId, targetId) }
              : m,
          ),
        })),
      )
    }
  }

  const handleAddPhase = () => {
    const id = genId()
    setPhases((prev) => [...prev, { clientId: id, name: '', weight: 100, milestones: [] }])
    setSelectedId(id)
    setExpanded((prev) => new Set(prev).add(id))
  }

  const handleAddMilestone = (phaseId: string) => {
    const id = genId()
    setPhases((prev) =>
      prev.map((p) =>
        p.clientId === phaseId
          ? {
              ...p,
              milestones: [...p.milestones, { clientId: id, name: '', isKeyMilestone: false, activities: [] }],
            }
          : p,
      ),
    )
    setSelectedId(id)
    setExpanded((prev) => new Set(prev).add(phaseId).add(id))
  }

  const handleAddActivity = (milestoneId: string) => {
    const id = genId()
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        milestones: p.milestones.map((m) =>
          m.clientId === milestoneId
            ? {
                ...m,
                activities: [
                  ...m.activities,
                  { clientId: id, title: '', ownerParty: '360GROUND', isApproval: false },
                ],
              }
            : m,
        ),
      })),
    )
    setSelectedId(id)
    setExpanded((prev) => new Set(prev).add(milestoneId).add(id))
  }

  const handleUpdate = (id: string, patch: Record<string, unknown>) => {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.clientId === id) return { ...p, ...patch } as PhaseNode
        return {
          ...p,
          milestones: p.milestones.map((m) => {
            if (m.clientId === id) return { ...m, ...patch } as MilestoneNode
            return {
              ...m,
              activities: m.activities.map((a) =>
                a.clientId === id ? ({ ...a, ...patch } as ActivityNode) : a,
              ),
            }
          }),
        }
      }),
    )
  }

  const handleRemove = (id: string) => {
    setPhases((prev) => {
      const next: PhaseNode[] = []
      for (const p of prev) {
        if (p.clientId === id) continue
        const milestones: MilestoneNode[] = []
        for (const m of p.milestones) {
          if (m.clientId === id) continue
          milestones.push({ ...m, activities: m.activities.filter((a) => a.clientId !== id) })
        }
        next.push({ ...p, milestones })
      }
      return next
    })
    setSelectedId((current) => (current === id ? null : current))
  }

  const handleToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isSaving = create.isPending || update.isPending

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1400px] flex-col px-6 py-6">
      <PageHeader
        title={isNew ? 'New Template' : name || 'Edit Template'}
        description={
          isNew
            ? 'Design a reusable project structure.'
            : data?.description || 'Edit phases, milestones, and activities.'
        }
        breadcrumb={
          <Link
            href="/dashboard/projects/templates"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 size-4" /> Templates
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            {!isNew && data?.isSystem && (
              <Button variant="secondary" onClick={() => setCloneOpen(true)}>
                <Copy className="mr-1.5 size-4" /> Clone
              </Button>
            )}
            {!readOnly && (
              <Button onClick={handleSave} disabled={isSaving || !name.trim() || !projectType}>
                <Save className="mr-1.5 size-4" />
                {isSaving ? 'Saving…' : 'Save template'}
              </Button>
            )}
          </div>
        }
      />

      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <ul className="list-inside list-disc space-y-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 gap-6">
          <Skeleton className="h-full flex-1 rounded-xl" />
          <Skeleton className="h-full w-[380px] rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-1 gap-6 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <div className="border-b px-5 py-4">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="tpl-name">Template name</Label>
                  <Input
                    id="tpl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={readOnly}
                    placeholder="Template name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="tpl-project-type">Project type</Label>
                  <select
                    id="tpl-project-type"
                    className="input mt-1"
                    value={projectType}
                    onChange={(event) => setProjectType(event.target.value as ProjectType)}
                    disabled={readOnly}
                  >
                    {!projectType && <option value="">General / all project types</option>}
                    {PROJECT_TYPES.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABEL[type]}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Projects with this type will see this template as a recommended schedule.</p>
                </div>
                <div>
                  <Label htmlFor="tpl-desc">Description</Label>
                  <Textarea
                    id="tpl-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={readOnly}
                    placeholder="Short description of when to use this template"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {phases.length === 0 ? (
                <EmptyState
                  icon={Plus}
                  title="Start building"
                  description="Add a phase to define the first stage of delivery."
                  action={
                    readOnly
                      ? undefined
                      : { label: 'Add phase', onClick: handleAddPhase }
                  }
                />
              ) : (
                <div className="space-y-3">
                  {phases.map((phase) => (
                    <PhaseNode
                      key={phase.clientId}
                      phase={phase}
                      expanded={expanded}
                      selectedId={selectedId}
                      readOnly={readOnly}
                      onToggle={handleToggle}
                      onSelect={setSelectedId}
                      onAddMilestone={handleAddMilestone}
                      onAddActivity={handleAddActivity}
                      onUpdate={handleUpdate}
                      onRemove={handleRemove}
                      onDrop={handleDrop}
                    />
                  ))}
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={handleAddPhase}>
                      <Plus className="mr-1.5 size-4" /> Add phase
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="w-[380px] overflow-y-auto rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            {selected ? (
              <NodeEditor
                node={selected}
                readOnly={readOnly}
                onChange={(patch) => handleUpdate(selectedId!, patch)}
                onRemove={() => handleRemove(selectedId!)}
              />
            ) : (
              <EmptyState
                icon={Plus}
                title="Select an item"
                description="Choose a phase, milestone, or activity to edit its details."
              />
            )}
          </div>
        </div>
      )}

      {cloneOpen && data && (
        <CloneBuilderModal
          sourceName={data.name}
          open
          onClose={() => setCloneOpen(false)}
          onCloned={(id) => router.push(`/dashboard/projects/templates/${id}`)}
          clone={clone}
        />
      )}
    </div>
  )
}

function PhaseNode({
  phase,
  expanded,
  selectedId,
  readOnly,
  onToggle,
  onSelect,
  onAddMilestone,
  onAddActivity,
  onUpdate,
  onRemove,
  onDrop,
}: {
  phase: PhaseNode
  expanded: Set<string>
  selectedId: string | null
  readOnly: boolean
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onAddMilestone: (phaseId: string) => void
  onAddActivity: (milestoneId: string) => void
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onRemove: (id: string) => void
  onDrop: (
    kind: 'phase' | 'milestone' | 'activity',
    parentId: string | null,
    sourceId: string,
    targetId: string,
  ) => void
}) {
  const isExpanded = expanded.has(phase.clientId)
  const isSelected = selectedId === phase.clientId

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
    >
      <div
        className="flex items-center gap-1 px-3 py-2"
        draggable={!readOnly}
        onDragStart={(e) =>
          e.dataTransfer.setData(
            'application/json',
            JSON.stringify({ kind: 'phase', parentId: null, clientId: phase.clientId }),
          )
        }
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const raw = e.dataTransfer.getData('application/json')
          if (!raw) return
          try {
            const p = JSON.parse(raw)
            if (p.kind === 'phase') onDrop('phase', null, p.clientId, phase.clientId)
          } catch {}
        }}
      >
        {!readOnly && <GripVertical className="size-4 text-muted-foreground" />}
        <button
          type="button"
          onClick={() => onToggle(phase.clientId)}
          className="flex size-6 items-center justify-center text-muted-foreground"
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => onSelect(phase.clientId)}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cn('block truncate font-medium', !phase.name && 'italic text-muted-foreground')}>
            {phase.name || 'Untitled phase'}
          </span>
          <span className="text-xs text-muted-foreground">weight {phase.weight ?? 0}</span>
        </button>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onAddMilestone(phase.clientId)}
              title="Add milestone"
            >
              <Plus className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemove(phase.clientId)}
              title="Remove phase"
            >
              <Trash2 className="size-3 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2">
          {phase.milestones.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No milestones yet.</p>
          ) : (
            <div className="space-y-2">
              {phase.milestones.map((milestone) => (
                <MilestoneNode
                  key={milestone.clientId}
                  phaseId={phase.clientId}
                  milestone={milestone}
                  expanded={expanded}
                  selectedId={selectedId}
                  readOnly={readOnly}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onAddActivity={onAddActivity}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                  onDrop={onDrop}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MilestoneNode({
  phaseId,
  milestone,
  expanded,
  selectedId,
  readOnly,
  onToggle,
  onSelect,
  onAddActivity,
  onUpdate,
  onRemove,
  onDrop,
}: {
  phaseId: string
  milestone: MilestoneNode
  expanded: Set<string>
  selectedId: string | null
  readOnly: boolean
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onAddActivity: (milestoneId: string) => void
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onRemove: (id: string) => void
  onDrop: (
    kind: 'phase' | 'milestone' | 'activity',
    parentId: string | null,
    sourceId: string,
    targetId: string,
  ) => void
}) {
  const isExpanded = expanded.has(milestone.clientId)
  const isSelected = selectedId === milestone.clientId

  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
      )}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5"
        draggable={!readOnly}
        onDragStart={(e) =>
          e.dataTransfer.setData(
            'application/json',
            JSON.stringify({ kind: 'milestone', parentId: phaseId, clientId: milestone.clientId }),
          )
        }
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const raw = e.dataTransfer.getData('application/json')
          if (!raw) return
          try {
            const p = JSON.parse(raw)
            if (p.kind === 'milestone' && p.parentId === phaseId) {
              onDrop('milestone', phaseId, p.clientId, milestone.clientId)
            }
          } catch {}
        }}
      >
        {!readOnly && <GripVertical className="size-3.5 text-muted-foreground" />}
        <button
          type="button"
          onClick={() => onToggle(milestone.clientId)}
          className="flex size-5 items-center justify-center text-muted-foreground"
        >
          {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onSelect(milestone.clientId)}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cn('block truncate text-sm font-medium', !milestone.name && 'italic text-muted-foreground')}>
            {milestone.name || 'Untitled milestone'}
          </span>
          <span className="text-xs text-muted-foreground">
            {milestone.activities.length} activities
            {milestone.isKeyMilestone && ' · key milestone'}
          </span>
        </button>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onAddActivity(milestone.clientId)}
              title="Add activity"
            >
              <Plus className="size-3" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => onRemove(milestone.clientId)}>
              <Trash2 className="size-3 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-1 border-t px-2 py-2">
          {milestone.activities.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No activities yet.</p>
          ) : (
            milestone.activities.map((activity) => (
              <ActivityNodeRow
                key={activity.clientId}
                phaseId={phaseId}
                milestoneId={milestone.clientId}
                activity={activity}
                selectedId={selectedId}
                readOnly={readOnly}
                onSelect={onSelect}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onDrop={onDrop}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ActivityNodeRow({
  phaseId,
  milestoneId,
  activity,
  selectedId,
  readOnly,
  onSelect,
  onUpdate,
  onRemove,
  onDrop,
}: {
  phaseId: string
  milestoneId: string
  activity: ActivityNode
  selectedId: string | null
  readOnly: boolean
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onRemove: (id: string) => void
  onDrop: (
    kind: 'phase' | 'milestone' | 'activity',
    parentId: string | null,
    sourceId: string,
    targetId: string,
  ) => void
}) {
  const isSelected = selectedId === activity.clientId

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1.5 text-sm',
        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
      draggable={!readOnly}
      onDragStart={(e) =>
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ kind: 'activity', parentId: milestoneId, clientId: activity.clientId }),
        )
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const raw = e.dataTransfer.getData('application/json')
        if (!raw) return
        try {
          const p = JSON.parse(raw)
          if (p.kind === 'activity' && p.parentId === milestoneId) {
            onDrop('activity', milestoneId, p.clientId, activity.clientId)
          }
        } catch {}
      }}
    >
      {!readOnly && <GripVertical className="size-3 text-muted-foreground" />}
      <button
        type="button"
        onClick={() => onSelect(activity.clientId)}
        className="min-w-0 flex-1 text-left"
      >
        <span className={cn('block truncate', !activity.title && 'italic text-muted-foreground')}>
          {activity.title || 'Untitled activity'}
        </span>
        <span className="text-xs text-muted-foreground">
          {activity.ownerParty.toLowerCase()}
          {activity.isApproval && ' · approval'}
        </span>
      </button>
      {!readOnly && (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={() => onRemove(activity.clientId)}>
            <Trash2 className="size-3 text-destructive" />
          </Button>
        </div>
      )}
    </div>
  )
}

function NodeEditor({
  node,
  readOnly,
  onChange,
  onRemove,
}: {
  node: NodeInfo
  readOnly: boolean
  onChange: (patch: Record<string, unknown>) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{node.kind}</Badge>
        {!readOnly && (
          <Button variant="ghost" size="icon-xs" onClick={onRemove}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>

      {node.kind === 'phase' && (
        <>
          <div className="space-y-1.5">
            <Label>Phase name</Label>
            <Input
              value={node.name}
              onChange={(e) => onChange({ name: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Weight</Label>
            <Input
              type="number"
              min={0}
              value={node.weight ?? ''}
              onChange={(e) => onChange({ weight: Number(e.target.value) })}
              disabled={readOnly}
            />
          </div>
        </>
      )}

      {node.kind === 'milestone' && (
        <>
          <div className="space-y-1.5">
            <Label>Milestone name</Label>
            <Input
              value={node.name}
              onChange={(e) => onChange({ name: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Weight (optional)</Label>
            <Input
              type="number"
              min={0}
              value={node.weight ?? ''}
              onChange={(e) =>
                onChange({ weight: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              disabled={readOnly}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={node.isKeyMilestone}
              onChange={(e) => onChange({ isKeyMilestone: e.target.checked })}
              disabled={readOnly}
              className="size-4 rounded border-input"
            />
            Key milestone
          </label>
        </>
      )}

      {node.kind === 'activity' && (
        <>
          <div className="space-y-1.5">
            <Label>Activity title</Label>
            <Input
              value={node.title}
              onChange={(e) => onChange({ title: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Owner party</Label>
            <Select
              value={node.ownerParty}
              onValueChange={(v) => onChange({ ownerParty: v })}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OWNER_PARTIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Weight (optional)</Label>
            <Input
              type="number"
              min={0}
              value={node.weight ?? ''}
              onChange={(e) =>
                onChange({ weight: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              disabled={readOnly}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={node.isApproval}
              onChange={(e) => onChange({ isApproval: e.target.checked })}
              disabled={readOnly}
              className="size-4 rounded border-input"
            />
            Approval gate
          </label>
        </>
      )}
    </div>
  )
}

function CloneBuilderModal({
  sourceName,
  open,
  onClose,
  onCloned,
  clone,
}: {
  sourceName: string
  open: boolean
  onClose: () => void
  onCloned: (id: string) => void
  clone: ReturnType<typeof useCloneProjectTemplate>
}) {
  const [name, setName] = useState(`Copy of ${sourceName}`)

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
          <Button variant="outline" onClick={onClose} disabled={clone.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="clone-builder-form" disabled={!name.trim() || clone.isPending}>
            {clone.isPending ? 'Cloning…' : 'Clone'}
          </Button>
        </>
      }
    >
      <form id="clone-builder-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create an editable copy of <strong>{sourceName}</strong>.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="clone-builder-name">New template name</Label>
          <Input
            id="clone-builder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </form>
    </Modal>
  )
}

// --- helpers ----------------------------------------------------------------

type NodeInfo =
  | { kind: 'phase'; name: string; weight: number }
  | { kind: 'milestone'; name: string; weight?: number; isKeyMilestone: boolean }
  | { kind: 'activity'; title: string; ownerParty: OwnerParty; weight?: number; isApproval: boolean }

function toNodes(structure: ProjectTemplateDetail['structureJson']): PhaseNode[] {
  return structure.phases.map((p) => ({
    clientId: genId(),
    name: p.name,
    weight: p.weight,
    milestones: p.milestones.map((m) => ({
      clientId: genId(),
      name: m.name,
      weight: m.weight,
      isKeyMilestone: m.isKeyMilestone,
      activities: m.activities.map((a) => ({
        clientId: genId(),
        title: a.title,
        ownerParty: a.ownerParty,
        weight: a.weight,
        isApproval: a.isApproval,
      })),
    })),
  }))
}

function fromNodes(phases: PhaseNode[]): ProjectTemplateDetail['structureJson'] {
  return {
    phases: phases.map((p) => ({
      name: p.name.trim(),
      weight: p.weight,
      milestones: p.milestones.map((m) => ({
        name: m.name.trim(),
        weight: m.weight,
        isKeyMilestone: m.isKeyMilestone,
        activities: m.activities.map((a) => ({
          title: a.title.trim(),
          ownerParty: a.ownerParty,
          weight: a.weight,
          isApproval: a.isApproval,
        })),
      })),
    })),
  }
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function collectIds(phases: PhaseNode[]): string[] {
  const ids: string[] = []
  for (const p of phases) {
    ids.push(p.clientId)
    for (const m of p.milestones) {
      ids.push(m.clientId)
      for (const a of m.activities) ids.push(a.clientId)
    }
  }
  return ids
}

function findNode(phases: PhaseNode[], id: string): NodeInfo | null {
  for (const p of phases) {
    if (p.clientId === id) return { kind: 'phase', name: p.name, weight: p.weight }
    for (const m of p.milestones) {
      if (m.clientId === id)
        return { kind: 'milestone', name: m.name, weight: m.weight, isKeyMilestone: m.isKeyMilestone }
      for (const a of m.activities) {
        if (a.clientId === id)
          return {
            kind: 'activity',
            title: a.title,
            ownerParty: a.ownerParty,
            weight: a.weight,
            isApproval: a.isApproval,
          }
      }
    }
  }
  return null
}

function reorderList<T extends { clientId: string }>(list: T[], sourceId: string, targetId: string): T[] {
  const sourceIdx = list.findIndex((x) => x.clientId === sourceId)
  let targetIdx = list.findIndex((x) => x.clientId === targetId)
  if (sourceIdx < 0 || targetIdx < 0) return list
  const copy = [...list]
  const [moved] = copy.splice(sourceIdx, 1)
  // After removing the source, adjust the target index so the source lands before the target.
  if (sourceIdx < targetIdx) targetIdx -= 1
  copy.splice(targetIdx, 0, moved)
  return copy
}

function validate(phases: PhaseNode[], name: string): string[] {
  const errors: string[] = []
  if (!name.trim()) errors.push('Template name is required')
  if (phases.length === 0) errors.push('Add at least one phase')
  phases.forEach((p, pi) => {
    if (!p.name.trim()) errors.push(`Phase ${pi + 1} needs a name`)
    if (p.milestones.length === 0)
      errors.push(`Phase “${p.name || `#${pi + 1}`}” needs at least one milestone`)
    p.milestones.forEach((m, mi) => {
      if (!m.name.trim())
        errors.push(`Milestone ${mi + 1} in phase “${p.name || `#${pi + 1}`}” needs a name`)
      if (m.activities.length === 0)
        errors.push(
          `Milestone “${m.name || `#${mi + 1}`}” in phase “${p.name || `#${pi + 1}`}” needs at least one activity`,
        )
      m.activities.forEach((a, ai) => {
        if (!a.title.trim())
          errors.push(
            `Activity ${ai + 1} in milestone “${m.name || `#${mi + 1}`}” needs a title`,
          )
      })
    })
  })
  return errors
}
