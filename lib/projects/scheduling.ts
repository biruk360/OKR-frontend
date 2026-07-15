export type ScheduleDependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface ScheduleTask {
  id: string
  currentStart: Date | null
  currentEnd: Date | null
}

export interface ScheduleDependency {
  predecessorId: string
  successorId: string
  type: ScheduleDependencyType
  lagDays?: number
}

export interface ScheduleShift {
  activityId: string
  currentStart: Date | null
  currentEnd: Date | null
}

export interface CriticalPathResult {
  taskIds: string[]
  durationDays: number
}

const MS_DAY = 24 * 60 * 60 * 1000

export function addCalendarDays(date: Date | null, days: number): Date | null {
  if (!date) return null
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function taskDurationDays(task: ScheduleTask): number {
  if (!task.currentStart || !task.currentEnd) return 1
  return Math.max(1, Math.round((startOfDay(task.currentEnd).getTime() - startOfDay(task.currentStart).getTime()) / MS_DAY) + 1)
}

/** Throws when the existing graph contains a cycle. */
export function assertNoDependencyCycle(dependencies: readonly Pick<ScheduleDependency, 'predecessorId' | 'successorId'>[]): void {
  const graph = adjacency(dependencies)
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('This would create a circular dependency.')
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of graph.get(id) ?? []) visit(next)
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of graph.keys()) visit(id)
}

export function wouldCreateDependencyCycle(
  dependencies: readonly Pick<ScheduleDependency, 'predecessorId' | 'successorId'>[],
  candidate: Pick<ScheduleDependency, 'predecessorId' | 'successorId'>
): boolean {
  try {
    assertNoDependencyCycle([...dependencies, candidate])
    return false
  } catch {
    return true
  }
}

/**
 * Shift the changed task's transitive successors by the same day delta.
 * D3 persistence applies the primary task change separately; this returns only
 * the cascaded successors, ordered predecessor-before-successor for stable writes.
 */
export function shiftSuccessors(
  tasks: readonly ScheduleTask[],
  dependencies: readonly ScheduleDependency[],
  changedTaskId: string,
  deltaDays: number
): ScheduleShift[] {
  if (deltaDays === 0) return []
  assertNoDependencyCycle(dependencies)

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const graph = adjacency(dependencies)
  const out: ScheduleShift[] = []
  const queued = [...(graph.get(changedTaskId) ?? [])]
  const seen = new Set<string>()

  while (queued.length) {
    const id = queued.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const task = byId.get(id)
    if (task) {
      out.push({
        activityId: id,
        currentStart: addCalendarDays(task.currentStart, deltaDays),
        currentEnd: addCalendarDays(task.currentEnd, deltaDays),
      })
    }
    queued.push(...(graph.get(id) ?? []))
  }

  return out
}

/**
 * CPM-style critical path over the current dependency graph.
 * Duration is based on dated task spans; undated tasks count as 1 day.
 */
export function criticalPath(tasks: readonly ScheduleTask[], dependencies: readonly ScheduleDependency[]): CriticalPathResult {
  assertNoDependencyCycle(dependencies)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const ids = tasks.map((t) => t.id)
  const incoming = new Map<string, string[]>()
  const outgoing = adjacency(dependencies)
  for (const id of ids) incoming.set(id, [])
  for (const d of dependencies) {
    if (!byId.has(d.predecessorId) || !byId.has(d.successorId)) continue
    incoming.get(d.successorId)?.push(d.predecessorId)
  }

  const memo = new Map<string, { duration: number; path: string[] }>()
  const score = (id: string): { duration: number; path: string[] } => {
    const cached = memo.get(id)
    if (cached) return cached
    const task = byId.get(id)
    if (!task) return { duration: 0, path: [] }
    const base = taskDurationDays(task)
    let bestPrev: { duration: number; path: string[] } = { duration: 0, path: [] }
    for (const pred of incoming.get(id) ?? []) {
      const s = score(pred)
      if (s.duration > bestPrev.duration) bestPrev = s
    }
    const result = { duration: bestPrev.duration + base, path: [...bestPrev.path, id] }
    memo.set(id, result)
    return result
  }

  let best: { duration: number; path: string[] } = { duration: 0, path: [] }
  for (const id of ids) {
    const s = score(id)
    if (s.duration > best.duration || (s.duration === best.duration && (outgoing.get(id)?.length ?? 0) === 0)) best = s
  }
  return { taskIds: best.path, durationDays: best.duration }
}

function adjacency(dependencies: readonly Pick<ScheduleDependency, 'predecessorId' | 'successorId'>[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const d of dependencies) {
    if (!graph.has(d.predecessorId)) graph.set(d.predecessorId, [])
    if (!graph.has(d.successorId)) graph.set(d.successorId, [])
    graph.get(d.predecessorId)!.push(d.successorId)
  }
  return graph
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}
