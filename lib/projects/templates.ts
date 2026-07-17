/**
 * Project templates — the seeded delivery lifecycles and the instantiation logic.
 *
 * A template's `structureJson` is a phases → milestones → activities tree. When a
 * project is created from a template the tree is **copied** into concrete Phase /
 * Milestone / Activity rows (build spec A2: "templates are copied at instantiation,
 * not referenced live"), so later edits to a template never affect existing projects.
 *
 * CRITICAL (A2 DoD): every approval activity is seeded with `ownerParty = 'CLIENT'` so
 * the Approval Clock (Epic C3) works out of the box.
 *
 * Build spec: docs/project_management_module_BUILD_SPEC.md §A2.
 */

import type { Prisma, ProjectTemplate } from '@prisma/client'
import type { OwnerParty } from '@/features/projects/types'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'

// --- structureJson shape -----------------------------------------------------

export interface TemplateActivity {
  title: string
  ownerParty?: OwnerParty // default 360GROUND
  weight?: number // default 1
  /** Marks a client sign-off / approval step (seeded ownerParty CLIENT, drives the clock). */
  isApproval?: boolean
}

export interface TemplateMilestone {
  name: string
  weight?: number // default: equal split within phase
  isKeyMilestone?: boolean
  activities: TemplateActivity[]
}

export interface TemplatePhase {
  name: string
  weight: number // % contribution to project
  milestones: TemplateMilestone[]
}

export interface TemplateStructure {
  phases: TemplatePhase[]
}

export interface SystemTemplateDef {
  /** Stable slug used for idempotent upsert. */
  slug: string
  name: string
  description: string
  structure: TemplateStructure
}

// Helper: approval activity always owned by CLIENT.
const approval = (title: string): TemplateActivity => ({ title, isApproval: true, ownerParty: 'CLIENT' })
const client = (title: string): TemplateActivity => ({ title, ownerParty: 'CLIENT' })
const shared = (title: string): TemplateActivity => ({ title, ownerParty: 'SHARED' })

// --- 1) Standard Software Delivery (build spec A2 table) --------------------

const STANDARD_SOFTWARE: TemplateStructure = {
  phases: [
    {
      name: 'Project Initiation',
      weight: 20,
      milestones: [
        { name: 'Kick-off', activities: [{ title: 'Kick-off Meeting' }] },
        { name: 'Team Formation', activities: [{ title: 'Team Formation' }] },
        {
          name: 'Inception Report',
          isKeyMilestone: true,
          activities: [{ title: 'IR Preparation' }, { title: 'IR Review & Feedback' }, approval('IR Approval')],
        },
      ],
    },
    {
      name: 'Planning, Requirements & Design',
      weight: 20,
      milestones: [
        {
          name: 'Requirements',
          isKeyMilestone: true,
          activities: [
            { title: 'Requirements Gathering Sessions' },
            { title: 'Requirements Document Preparation' },
            { title: 'Requirements Review & Feedback' },
            approval('Requirements Document Approval'),
          ],
        },
      ],
    },
    {
      name: 'Design Phase',
      weight: 20,
      milestones: [
        {
          name: 'Design',
          isKeyMilestone: true,
          activities: [
            client('Share Brand Guide'),
            { title: 'UI/UX Design' },
            { title: 'Design Review' },
            approval('Design Approval'),
          ],
        },
      ],
    },
    {
      name: 'Iterative Development',
      weight: 20,
      milestones: [
        { name: 'Development', activities: [{ title: 'Sprint Development' }] },
      ],
    },
    {
      name: 'Testing & Acceptance',
      weight: 20,
      milestones: [
        {
          name: 'UAT',
          isKeyMilestone: true,
          activities: [
            { title: 'Test Case Preparation' },
            shared('Conduct UAT'),
            { title: 'UAT Resolution' },
            approval('UAT Sign-off'),
          ],
        },
      ],
    },
    {
      name: 'Training & Documentation',
      weight: 0,
      milestones: [
        {
          name: 'Training & Handover',
          activities: [{ title: 'Training Material' }, { title: 'Training Delivery' }, { title: 'Handover Docs' }],
        },
      ],
    },
    {
      name: 'Deployment',
      weight: 0,
      milestones: [
        {
          name: 'Go-Live',
          isKeyMilestone: true,
          activities: [{ title: 'Deployment Prep' }, { title: 'Go-Live' }, { title: 'Post-Go-Live Support' }],
        },
      ],
    },
  ],
}

// --- 2) Consulting / Advisory Engagement (no Jira, no dev phases) -----------

const CONSULTING: TemplateStructure = {
  phases: [
    {
      name: 'Inception',
      weight: 20,
      milestones: [{ name: 'Inception Report', isKeyMilestone: true, activities: [{ title: 'Inception Preparation' }, approval('Inception Approval')] }],
    },
    {
      name: 'Discovery & Requirements',
      weight: 20,
      milestones: [{ name: 'Discovery', activities: [client('Provide Data & Access'), { title: 'Stakeholder Interviews' }, { title: 'Requirements Synthesis' }] }],
    },
    {
      name: 'Analysis',
      weight: 20,
      milestones: [{ name: 'Analysis', activities: [{ title: 'Data Analysis' }, { title: 'Findings Draft' }] }],
    },
    {
      name: 'Draft Deliverable',
      weight: 20,
      milestones: [{ name: 'Draft', isKeyMilestone: true, activities: [{ title: 'Draft Deliverable Preparation' }, { title: 'Internal Review' }, approval('Draft Approval')] }],
    },
    {
      name: 'Final Delivery',
      weight: 20,
      milestones: [{ name: 'Final', isKeyMilestone: true, activities: [{ title: 'Incorporate Feedback' }, approval('Final Sign-off')] }],
    },
  ],
}

// --- 3) Government Tender Delivery (adds compliance/audit gates) -------------

const GOVERNMENT_TENDER: TemplateStructure = {
  phases: [
    {
      name: 'Contract & Compliance Setup',
      weight: 15,
      milestones: [
        {
          name: 'Compliance Gate',
          isKeyMilestone: true,
          activities: [{ title: 'Contract Execution' }, client('Provide Compliance Documents'), approval('Compliance Baseline Approval')],
        },
      ],
    },
    {
      name: 'Project Initiation',
      weight: 15,
      milestones: [{ name: 'Inception Report', isKeyMilestone: true, activities: [{ title: 'IR Preparation' }, approval('IR Approval')] }],
    },
    {
      name: 'Requirements & Design',
      weight: 20,
      milestones: [{ name: 'Requirements', isKeyMilestone: true, activities: [{ title: 'Requirements Preparation' }, { title: 'Requirements Review' }, approval('Requirements Approval')] }],
    },
    {
      name: 'Implementation',
      weight: 20,
      milestones: [{ name: 'Build', activities: [{ title: 'Implementation' }] }],
    },
    {
      name: 'Testing, Audit & Acceptance',
      weight: 20,
      milestones: [
        {
          name: 'UAT & Audit',
          isKeyMilestone: true,
          activities: [{ title: 'Test Case Preparation' }, shared('Conduct UAT'), { title: 'Independent Audit' }, approval('UAT & Audit Sign-off')],
        },
      ],
    },
    {
      name: 'Deployment & Handover',
      weight: 10,
      milestones: [{ name: 'Go-Live', isKeyMilestone: true, activities: [{ title: 'Deployment Prep' }, { title: 'Go-Live' }, { title: 'Final Handover' }] }],
    },
  ],
}

export const SYSTEM_TEMPLATES: SystemTemplateDef[] = [
  {
    slug: 'standard-software-delivery',
    name: 'Standard Software Delivery',
    description: '360Ground standard 7-phase software delivery lifecycle with client approval gates.',
    structure: STANDARD_SOFTWARE,
  },
  {
    slug: 'consulting-advisory',
    name: 'Consulting / Advisory Engagement',
    description: 'Non-software consulting lifecycle — discovery, analysis, and deliverable sign-off. No development or Jira.',
    structure: CONSULTING,
  },
  {
    slug: 'government-tender',
    name: 'Government Tender Delivery',
    description: 'Enterprise / government delivery with contractual compliance and independent audit gates.',
    structure: GOVERNMENT_TENDER,
  },
]

/**
 * Instantiate a template's structure into concrete rows under a project, inside the
 * caller's transaction. Weights: phase weight from the template; within a parent, if a
 * milestone/activity weight is omitted it defaults to an equal split summing to 100.
 * Approval / client / shared activities carry their `ownerParty`.
 */
export async function instantiateTemplateStructure(
  tx: Prisma.TransactionClient,
  projectId: string,
  structure: TemplateStructure
): Promise<void> {
  for (let pi = 0; pi < structure.phases.length; pi++) {
    const phaseDef = structure.phases[pi]
    const phase = await tx.phase.create({
      data: { projectId, name: phaseDef.name, position: pi, weight: phaseDef.weight, status: 'NOT_STARTED' },
    })

    const mCount = phaseDef.milestones.length
    for (let mi = 0; mi < mCount; mi++) {
      const mDef = phaseDef.milestones[mi]
      const mWeight = mDef.weight ?? round2(100 / Math.max(mCount, 1))
      const milestone = await tx.milestone.create({
        data: {
          phaseId: phase.id,
          name: mDef.name,
          position: mi,
          weight: mWeight,
          isKeyMilestone: mDef.isKeyMilestone ?? false,
          status: 'NOT_STARTED',
        },
      })

      const aCount = mDef.activities.length
      for (let ai = 0; ai < aCount; ai++) {
        const aDef = mDef.activities[ai]
        const aWeight = aDef.weight ?? round2(100 / Math.max(aCount, 1))
        await tx.activity.create({
          data: {
            milestoneId: milestone.id,
            position: ai,
            title: aDef.title,
            ownerParty: aDef.ownerParty ?? '360GROUND',
            weight: aWeight,
            status: 'NOT_STARTED',
            percentComplete: 0,
            // Approval steps render as milestone diamonds on the Gantt.
            isMilestone: aDef.isApproval ?? false,
          },
        })
      }
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// --- Validation & builder helpers --------------------------------------------

const ownerPartySchema = z.enum(['360GROUND', 'CLIENT', 'SHARED'])

export const templateActivitySchema = z.object({
  title: z.string().trim().min(1).max(200),
  ownerParty: ownerPartySchema.optional(),
  weight: z.number().min(0).optional(),
  isApproval: z.boolean().optional(),
})

export const templateMilestoneSchema = z.object({
  name: z.string().trim().min(1).max(200),
  weight: z.number().min(0).optional(),
  isKeyMilestone: z.boolean().optional(),
  activities: z.array(templateActivitySchema).default([]),
})

export const templatePhaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  weight: z.number().min(0),
  milestones: z.array(templateMilestoneSchema).default([]),
})

export const templateStructureSchema = z.object({
  phases: z.array(templatePhaseSchema).default([]),
})

export type ValidatedTemplateStructure = z.infer<typeof templateStructureSchema>

/** Trim strings and fill sensible defaults so the builder always works with a stable shape. */
export function normalizeTemplateStructure(structure: unknown): TemplateStructure {
  const src = (structure ?? {}) as TemplateStructure
  const phases = Array.isArray(src.phases) ? src.phases : []
  return {
    phases: phases.map((phase) => ({
      name: String(phase.name ?? '').trim(),
      weight: Number(phase.weight ?? 0),
      milestones: (phase.milestones ?? []).map((milestone) => ({
        name: String(milestone.name ?? '').trim(),
        weight: milestone.weight == null ? undefined : Number(milestone.weight),
        isKeyMilestone: Boolean(milestone.isKeyMilestone),
        activities: (milestone.activities ?? []).map((activity) => ({
          title: String(activity.title ?? '').trim(),
          ownerParty: (activity.ownerParty ?? '360GROUND') as OwnerParty,
          weight: activity.weight == null ? undefined : Number(activity.weight),
          isApproval: Boolean(activity.isApproval),
        })),
      })),
    })),
  }
}

/** Deep-copy a template's structure for cloning, stripping any system slug. */
export function cloneTemplateStructure(
  source: Pick<ProjectTemplate, 'name' | 'description' | 'structureJson'>,
  newName?: string,
): {
  name: string
  description: string | null
  isSystem: false
  version: number
  structureJson: TemplateStructure
} {
  const raw = JSON.parse(JSON.stringify(source.structureJson ?? { phases: [] })) as any
  if (raw && typeof raw === 'object') {
    delete raw.slug
  }
  return {
    name: newName?.trim() || `Copy of ${source.name}`,
    description: source.description ?? null,
    isSystem: false,
    version: 1,
    structureJson: normalizeTemplateStructure(raw),
  }
}

/** Clone any template into an editable copy and record the activity. */
export async function createTemplateClone(
  sourceId: string,
  opts: { newName?: string; createdById: string },
): Promise<{ id: string; name: string; description: string | null; isSystem: boolean; version: number }> {
  const source = await prisma.projectTemplate.findUnique({
    where: { id: sourceId },
    select: { id: true, name: true, description: true, structureJson: true },
  })
  if (!source) throw new Error('Template not found')

  const payload = cloneTemplateStructure(source, opts.newName)
  const created = await prisma.projectTemplate.create({
    data: {
      name: payload.name,
      description: payload.description,
      isSystem: payload.isSystem,
      version: payload.version,
      structureJson: payload.structureJson as unknown as Prisma.InputJsonValue,
      createdById: opts.createdById,
    },
    select: { id: true, name: true, description: true, isSystem: true, version: true },
  })

  await recordActivity({
    entityType: 'PROJECT_TEMPLATE',
    action: 'CREATED',
    actorId: opts.createdById,
    metadata: { templateId: created.id, source: 'clone', clonedFromId: source.id },
  })

  return created
}

/** Count phases, milestones, and activities in a template structure. */
export function countTemplateNodes(structure: TemplateStructure): {
  phases: number
  milestones: number
  activities: number
} {
  const phases = structure.phases.length
  const milestones = structure.phases.reduce((s, p) => s + p.milestones.length, 0)
  const activities = structure.phases.reduce(
    (s, p) => s + p.milestones.reduce((ms, m) => ms + m.activities.length, 0),
    0,
  )
  return { phases, milestones, activities }
}

/** Empty starter structure for a brand-new custom template. */
export function emptyTemplateStructure(): TemplateStructure {
  return { phases: [{ name: 'New Phase', weight: 100, milestones: [] }] }
}
