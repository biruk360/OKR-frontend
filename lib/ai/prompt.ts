/**
 * Provider-agnostic prompt builder for AI sprint planning.
 *
 * Takes a ContextBundle + the deterministic math allocations + the carryover
 * candidates with their server-forced rules, and produces a (system, user) pair
 * that any provider can feed into its structured-output endpoint. The output
 * MUST match the Zod schema in lib/ai/sprint-plan-schema.ts.
 */

import type { ContextBundle } from './context-bundler'
import type { AllocationRow } from './sprint-math'
import type { CarryoverCandidate } from './carryover'

export interface PromptInput {
  bundle: ContextBundle
  allocations: AllocationRow[]
  carryoverCandidates: Array<{
    candidate: CarryoverCandidate
    todo: {
      id: string
      title: string
      description?: string | null
      status: string
      priority?: string
      dueDate: Date | null
      progressValue: number | null
      carryoverCount: number
    }
  }>
  sprintStart: Date
  sprintEnd: Date
  durationDays: number
}

export interface PromptOutput {
  system: string
  user: string
}

const SYSTEM_PROMPT = `You are an expert OKR coach helping plan a 2-week sprint for a single employee.

You will receive:
- The user's active objectives and key results (KRs).
- A deterministic per-KR allocation table (linearShare, velocityFactor, plannedDelta, carryoverDelta) computed by the system. You MUST respect plannedDelta as the new-task target — generated tasks for a KR should sum to between 0.5x and 1.5x its plannedDelta. Saturated KRs (plannedDelta=0) should NOT receive new tasks.
- Incomplete todos from the prior sprint, each with a possible "forcedDisposition" set by the system. When forcedDisposition is set, you MUST use that exact disposition for that todo. Otherwise pick from KEEP / SPLIT / RESCHEDULE / DESCOPE / ESCALATE per the rules below.
- A list of "disallowed" dispositions per todo. You MUST NOT use any disposition listed in the disallowed array for that todo.

Carryover disposition rules:
- KEEP: carry the todo as-is into the new sprint. Use only when it is still relevant and the user can finish it.
- SPLIT: break a too-big todo into 2–4 smaller children. Provide splitInto with titles + progressValue + dueDate per child summing to the original's progressValue.
- RESCHEDULE: defer to backlog (sprintId becomes null). Use when blocked by dependencies and not worth running this sprint.
- DESCOPE: cancel the todo. Use when the work is no longer needed.
- ESCALATE: keep the work running but flag for management attention. Use for repeated carryovers or when assignee has been blocked. Optionally suggest a different assignee id.

Output a JSON object matching the sprint_plan schema. Each proposedTodo:
- title: imperative, specific (e.g. "Generate 12 leads via LinkedIn outreach (week 1)").
- progressValue: numeric, in the same unit as the parent KR.
- dueDate: ISO YYYY-MM-DD within the sprint window.
- ambitionLevel: COMMITTED for must-do, STRETCH for ambitious extras.
- For off-track or high-weight KRs, prioritize new tasks first.
- When the sprint has heavy carryover (sprintDebt=true), bias new tasks toward STRETCH.

Write a concise markdown rationale (200–600 words) covering: what you carried over and why, how you allocated effort across KRs, and any notable trade-offs.`

export function buildPrompt(input: PromptInput): PromptOutput {
  const { bundle, allocations, carryoverCandidates, sprintStart, sprintEnd, durationDays } = input

  const objectivesBlock = bundle.objectives
    .map(
      (o) =>
        `- [${o.id}] ${o.title} (${o.level}, owner=${o.ownerName}, weight=${o.weight}, progress=${Math.round(o.progress)}%, status=${o.goalStatus})`
    )
    .join('\n')

  const krsBlock = bundle.keyResults
    .map((k) => {
      const alloc = allocations.find((a) => a.keyResultId === k.id)
      const allocStr = alloc
        ? `linearShare=${alloc.linearShare.toFixed(2)}, velocity=${alloc.velocityFactor.toFixed(2)}, carryoverDelta=${alloc.carryoverDelta.toFixed(2)}, plannedDelta=${alloc.plannedDelta.toFixed(2)}, weightShare=${(alloc.weightShare * 100).toFixed(0)}%, timeBudget=${(alloc.timeBudgetPct * 100).toFixed(0)}%, saturated=${alloc.saturated}`
        : 'no allocation'
      return `- [${k.id}] (objective=${k.objectiveId}) "${k.title}" — ${k.currentValue}/${k.targetValue} ${k.unit}, conf=${k.confidence}, weight=${k.weight}; ALLOC: ${allocStr}`
    })
    .join('\n')

  const priorBlock = bundle.priorSprints.length
    ? bundle.priorSprints
        .map(
          (s) =>
            `- "${s.name}" state=${s.state} planned=${s.totals.planned} completed=${s.totals.completed} pending=${s.totals.pending}`
        )
        .join('\n')
    : '- (none — this is a first sprint)'

  const carryoverBlock = carryoverCandidates.length
    ? carryoverCandidates
        .map(({ candidate, todo }) => {
          const forced = candidate.forcedDisposition
            ? ` FORCED=${candidate.forcedDisposition} (reason=${candidate.forcedReason})`
            : ''
          const disallowed = candidate.disallowed.length ? ` DISALLOWED=[${candidate.disallowed.join(',')}]` : ''
          const stale = candidate.staleDueDate ? ' STALE_DUE_DATE' : ''
          const due = todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : 'none'
          const pv = todo.progressValue ?? 0
          return `- [${todo.id}] "${todo.title}" status=${todo.status} carryoverCount=${todo.carryoverCount} dueDate=${due} progressValue=${pv}${forced}${disallowed}${stale}`
        })
        .join('\n')
    : '- (none)'

  const tfBlock = bundle.timeframe
    ? `${bundle.timeframe.name} (${bundle.timeframe.startDate.toISOString().slice(0, 10)} → ${bundle.timeframe.endDate.toISOString().slice(0, 10)})`
    : 'unknown'

  const modeBlock =
    bundle.mode === 'MANUAL'
      ? `MANUAL — the user pre-selected the OKRs above. Do NOT propose work outside this scope.`
      : `AUTO — you may select any of the above OKRs to plan around.`

  const user = `# Sprint planning request

**Subject:** ${bundle.subject.name} (${bundle.subject.email}, role=${bundle.subject.role})
**Sprint window:** ${sprintStart.toISOString().slice(0, 10)} → ${sprintEnd.toISOString().slice(0, 10)} (${durationDays} days)
**Active timeframe:** ${tfBlock}
**Mode:** ${modeBlock}

## Objectives (in scope)
${objectivesBlock || '(none)'}

## Key Results (in scope, with deterministic allocations)
${krsBlock || '(none)'}

## Prior sprints
${priorBlock}

## Carryover candidates (incomplete from prior sprint)
${carryoverBlock}

## Instructions
- Produce a sprint_plan JSON with proposedTodos, carryoverDispositions, prevSprintReview (or null), rationale (markdown), and sprintDebt boolean.
- For every carryover candidate listed above, include exactly one entry in carryoverDispositions whose todoId matches.
- Honor every FORCED= disposition exactly. Never use a DISALLOWED= disposition.
- For each KR with plannedDelta>0, generate 1–4 proposedTodos whose progressValue sums to between 0.5x and 1.5x plannedDelta.
- For each KR with saturated=true, generate ZERO new proposedTodos for that KR.
- Set sprintDebt=true when carryover effort consumes the bulk of the sprint capacity.`

  return { system: SYSTEM_PROMPT, user }
}
