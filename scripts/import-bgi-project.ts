#!/usr/bin/env -S npx tsx
/**
 * One-shot importer for BGI Ethiopia — Stage 1 IT Modernization: 8-Week Work Plan.
 *
 * Source: docs/BGI_Ethiopia_Stage1_ - 8Week_WorkPlan v1.0.xlsx (Work Plan + Milestones sheets).
 *
 * Reuses the same production code paths as the real app so all invariants hold:
 *   - createProjectWithTemplate (lib/projects/service.ts) — project + PM ProjectMember
 *   - parseScheduleRows / phase+milestone+activity creation (mirrors app/api/projects/[id]/schedule-import/route.ts)
 *   - recalcProjectRollup (lib/projects/rollup.ts) — same transaction as the mutation
 *   - recordActivity (lib/activity-log.ts) — audit trail for every mutation
 *
 * Usage (on the VPS, inside OKR-frontend/):
 *   npx tsx scripts/import-bgi-project.ts
 */

import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { createProjectWithTemplate } from '@/lib/projects/service'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { parseScheduleRows, type ScheduleImportRecord } from '@/lib/projects/schedule-import'

const PM_EMAIL = 'eyoel@360ground.com'
const ACTOR_EMAIL = 'biruk@360ground.com'

type SourceRow = {
  num: number
  phase: string
  week: string
  activity: string
  workstream: string
  owner: string | null
  start: string
  end: string
  duration: number
  status: 'Done' | 'To-Do'
  deliverable: string | null
  checkpoint: string | null
}

// Extracted verbatim from the Work Plan sheet.
const SOURCE_ROWS: SourceRow[] = [
  {
    "num": 1,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 1",
    "activity": "Project kick-off (scope, objectives, cadence, gates)",
    "workstream": "Governance",
    "owner": "Both Teams",
    "start": "2026-07-16",
    "end": "2026-07-16",
    "duration": 1,
    "status": "Done",
    "deliverable": "Kickoff minutes; confirmed working model",
    "checkpoint": null
  },
  {
    "num": 2,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 1",
    "activity": "Access provisioning (code repos, DB, environments)",
    "workstream": "Technical",
    "owner": "BGI Ethiopia",
    "start": "2026-07-16",
    "end": "2026-07-18",
    "duration": 3,
    "status": "To-Do",
    "deliverable": "Access checklist; access status tracker",
    "checkpoint": "Access readiness checkpoint"
  },
  {
    "num": 3,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 1",
    "activity": "Gate 0 - Mobilization readiness review",
    "workstream": "Governance",
    "owner": "Both Teams",
    "start": "2026-07-20",
    "end": "2026-07-20",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Gate 0 checklist signed",
    "checkpoint": "Gate 0 sign-off"
  },
  {
    "num": 4,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 2",
    "activity": "Environment footprint mapping (dev/test/prod per module)",
    "workstream": "Technical",
    "owner": "360 Ground",
    "start": "2026-07-21",
    "end": "2026-07-25",
    "duration": 5,
    "status": "To-Do",
    "deliverable": "Environment map v1",
    "checkpoint": "IT validation checkpoint"
  },
  {
    "num": 5,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 2",
    "activity": "High-level AS-IS system context diagram (portfolio view)",
    "workstream": "Technical",
    "owner": "360 Ground",
    "start": "2026-07-22",
    "end": "2026-07-27",
    "duration": 6,
    "status": "To-Do",
    "deliverable": "AS-IS context diagram v1",
    "checkpoint": "Architecture review"
  },
  {
    "num": 6,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 2",
    "activity": "Initial integration discovery (quick scan + SME input)",
    "workstream": "Technical",
    "owner": "360 Ground",
    "start": "2026-07-23",
    "end": "2026-07-28",
    "duration": 6,
    "status": "To-Do",
    "deliverable": "Integration list v1 (draft)",
    "checkpoint": "Integration validation touchpoint"
  },
  {
    "num": 7,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 2",
    "activity": "Initial codebase and technology stack scan",
    "workstream": "Technical",
    "owner": "360 Ground",
    "start": "2026-07-24",
    "end": "2026-07-29",
    "duration": 6,
    "status": "To-Do",
    "deliverable": "Repo inventory; build/run notes v1",
    "checkpoint": "Tech checkpoint"
  },
  {
    "num": 8,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 2-3",
    "activity": "Security and infrastructure quick assessment",
    "workstream": "Technical",
    "owner": "360 Ground",
    "start": "2026-07-27",
    "end": "2026-07-31",
    "duration": 5,
    "status": "To-Do",
    "deliverable": "Security quick-scan findings v1",
    "checkpoint": "Security checkpoint"
  },
  {
    "num": 9,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 3",
    "activity": "Consolidate Application/Technical Inventory Report v1",
    "workstream": "Business/IT",
    "owner": "360 Ground",
    "start": "2026-07-30",
    "end": "2026-08-03",
    "duration": 5,
    "status": "To-Do",
    "deliverable": "Inventory Report v1",
    "checkpoint": "Pre-review circulation"
  },
  {
    "num": 10,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 3",
    "activity": "Readiness & Technical Assessment review session",
    "workstream": "Governance",
    "owner": "Both Teams",
    "start": "2026-08-04",
    "end": "2026-08-04",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Assessment decision pack",
    "checkpoint": "Review approval"
  },
  {
    "num": 11,
    "phase": "Phase 1: Readiness & Technical Assessment",
    "week": "Week 3",
    "activity": "GATE 1 - Readiness & Technical Assessment sign-off",
    "workstream": "Governance",
    "owner": null,
    "start": "2026-08-05",
    "end": "2026-08-05",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Gate 1 checklist signed",
    "checkpoint": "MILESTONE 1 SIGN-OFF"
  },
  {
    "num": 12,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 4",
    "activity": "Workshop planning (scope, stakeholders, calendar)",
    "workstream": "Governance",
    "owner": "BGI Ethiopia",
    "start": "2026-08-05",
    "end": "2026-08-06",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Workshop calendar; invite pack",
    "checkpoint": "Planning approval"
  },
  {
    "num": 13,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 4",
    "activity": "Stakeholder workshop: Core Operations & Materials",
    "workstream": "Business",
    "owner": "Both Teams",
    "start": "2026-08-06",
    "end": "2026-08-07",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Workflow notes v1; pain points v1",
    "checkpoint": "Workshop playback"
  },
  {
    "num": 14,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 4",
    "activity": "Stakeholder workshop: Logistics & Supply Chain",
    "workstream": "Business",
    "owner": "Both Teams",
    "start": "2026-08-07",
    "end": "2026-08-10",
    "duration": 4,
    "status": "To-Do",
    "deliverable": "Workflow notes v1; pain points v1",
    "checkpoint": "Workshop playback"
  },
  {
    "num": 15,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 4",
    "activity": "Stakeholder workshop: Procurement & Sourcing",
    "workstream": "Business",
    "owner": "Both Teams",
    "start": "2026-08-10",
    "end": "2026-08-11",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Workflow notes v1; pain points v1",
    "checkpoint": "Workshop playback"
  },
  {
    "num": 16,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 4-5",
    "activity": "Stakeholder workshop: Quality & Compliance",
    "workstream": "Business",
    "owner": "Both Teams",
    "start": "2026-08-11",
    "end": "2026-08-12",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Workflow notes v1; pain points v1",
    "checkpoint": "Workshop playback"
  },
  {
    "num": 17,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 5",
    "activity": "Stakeholder workshop: Project & Asset Management",
    "workstream": "Business",
    "owner": "Both Teams",
    "start": "2026-08-12",
    "end": "2026-08-13",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Workflow notes v1; pain points v1",
    "checkpoint": "Workshop playback"
  },
  {
    "num": 18,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 5",
    "activity": "Stakeholder workshop: Finance & Reporting",
    "workstream": "Business",
    "owner": "Both Teams",
    "start": "2026-08-13",
    "end": "2026-08-14",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Workflow notes v1; pain points v1",
    "checkpoint": "Workshop playback"
  },
  {
    "num": 19,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 5",
    "activity": "Consolidate workshop findings and pain-points register",
    "workstream": "Business/IT",
    "owner": "360 Ground",
    "start": "2026-08-14",
    "end": "2026-08-17",
    "duration": 4,
    "status": "To-Do",
    "deliverable": "Consolidated pain points register",
    "checkpoint": "Pre-review circulation"
  },
  {
    "num": 20,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 5",
    "activity": "Stakeholder validation and sign-off session",
    "workstream": "Governance",
    "owner": "Both Teams",
    "start": "2026-08-18",
    "end": "2026-08-18",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Workshop decision pack",
    "checkpoint": "Validation approval"
  },
  {
    "num": 21,
    "phase": "Phase 2: Stakeholder Workshops",
    "week": "Week 5",
    "activity": "GATE 2 - Stakeholder Workshops finalization sign-off",
    "workstream": "Governance",
    "owner": null,
    "start": "2026-08-19",
    "end": "2026-08-19",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Gate 2 checklist signed",
    "checkpoint": "MILESTONE 2 SIGN-OFF"
  },
  {
    "num": 22,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 6",
    "activity": "Target architecture workshop (principles, constraints, patterns)",
    "workstream": "Architecture",
    "owner": "Both Teams",
    "start": "2026-08-20",
    "end": "2026-08-21",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Architecture principles draft",
    "checkpoint": "Architecture validation"
  },
  {
    "num": 23,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 6",
    "activity": "Define target system architecture and module boundaries",
    "workstream": "Architecture",
    "owner": "360Ground",
    "start": "2026-08-21",
    "end": "2026-08-25",
    "duration": 5,
    "status": "To-Do",
    "deliverable": "Architecture boundary document v1",
    "checkpoint": "Architecture review"
  },
  {
    "num": 24,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 6-7",
    "activity": "Integration and data strategy definition",
    "workstream": "Architecture",
    "owner": "360Ground",
    "start": "2026-08-24",
    "end": "2026-08-27",
    "duration": 4,
    "status": "To-Do",
    "deliverable": "Integration & data strategy v1",
    "checkpoint": "Strategy sign-off"
  },
  {
    "num": 25,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 7",
    "activity": "Security, observability and deployment model definition",
    "workstream": "Architecture",
    "owner": "360Ground",
    "start": "2026-08-26",
    "end": "2026-08-28",
    "duration": 3,
    "status": "To-Do",
    "deliverable": "Security & Ops model v1",
    "checkpoint": "Security/Ops sign-off"
  },
  {
    "num": 26,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 7",
    "activity": "Module classification workshop (Refactor/Rebuild/Retire/Stabilize)",
    "workstream": "Architecture",
    "owner": "Both Teams",
    "start": "2026-08-28",
    "end": "2026-08-28",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Classification decisions (draft)",
    "checkpoint": "Classification validation"
  },
  {
    "num": 27,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 7",
    "activity": "Finalize module classification matrix (all modules)",
    "workstream": "Architecture",
    "owner": "360Ground",
    "start": "2026-08-31",
    "end": "2026-09-01",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Classification matrix (final)",
    "checkpoint": "Gate readiness check"
  },
  {
    "num": 28,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 7-8",
    "activity": "Build prioritized roadmap and backlog (waves/releases)",
    "workstream": "Planning",
    "owner": "360Ground",
    "start": "2026-09-01",
    "end": "2026-09-03",
    "duration": 3,
    "status": "To-Do",
    "deliverable": "Roadmap v1 (waves/releases)",
    "checkpoint": "Roadmap endorsement"
  },
  {
    "num": 29,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 8",
    "activity": "Estimation workshop (effort, cost, timeline scenarios)",
    "workstream": "Planning",
    "owner": "Both Teams",
    "start": "2026-09-02",
    "end": "2026-09-03",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Estimate assumptions agreed",
    "checkpoint": "Estimate checkpoint"
  },
  {
    "num": 30,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 8",
    "activity": "Finalize risk register and mitigation plan",
    "workstream": "Governance",
    "owner": "360 Ground",
    "start": "2026-09-02",
    "end": "2026-09-03",
    "duration": 2,
    "status": "To-Do",
    "deliverable": "Risk register (final)",
    "checkpoint": "Risk sign-off"
  },
  {
    "num": 31,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 8",
    "activity": "Compile Blueprint & Decision Pack (all deliverables)",
    "workstream": "Governance",
    "owner": "360 Ground",
    "start": "2026-09-04",
    "end": "2026-09-07",
    "duration": 4,
    "status": "To-Do",
    "deliverable": "Full Blueprint deliverables pack",
    "checkpoint": "Pre-final review"
  },
  {
    "num": 32,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 8",
    "activity": "Final presentation and handover",
    "workstream": "Governance",
    "owner": "Both Teams",
    "start": "2026-09-09",
    "end": "2026-09-09",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Final presentation deck; handover notes",
    "checkpoint": "Final acceptance meeting"
  },
  {
    "num": 33,
    "phase": "Phase 3: Blueprint & Closure",
    "week": "Week 8",
    "activity": "GATE 3 - Blueprint endorsement & Stage-1 closure",
    "workstream": "Governance",
    "owner": null,
    "start": "2026-09-10",
    "end": "2026-09-10",
    "duration": 1,
    "status": "To-Do",
    "deliverable": "Closure / handover sign-off record",
    "checkpoint": "MILESTONE 3 - STAGE-1 COMPLETION"
  }
]

// Extracted verbatim from the Milestones sheet.
const KEY_MILESTONES: { phase: string; name: string; targetDate: string; description: string }[] = [
  {
    phase: 'Phase 1: Readiness & Technical Assessment',
    name: 'Milestone 1: Readiness & Technical Assessment Finalized',
    targetDate: '2026-08-05',
    description:
      'Application inventory, AS-IS context diagram, environment map, and initial technical/security findings consolidated and signed off.',
  },
  {
    phase: 'Phase 2: Stakeholder Workshops',
    name: 'Milestone 2: Stakeholder Workshops Finalized',
    targetDate: '2026-08-19',
    description: 'All business workshops complete; workflow notes and pain points validated and signed off with stakeholders.',
  },
  {
    phase: 'Phase 3: Blueprint & Closure',
    name: 'Milestone 3: Blueprint Finalized & Stage-1 Closure/Handover',
    targetDate: '2026-09-10',
    description:
      'Target architecture, module classification, roadmap, estimates and risk register compiled into the Blueprint; final presentation and handover completed.',
  },
]

function ownerParty(owner: string | null): 'CLIENT' | '360GROUND' | 'SHARED' {
  if (!owner) return 'SHARED' // GATE sign-off rows carry no explicit owner in the source sheet
  const normalized = owner.trim().toUpperCase()
  if (normalized === 'BGI ETHIOPIA') return 'CLIENT'
  if (normalized === '360 GROUND' || normalized === '360GROUND') return '360GROUND'
  return 'SHARED' // "Both Teams"
}

async function main() {
  const [pm, actor] = await Promise.all([
    prisma.user.findUnique({ where: { email: PM_EMAIL }, select: { id: true, isActive: true } }),
    prisma.user.findUnique({ where: { email: ACTOR_EMAIL }, select: { id: true, isActive: true } }),
  ])
  if (!pm || !pm.isActive) throw new Error(`Project manager ${PM_EMAIL} not found or inactive`)
  if (!actor || !actor.isActive) throw new Error(`Actor ${ACTOR_EMAIL} not found or inactive`)

  // Phase weight = total planned duration-days within that phase (keeps weight units consistent
  // with per-activity weight below).
  const phaseOrder = [...new Set(SOURCE_ROWS.map((r) => r.phase))]
  const phaseWeight = new Map(phaseOrder.map((phase) => [phase, SOURCE_ROWS.filter((r) => r.phase === phase).reduce((s, r) => s + r.duration, 0)]))
  const milestoneByPhase = new Map(KEY_MILESTONES.map((m) => [m.phase, m]))

  // --- 1. Create the project (PLANNING, unbaselined) -------------------------------------------
  const created = await createProjectWithTemplate(prisma, {
    name: 'BGI Ethiopia - Stage 1 IT Modernization',
    clientName: 'BGI Ethiopia',
    description:
      'Stage 1 IT Modernization Blueprint engagement. Kick-off 16 Jul 2026, Closure/Blueprint Handover 10 Sep 2026 (8 weeks).',
    projectManagerId: pm.id,
    departmentId: null,
    contractValue: null,
    plannedStart: new Date('2026-07-16T00:00:00.000Z'),
    plannedEnd: new Date('2026-09-10T00:00:00.000Z'),
    templateId: null,
    createdById: actor.id,
  })
  console.log(`Created project ${created.code} (${created.id})`)

  await recordActivity({
    entityType: 'PROJECT',
    projectId: created.id,
    action: 'CREATED',
    actorId: actor.id,
    metadata: { code: created.code, name: 'BGI Ethiopia - Stage 1 IT Modernization', clientName: 'BGI Ethiopia', templateId: null, source: 'BGI_Ethiopia_Stage1_8Week_WorkPlan_v1.0.xlsx' },
  })

  // Project has already kicked off (activity #1 is marked Done in the source plan) -> ACTIVE.
  await prisma.project.update({ where: { id: created.id }, data: { status: 'ACTIVE', actualStart: new Date('2026-07-16T00:00:00.000Z') } })

  // --- 2. Build schedule-import records (one milestone per phase = the phase's Gate/Milestone) --
  const records: ScheduleImportRecord[] = SOURCE_ROWS.map((row) => {
    const milestone = milestoneByPhase.get(row.phase)
    const descriptionParts = [
      row.deliverable ? `Deliverable: ${row.deliverable}` : null,
      row.checkpoint ? `Checkpoint: ${row.checkpoint}` : null,
      `Workstream: ${row.workstream} | Source week: ${row.week}`,
    ].filter(Boolean)
    return {
      'Row ID': `A${row.num}`,
      Phase: row.phase,
      'Phase Weight': phaseWeight.get(row.phase),
      Milestone: milestone!.name,
      'Milestone Weight': 100,
      'Key Milestone': 'TRUE',
      Activity: row.activity,
      'Parent Row ID': '',
      Description: descriptionParts.join('\n'),
      'Owner Party': ownerParty(row.owner),
      'Assignee Email': '',
      'Start Date': row.start,
      'End Date': row.end,
      'Activity Weight': row.duration,
      Priority: '',
      Risk: '',
      'Is Blocked': 'FALSE',
      'Blocker Details': '',
      'Predecessor Row IDs': '',
      'Dependency Types': '',
      'Lag Days': '',
    }
  })

  const parsed = parseScheduleRows(records)
  if (parsed.errors.length) {
    console.error('Schedule validation failed:')
    parsed.errors.forEach((e) => console.error(' -', e))
    throw new Error('Aborting: schedule failed validation (see errors above). Project row was still created.')
  }
  console.log(`Parsed ${parsed.rows.length} activities across ${phaseOrder.length} phases, ${KEY_MILESTONES.length} milestones.`)

  // --- 3. Same create transaction as app/api/projects/[id]/schedule-import/route.ts -------------
  const doneRowIds = new Set(SOURCE_ROWS.filter((r) => r.status === 'Done').map((r) => `A${r.num}`))

  await prisma.$transaction(async (tx) => {
    const phaseIds = new Map<string, string>()
    const milestoneIds = new Map<string, string>()
    const activityIds = new Map<string, string>()
    let nextPhasePosition = 0

    for (const row of parsed.rows) {
      if (!phaseIds.has(row.phase)) {
        const phase = await tx.phase.create({
          data: { projectId: created.id, name: row.phase, weight: row.phaseWeight, position: nextPhasePosition++ },
          select: { id: true },
        })
        phaseIds.set(row.phase, phase.id)
      }
      const milestoneKey = `${row.phase} ${row.milestone}`
      if (!milestoneIds.has(milestoneKey)) {
        const milestone = await tx.milestone.create({
          data: {
            phaseId: phaseIds.get(row.phase)!,
            name: row.milestone,
            weight: row.milestoneWeight,
            isKeyMilestone: row.keyMilestone,
            currentDate: new Date(`${milestoneByPhase.get(row.phase)!.targetDate}T00:00:00.000Z`),
            position: [...milestoneIds.keys()].filter((k) => k.startsWith(`${row.phase} `)).length,
          },
          select: { id: true },
        })
        milestoneIds.set(milestoneKey, milestone.id)
      }
      const isDone = doneRowIds.has(row.rowId)
      const activity = await tx.activity.create({
        data: {
          milestoneId: milestoneIds.get(milestoneKey)!,
          position: parsed.rows.filter((c) => c.phase === row.phase && c.milestone === row.milestone).findIndex((c) => c.rowId === row.rowId),
          title: row.activity,
          description: row.description,
          assigneeId: null,
          ownerParty: row.ownerParty,
          currentStart: row.startDate,
          currentEnd: row.endDate,
          weight: row.activityWeight,
          priority: row.priority,
          risk: row.risk,
          isBlocked: row.isBlocked,
          status: isDone ? 'FINISHED' : 'NOT_STARTED',
          percentComplete: isDone ? 100 : 0,
        },
        select: { id: true },
      })
      activityIds.set(row.rowId, activity.id)
    }

    await recalcProjectRollup(tx, created.id)
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: created.id,
    action: 'UPDATED',
    actorId: actor.id,
    metadata: {
      kind: 'SCHEDULE_IMPORTED',
      fileName: 'BGI_Ethiopia_Stage1_ - 8Week_WorkPlan v1.0.xlsx',
      mode: 'append',
      phases: phaseOrder.length,
      milestones: KEY_MILESTONES.length,
      activities: parsed.rows.length,
    },
  })

  console.log(`Import complete. Project id=${created.id} code=${created.code}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
