'use client'

/**
 * Derived dashboard aggregates for /dashboard/reports (scope → metrics →
 * charts → rankings → recommendations). Pure memoised derivations, moved
 * verbatim out of ReportDashboardClient.tsx (2026-09-25) — no behaviour change.
 */
import { useMemo } from 'react'
import type { KrDisplayStatus } from '@/lib/reportDashboard'
import {
  EMPTY_STATUS_COUNTS,
  average,
  clampPct,
  dueState,
  isOpenTodo,
  type DashboardMode,
  type DepartmentRow,
  type OwnerRow,
  type PlanRow,
  type Recommendation,
  type ReportKrWithStatus,
  type ReportObjectiveRow,
  type ReportTodoRow,
} from './report-dashboard-utils'

interface Args {
  currentUserId: string
  dashboardMode: DashboardMode
  krsWithStatus: ReportKrWithStatus[]
  objRows: ReportObjectiveRow[]
  todoRows: ReportTodoRow[]
}

export function useReportDashboardData({
  currentUserId,
  dashboardMode,
  krsWithStatus,
  objRows,
  todoRows,
}: Args) {
  const dashboardScope = useMemo(() => {
    if (dashboardMode === 'employee') {
      const ownedObjectiveIds = new Set(
        objRows.filter((o) => o.ownerId === currentUserId).map((o) => o.id)
      )
      const ownedKrObjectiveIds = new Set(
        krsWithStatus.filter((kr) => kr.ownerId === currentUserId).map((kr) => kr.objectiveId)
      )
      const scopedObjectives = objRows.filter(
        (o) => o.ownerId === currentUserId || ownedKrObjectiveIds.has(o.id)
      )
      const scopedKrs = krsWithStatus.filter(
        (kr) => kr.ownerId === currentUserId || ownedObjectiveIds.has(kr.objectiveId)
      )
      const scopedKrIds = new Set(scopedKrs.map((kr) => kr.id))
      const scopedTodos = todoRows.filter(
        (todo) => todo.assigneeId === currentUserId || scopedKrIds.has(todo.keyResultId)
      )
      return { objectives: scopedObjectives, krs: scopedKrs, todos: scopedTodos }
    }

    return { objectives: objRows, krs: krsWithStatus, todos: todoRows }
  }, [currentUserId, dashboardMode, krsWithStatus, objRows, todoRows])

  const dashboardStatusCounts = useMemo(() => {
    const init: Record<KrDisplayStatus, number> = { ...EMPTY_STATUS_COUNTS }
    for (const kr of dashboardScope.krs) init[kr.displayStatus]++
    return init
  }, [dashboardScope.krs])

  const superMetrics = useMemo(() => {
    const krs = dashboardScope.krs
    const objectives = dashboardScope.objectives
    const todos = dashboardScope.todos
    const completedTodos = todos.filter((t) => t.status === 'COMPLETED').length
    const openTodos = todos.filter((t) => isOpenTodo(t.status)).length
    const overdueTodos = todos.filter((t) => isOpenTodo(t.status) && dueState(t.dueDate) === 'overdue').length
    const soonTodos = todos.filter((t) => isOpenTodo(t.status) && dueState(t.dueDate) === 'soon').length
    const riskKrs = dashboardStatusCounts.at_risk + dashboardStatusCounts.off_track
    return {
      objectiveCount: objectives.length,
      krCount: krs.length,
      initiativeCount: todos.length,
      ownerCount: new Set(krs.map((kr) => kr.ownerId)).size,
      avgObjectiveProgress: average(objectives.map((o) => o.progress)),
      avgKrProgress: average(krs.map((kr) => kr.progress)),
      riskRate: krs.length === 0 ? 0 : Math.round((riskKrs / krs.length) * 100),
      noCheckInCount: krs.filter((kr) => kr.checkInCount === 0).length,
      completedTodos,
      openTodos,
      overdueTodos,
      soonTodos,
      completionRate: todos.length === 0 ? 0 : Math.round((completedTodos / todos.length) * 100),
    }
  }, [dashboardScope, dashboardStatusCounts])

  const statusChartData = useMemo(
    () => [
      { name: 'On track', value: dashboardStatusCounts.on_track, key: 'on_track' as KrDisplayStatus },
      { name: 'At risk', value: dashboardStatusCounts.at_risk, key: 'at_risk' as KrDisplayStatus },
      { name: 'Off track', value: dashboardStatusCounts.off_track, key: 'off_track' as KrDisplayStatus },
      { name: 'Pending', value: dashboardStatusCounts.pending, key: 'pending' as KrDisplayStatus },
      { name: 'Not measurable', value: dashboardStatusCounts.not_measurable, key: 'not_measurable' as KrDisplayStatus },
    ].filter((item) => item.value > 0),
    [dashboardStatusCounts]
  )

  const departmentRows = useMemo<DepartmentRow[]>(() => {
    const map = new Map<string, {
      id: string
      name: string
      krs: ReportKrWithStatus[]
      objectives: ReportObjectiveRow[]
      todos: ReportTodoRow[]
    }>()
    for (const obj of dashboardScope.objectives) {
      const id = obj.departmentId ?? 'unassigned'
      if (!map.has(id)) map.set(id, { id, name: obj.departmentName, krs: [], objectives: [], todos: [] })
      map.get(id)!.objectives.push(obj)
    }
    for (const kr of dashboardScope.krs) {
      const id = kr.departmentId ?? 'unassigned'
      if (!map.has(id)) map.set(id, { id, name: kr.departmentName, krs: [], objectives: [], todos: [] })
      map.get(id)!.krs.push(kr)
    }
    const krDeptById = new Map(dashboardScope.krs.map((kr) => [kr.id, kr.departmentId ?? 'unassigned']))
    for (const todo of dashboardScope.todos) {
      const id = krDeptById.get(todo.keyResultId) ?? 'unassigned'
      if (!map.has(id)) map.set(id, { id, name: 'Unassigned', krs: [], objectives: [], todos: [] })
      map.get(id)!.todos.push(todo)
    }
    return Array.from(map.values())
      .map((row) => {
        const risk = row.krs.filter((kr) => kr.displayStatus === 'at_risk' || kr.displayStatus === 'off_track').length
        return {
          id: row.id,
          name: row.name,
          objectives: row.objectives.length,
          krs: row.krs.length,
          progress: average(row.krs.map((kr) => kr.progress)),
          risk,
          riskRate: row.krs.length === 0 ? 0 : Math.round((risk / row.krs.length) * 100),
          openTodos: row.todos.filter((t) => isOpenTodo(t.status)).length,
          overdue: row.todos.filter((t) => isOpenTodo(t.status) && dueState(t.dueDate) === 'overdue').length,
        }
      })
      .sort((a, b) => b.riskRate - a.riskRate || a.progress - b.progress)
  }, [dashboardScope])

  const ownerRows = useMemo<OwnerRow[]>(() => {
    const map = new Map<string, { id: string; name: string; krs: ReportKrWithStatus[]; todos: ReportTodoRow[] }>()
    for (const kr of dashboardScope.krs) {
      if (!map.has(kr.ownerId)) map.set(kr.ownerId, { id: kr.ownerId, name: kr.ownerName, krs: [], todos: [] })
      map.get(kr.ownerId)!.krs.push(kr)
    }
    for (const todo of dashboardScope.todos) {
      const aid = todo.assigneeId ?? '__unassigned__'
      if (!map.has(aid)) map.set(aid, { id: aid, name: todo.assigneeId ? todo.assigneeName : 'Unassigned', krs: [], todos: [] })
      map.get(aid)!.todos.push(todo)
    }
    return Array.from(map.values())
      .map((row) => {
        const risk = row.krs.filter((kr) => kr.displayStatus === 'at_risk' || kr.displayStatus === 'off_track').length
        const openTodos = row.todos.filter((t) => isOpenTodo(t.status)).length
        return {
          id: row.id,
          name: row.name,
          krs: row.krs.length,
          progress: average(row.krs.map((kr) => kr.progress)),
          risk,
          openTodos,
          overdue: row.todos.filter((t) => isOpenTodo(t.status) && dueState(t.dueDate) === 'overdue').length,
          loadScore: risk * 3 + openTodos,
        }
      })
      .sort((a, b) => b.loadScore - a.loadScore)
  }, [dashboardScope])

  const planRows = useMemo<PlanRow[]>(() => {
    const map = new Map<string, ReportKrWithStatus[]>()
    for (const kr of dashboardScope.krs) {
      if (!map.has(kr.timeframeName)) map.set(kr.timeframeName, [])
      map.get(kr.timeframeName)!.push(kr)
    }
    return Array.from(map.entries()).map(([name, krs]) => ({
      name,
      progress: average(krs.map((kr) => kr.progress)),
      krs: krs.length,
      risk: krs.filter((kr) => kr.displayStatus === 'at_risk' || kr.displayStatus === 'off_track').length,
    }))
  }, [dashboardScope.krs])

  const progressBands = useMemo(() => {
    const bands = [
      { name: '0-24%', min: 0, max: 25 },
      { name: '25-49%', min: 25, max: 50 },
      { name: '50-74%', min: 50, max: 75 },
      { name: '75-100%', min: 75, max: 101 },
    ]
    return bands.map((band) => ({
      name: band.name,
      objectives: dashboardScope.objectives.filter((o) => o.progress >= band.min && o.progress < band.max).length,
      krs: dashboardScope.krs.filter((kr) => kr.progress >= band.min && kr.progress < band.max).length,
    }))
  }, [dashboardScope])

  const burnupData = useMemo(() => {
    const sortedPlans = [...planRows].sort((a, b) => a.name.localeCompare(b.name))
    if (sortedPlans.length > 0) {
      return sortedPlans.map((row, index) => ({
        name: row.name,
        progress: row.progress,
        risk: row.risk,
        target: Math.min(100, Math.round(((index + 1) / sortedPlans.length) * 100)),
      }))
    }
    return [{ name: 'Current', progress: superMetrics.avgKrProgress, risk: dashboardStatusCounts.at_risk + dashboardStatusCounts.off_track, target: 75 }]
  }, [dashboardStatusCounts, planRows, superMetrics.avgKrProgress])

  const recommendations = useMemo<Recommendation[]>(() => {
    if (dashboardMode === 'employee') {
      const ownedKrs = dashboardScope.krs.filter((kr) => kr.ownerId === currentUserId)
      const openAssignedTodos = dashboardScope.todos.filter((t) => t.assigneeId === currentUserId && isOpenTodo(t.status))
      const items: Recommendation[] = []
      const offTrack = ownedKrs.find((kr) => kr.displayStatus === 'off_track')
      const atRisk = ownedKrs.find((kr) => kr.displayStatus === 'at_risk')
      const noCheckIn = ownedKrs.find((kr) => kr.checkInCount === 0)
      const overdue = openAssignedTodos.find((t) => dueState(t.dueDate) === 'overdue')
      const upcoming = openAssignedTodos.find((t) => dueState(t.dueDate) === 'soon')
      const lowProgress = ownedKrs.filter((kr) => kr.progress < 50).sort((a, b) => a.progress - b.progress)[0]
      if (offTrack) items.push({ title: 'Recover the most critical KR', detail: `${offTrack.title} is off track at ${clampPct(offTrack.progress)}%. Add a check-in and split the next action into initiatives.`, tone: 'off_track', href: `/dashboard/key-results/${offTrack.id}` })
      if (atRisk) items.push({ title: 'Protect an at-risk outcome', detail: `${atRisk.title} is at risk. Review confidence blockers before the next update.`, tone: 'at_risk', href: `/dashboard/key-results/${atRisk.id}` })
      if (overdue) items.push({ title: 'Clear overdue work', detail: `${overdue.title} is overdue and linked to ${overdue.krTitle}.`, tone: 'off_track', href: `/dashboard/key-results/${overdue.keyResultId}` })
      if (upcoming) items.push({ title: 'Prepare this week', detail: `${upcoming.title} is due soon. Finish or renegotiate the due date.`, tone: 'pending', href: `/dashboard/key-results/${upcoming.keyResultId}` })
      if (noCheckIn) items.push({ title: 'Create a first signal', detail: `${noCheckIn.title} has no check-ins yet. A quick update will improve visibility.`, tone: 'pending', href: `/dashboard/key-results/${noCheckIn.id}` })
      if (lowProgress) items.push({ title: 'Move the lowest-progress KR', detail: `${lowProgress.title} is at ${clampPct(lowProgress.progress)}%. Pick one initiative that changes the metric this week.`, tone: 'at_risk', href: `/dashboard/key-results/${lowProgress.id}` })
      if (items.length === 0) {
        items.push({ title: 'Maintain execution rhythm', detail: 'Your visible scope is healthy. Keep check-ins fresh and close small initiatives before adding more work.', tone: 'on_track' })
      }
      return items.slice(0, 5)
    }

    const items: Recommendation[] = []
    const weakestDepartment = departmentRows[0]
    const overloadedOwner = ownerRows[0]
    const noKrObjective = dashboardScope.objectives.find((o) => o.keyResultCount === 0)
    const staleKr = dashboardScope.krs.find((kr) => kr.checkInCount === 0)
    const overdueDepartment = departmentRows.find((row) => row.overdue > 0)
    if (weakestDepartment && weakestDepartment.risk > 0) items.push({ title: 'Prioritize department recovery', detail: `${weakestDepartment.name} has ${weakestDepartment.risk} risky KRs and ${weakestDepartment.riskRate}% risk concentration.`, tone: weakestDepartment.riskRate >= 50 ? 'off_track' : 'at_risk' })
    if (overloadedOwner && overloadedOwner.loadScore > 0) items.push({ title: 'Rebalance owner load', detail: `${overloadedOwner.name} carries ${overloadedOwner.risk} risky KRs and ${overloadedOwner.openTodos} open initiatives.`, tone: overloadedOwner.risk > 0 ? 'at_risk' : 'pending' })
    if (noKrObjective) items.push({ title: 'Add measurable KRs', detail: `${noKrObjective.title} has no key results, so progress quality is weak.`, tone: 'pending', href: `/dashboard/objectives/${noKrObjective.id}` })
    if (staleKr) items.push({ title: 'Close visibility gaps', detail: `${staleKr.title} has no check-ins. Ask the owner for a current signal.`, tone: 'pending', href: `/dashboard/key-results/${staleKr.id}` })
    if (overdueDepartment) items.push({ title: 'Unblock overdue initiatives', detail: `${overdueDepartment.name} has ${overdueDepartment.overdue} overdue initiatives tied to active outcomes.`, tone: 'off_track' })
    if (items.length === 0) {
      items.push({ title: 'Scale what is working', detail: 'No critical dashboard risks are visible in the current scope. Review high-progress teams for practices to replicate.', tone: 'on_track' })
    }
    return items.slice(0, 5)
  }, [currentUserId, dashboardMode, dashboardScope, departmentRows, ownerRows])

  return {
    dashboardScope,
    superMetrics,
    statusChartData,
    departmentRows,
    ownerRows,
    planRows,
    progressBands,
    burnupData,
    recommendations,
  }
}
