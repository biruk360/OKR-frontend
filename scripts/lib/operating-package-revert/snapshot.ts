/**
 * Operating-package revert — snapshot of the user-generated activity on the doomed rows, written
 * before anything is deleted, so it can be re-entered after the re-import. Every list carries the
 * workbook key (externalRef) and title of the item it belonged to, the person, and the date.
 */
import type { Collected, Db } from './collect'
import { chunk } from './plan'

const IN_CHUNK = 5000

/** findMany over a large id list in chunks. */
async function inChunks<T>(ids: readonly string[], fn: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (const part of chunk(ids, IN_CHUNK)) out.push(...(await fn(part)))
  return out
}

const person = { select: { name: true, email: true } } as const
const who = (u: { name: string | null; email: string } | null | undefined) => (u ? `${u.name ?? ''} <${u.email}>`.trim() : null)

export async function buildSnapshot(db: Db, c: Collected, meta: { generatedAt: Date; mode: string }) {
  const d = (t: string) => c.doomed[t] ?? []
  const objectiveIds = d('objectives')
  const krIds = d('key_results')
  const todoIds = d('initiatives')

  const krInfo = new Map(
    (await db.keyResult.findMany({ where: { id: { in: krIds } }, select: { id: true, externalRef: true, title: true } })).map((k) => [k.id, k]),
  )
  const objInfo = new Map(
    (await db.objective.findMany({ where: { id: { in: objectiveIds } }, select: { id: true, externalRef: true, title: true } })).map((o) => [o.id, o]),
  )
  const krRef = (id: string | null) => (id ? krInfo.get(id) ?? null : null)
  const objRef = (id: string | null) => (id ? objInfo.get(id) ?? null : null)

  // ── OKR ──
  const krCheckIns = (
    await db.keyResultCheckIn.findMany({
      where: { keyResultId: { in: krIds } },
      include: { createdBy: person },
      orderBy: [{ keyResultId: 'asc' }, { asOfDate: 'asc' }],
    })
  ).map((ci) => ({
    id: ci.id,
    keyResultId: ci.keyResultId,
    krExternalRef: krRef(ci.keyResultId)?.externalRef ?? null,
    krTitle: krRef(ci.keyResultId)?.title ?? null,
    asOfDate: ci.asOfDate,
    value: ci.value,
    confidence: ci.confidence,
    confidenceScore: ci.confidenceScore,
    analysis: ci.analysis,
    author: who(ci.createdBy),
    createdAt: ci.createdAt,
  }))

  const krRows = await db.keyResult.findMany({
    where: { id: { in: krIds } },
    include: { owner: person, objective: { select: { externalRef: true, title: true } } },
  })
  const krsWithProgress = krRows
    .filter((k) => k.currentValue !== k.startValue || k.progress !== 0 || k.confidence !== 'ON_TRACK')
    .map((k) => ({
      id: k.id,
      externalRef: k.externalRef,
      title: k.title,
      objective: k.objective.externalRef ?? k.objective.title,
      startValue: k.startValue,
      currentValue: k.currentValue,
      targetValue: k.targetValue,
      unit: k.unit,
      progress: k.progress,
      confidence: k.confidence,
      owner: who(k.owner),
      updatedAt: k.updatedAt,
    }))
  const userCreatedKeyResults = krRows
    .filter((k) => !k.externalRef)
    .map((k) => ({
      id: k.id,
      title: k.title,
      description: k.description,
      objective: k.objective.externalRef ?? k.objective.title,
      startValue: k.startValue,
      currentValue: k.currentValue,
      targetValue: k.targetValue,
      unit: k.unit,
      owner: who(k.owner),
      createdAt: k.createdAt,
    }))

  const objectiveRows = await db.objective.findMany({ where: { id: { in: objectiveIds } }, include: { owner: person } })
  const objectivesChanged = objectiveRows
    .filter((o) => o.progress !== 0 || o.confidence !== 50 || o.goalStatus !== 'ON_TRACK' || o.closureStatus !== 'OPEN' || !o.externalRef)
    .map((o) => ({
      id: o.id,
      externalRef: o.externalRef,
      title: o.title,
      level: o.level,
      progress: o.progress,
      confidence: o.confidence,
      goalStatus: o.goalStatus,
      closureStatus: o.closureStatus,
      owner: who(o.owner),
      userCreated: !o.externalRef,
    }))

  const checkpoints = (
    await db.keyResultCheckpoint.findMany({
      where: { keyResultId: { in: krIds }, OR: [{ actualValue: { not: null } }, { status: { not: 'PENDING' } }, { reviewedAt: { not: null } }] },
    })
  ).map((cp) => ({
    id: cp.id,
    krExternalRef: krRef(cp.keyResultId)?.externalRef ?? null,
    label: cp.label,
    targetText: cp.targetText,
    actualValue: cp.actualValue,
    status: cp.status,
    reviewedAt: cp.reviewedAt,
    reviewedById: cp.reviewedById,
  }))

  const retrospectives = await db.okrRetrospective.findMany({ where: { OR: [{ objectiveId: { in: objectiveIds } }, { keyResultId: { in: krIds } }] } })

  const comments = (
    await db.comment.findMany({
      where: { OR: [{ objectiveId: { in: objectiveIds } }, { keyResultId: { in: krIds } }] },
      include: { author: person },
      orderBy: { createdAt: 'asc' },
    })
  ).map((cm) => ({
    id: cm.id,
    on: cm.keyResultId ? 'KEY_RESULT' : 'OBJECTIVE',
    externalRef: cm.keyResultId ? krRef(cm.keyResultId)?.externalRef ?? null : objRef(cm.objectiveId)?.externalRef ?? null,
    itemTitle: cm.keyResultId ? krRef(cm.keyResultId)?.title ?? null : objRef(cm.objectiveId)?.title ?? null,
    parentId: cm.parentId,
    author: who(cm.author),
    content: cm.content,
    createdAt: cm.createdAt,
  }))

  const risks = await db.risk.findMany({ where: { OR: [{ objectiveId: { in: objectiveIds } }, { keyResultId: { in: krIds } }] }, include: { reporter: person } })

  // ── To-dos ──
  type TodoInfo = {
    id: string
    kind: string
    externalRef: string | null
    title: string
    status: string
    dueDate: Date | null
    completedAt: Date | null
    keyResultId: string | null
    dutyId: string | null
    sprintId: string | null
    recurrenceParentId: string | null
    assignee: { name: string | null; email: string } | null
    duty: { title: string; externalRef: string | null } | null
    sprint: { name: string } | null
    updatedAt: Date
  }
  const todos: TodoInfo[] = await inChunks(todoIds, (part) =>
    db.todo.findMany({
      where: { id: { in: part } },
      select: {
        id: true,
        kind: true,
        externalRef: true,
        title: true,
        status: true,
        dueDate: true,
        completedAt: true,
        keyResultId: true,
        dutyId: true,
        sprintId: true,
        recurrenceParentId: true,
        updatedAt: true,
        assignee: person,
        duty: { select: { title: true, externalRef: true } },
        sprint: { select: { name: true } },
      },
    }),
  )
  const todoById = new Map(todos.map((t) => [t.id, t]))
  const todoLabel = (id: string) => {
    const t = todoById.get(id)
    return t ? { todoId: id, kind: t.kind, externalRef: t.externalRef, title: t.title, krExternalRef: krRef(t.keyResultId)?.externalRef ?? null } : { todoId: id }
  }
  const todosWithStatus = todos
    .filter((t) => !t.dutyId && t.status !== 'PENDING')
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      externalRef: t.externalRef,
      title: t.title,
      status: t.status,
      completedAt: t.completedAt,
      dueDate: t.dueDate,
      krExternalRef: krRef(t.keyResultId)?.externalRef ?? null,
      assignee: who(t.assignee),
      updatedAt: t.updatedAt,
    }))
  const dutyOccurrences = todos
    .filter((t) => t.dutyId && t.status !== 'PENDING')
    .map((t) => ({
      id: t.id,
      duty: t.duty?.title ?? null,
      dutyExternalRef: t.duty?.externalRef ?? null,
      isHead: !t.recurrenceParentId,
      status: t.status,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      assignee: who(t.assignee),
    }))
  const todosOnSprints = todos
    .filter((t) => t.sprintId)
    .map((t) => ({ id: t.id, externalRef: t.externalRef, title: t.title, kind: t.kind, status: t.status, sprint: t.sprint?.name ?? t.sprintId }))

  const todoComments = (
    await inChunks(todoIds, (part) => db.todoComment.findMany({ where: { todoId: { in: part } }, include: { author: person }, orderBy: { createdAt: 'asc' } }))
  ).map((tc) => ({ id: tc.id, ...todoLabel(tc.todoId), parentId: tc.parentId, author: who(tc.author), content: tc.content, commentAttachments: tc.commentAttachments, createdAt: tc.createdAt }))
  const todoAttachments = (
    await inChunks(todoIds, (part) => db.todoAttachment.findMany({ where: { todoId: { in: part } }, include: { uploadedBy: person } }))
  ).map((a) => ({ id: a.id, ...todoLabel(a.todoId), filename: a.filename, url: a.url, mimeType: a.mimeType, size: a.size, uploadedBy: who(a.uploadedBy), createdAt: a.createdAt }))
  const commentAttachments = await db.commentAttachment.findMany({ where: { id: { in: c.polymorphic.commentAttachments } }, include: { uploadedBy: person } })
  const checklists = (
    await inChunks(todoIds, (part) => db.todoChecklist.findMany({ where: { todoId: { in: part } }, include: { items: { orderBy: { position: 'asc' } } } }))
  ).map((cl) => ({ id: cl.id, ...todoLabel(cl.todoId), title: cl.title, items: cl.items.map((i) => ({ title: i.title, completed: i.completed, completedAt: i.completedAt })) }))
  const initiativeUpdates = (
    await inChunks(todoIds, (part) => db.initiativeUpdate.findMany({ where: { initiativeId: { in: part } }, include: { author: person }, orderBy: { createdAt: 'asc' } }))
  ).map((u) => ({ id: u.id, ...todoLabel(u.initiativeId), updateDate: u.updateDate, status: u.status, content: u.content, blockers: u.blockers, author: who(u.author) }))

  const scrumLinks = (
    await db.scrumUpdateLink.findMany({
      where: { OR: [{ objectiveId: { in: objectiveIds } }, { keyResultId: { in: krIds } }, { todoId: { in: todoIds.slice(0, 30000) } }] },
      include: { update: { select: { id: true, scrumDate: true, userId: true } } },
    })
  ).map((l) => ({
    id: l.id,
    linkType: l.linkType,
    context: l.context,
    progressNote: l.progressNote,
    scrumUpdateId: l.updateId,
    scrumDate: l.update.scrumDate,
    authorUserId: l.update.userId,
    createdById: l.createdById,
    target: l.todoId ? todoLabel(l.todoId) : l.keyResultId ? { krExternalRef: krRef(l.keyResultId)?.externalRef, title: krRef(l.keyResultId)?.title } : { objExternalRef: objRef(l.objectiveId)?.externalRef, title: objRef(l.objectiveId)?.title },
  }))

  // ── Package ──
  const kpis = await db.kpi.findMany({ where: { id: { in: d('kpis') } }, include: { owner: person } })
  const kpiById = new Map(kpis.map((k) => [k.id, k]))
  const kpiReadings = (
    await db.kpiReading.findMany({ where: { kpiId: { in: d('kpis') } }, include: { enteredBy: person }, orderBy: [{ kpiId: 'asc' }, { periodStart: 'asc' }] })
  ).map((r) => ({
    id: r.id,
    kpiExternalRef: kpiById.get(r.kpiId)?.externalRef ?? null,
    kpiName: kpiById.get(r.kpiId)?.name ?? null,
    kpiOwner: who(kpiById.get(r.kpiId)?.owner),
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    value: r.value,
    valueText: r.valueText,
    rag: r.rag,
    ragOverridden: r.ragOverridden,
    note: r.note,
    source: r.source,
    enteredBy: who(r.enteredBy),
    createdAt: r.createdAt,
  }))
  const packages = await db.operatingPackage.findMany({ where: { id: { in: d('operating_packages') } }, include: { user: person } })
  const reviews = (
    await db.packageItemReview.findMany({
      where: { OR: [{ packageId: { in: d('operating_packages') } }, { id: { in: c.polymorphic.packageItemReviews } }] },
      include: { reviewer: person },
    })
  ).map((r) => ({ id: r.id, packageId: r.packageId, entityType: r.entityType, entityId: r.entityId, verdict: r.verdict, comment: r.comment, resolvedAt: r.resolvedAt, resolution: r.resolution, reviewer: who(r.reviewer), createdAt: r.createdAt, updatedAt: r.updatedAt }))
  const duties = await db.recurringDuty.findMany({ where: { id: { in: d('recurring_duties') } }, include: { owner: person } })
  const roleDefinitions = await db.roleDefinition.findMany({ where: { id: { in: d('role_definitions') } }, include: { user: person } })
  const devItems = await db.developmentItem.findMany({ where: { id: { in: d('development_items') } }, include: { owner: person } })
  const deps = await db.workDependency.findMany({ where: { id: { in: d('work_dependencies') } } })
  const decisions = await db.decision.findMany({ where: { id: { in: d('decisions') } } })

  const metricSourceMappings = await db.metricSourceMapping.findMany({
    where: { OR: [{ keyResultId: { in: krIds } }, { kpiId: { in: d('kpis') } }] },
    include: { employee: person, criterion: { select: { id: true, title: true, code: true } } },
  })

  // ActivityLog rows deleted by FK cascade that were not written by the importer.
  const activityIds = d('activity_logs')
  const activityLogs = (
    await inChunks(activityIds, (part) => db.activityLog.findMany({ where: { id: { in: part } }, include: { actor: person }, orderBy: { createdAt: 'asc' } }))
  )
    .filter((a) => (a.metadata as { source?: unknown } | null)?.source !== 'import')
    .map((a) => ({ id: a.id, entityType: a.entityType, action: a.action, actor: who(a.actor), objectiveId: a.objectiveId, keyResultId: a.keyResultId, todoId: a.todoId, changes: a.changes, metadata: a.metadata, createdAt: a.createdAt }))

  const notifications = await db.notification.findMany({
    where: { id: { in: c.polymorphic.notifications } },
    select: { id: true, eventKey: true, type: true, title: true, isRead: true, createdAt: true, metadata: true, user: person },
  })

  return {
    meta: { source: 'revert-operating-package-import', generatedAt: meta.generatedAt, mode: meta.mode, timeframe: c.timeframe },
    userGenerated: {
      krCheckIns,
      krsWithProgress,
      userCreatedKeyResults,
      objectivesChangedOrUserCreated: objectivesChanged,
      checkpointsReviewed: checkpoints,
      retrospectives,
      comments,
      risks,
      todosWithStatus,
      dutyOccurrences,
      todosOnSprints,
      todoComments,
      todoAttachments,
      commentAttachments,
      checklists,
      initiativeUpdates,
      scrumLinks,
      kpiReadings,
      packageReviews: reviews,
      packagesNotDraft: packages
        .filter((p) => p.status !== 'DRAFT' || p.submittedAt || p.approvedAt)
        .map((p) => ({ id: p.id, user: who(p.user), status: p.status, submittedAt: p.submittedAt, approvedAt: p.approvedAt, approvedById: p.approvedById })),
      roleDefinitionsNotDraft: roleDefinitions
        .filter((r) => r.status !== 'DRAFT' || r.approvedAt)
        .map((r) => ({ id: r.id, user: who(r.user), status: r.status, approvedAt: r.approvedAt, approvedById: r.approvedById })),
      dutiesChanged: duties
        .filter((x) => x.status !== 'ACTIVE' || x.retiredAt || !x.externalRef)
        .map((x) => ({ id: x.id, externalRef: x.externalRef, title: x.title, owner: who(x.owner), status: x.status, retiredAt: x.retiredAt, userCreated: !x.externalRef })),
      kpisUserCreated: kpis.filter((k) => !k.externalRef).map((k) => ({ ...k, owner: who(k.owner) })),
      kpisChanged: kpis
        .filter((k) => k.status !== 'ACTIVE' || k.externalSource || k.coverageOfKpiId)
        .map((k) => ({ id: k.id, externalRef: k.externalRef, name: k.name, status: k.status, externalSource: k.externalSource, coverageOfKpiId: k.coverageOfKpiId })),
      developmentItemsWithProgress: devItems
        .filter((x) => x.hoursLogged > 0 || x.completedAt || x.evidenceNote || x.dropReason || x.status !== 'NOT_STARTED' || !x.externalRef)
        .map((x) => ({ id: x.id, externalRef: x.externalRef, title: x.title, owner: who(x.owner), status: x.status, hoursLogged: x.hoursLogged, completedAt: x.completedAt, evidenceNote: x.evidenceNote, dropReason: x.dropReason, userCreated: !x.externalRef })),
      decisionsDecided: decisions
        .filter((x) => x.status !== 'OPEN' || x.decidedAt || !x.externalRef)
        .map((x) => ({ id: x.id, externalRef: x.externalRef, title: x.title, status: x.status, decisionText: x.decisionText, decidedAt: x.decidedAt, decidedById: x.decidedById, userCreated: !x.externalRef })),
      dependenciesChanged: deps
        .filter((x) => x.status !== 'OPEN' || x.doneAt || x.deliveryTodoId || !x.externalRef)
        .map((x) => ({ id: x.id, externalRef: x.externalRef, title: x.title, status: x.status, doneAt: x.doneAt, deliveryTodoId: x.deliveryTodoId, userCreated: !x.externalRef })),
      metricSourceMappings: metricSourceMappings.map((m) => ({ id: m.id, employee: who(m.employee), criterion: m.criterion.code ? `${m.criterion.code} ${m.criterion.title}` : m.criterion.title, sourceType: m.sourceType, krExternalRef: krRef(m.keyResultId)?.externalRef ?? null, kpiExternalRef: m.kpiId ? kpiById.get(m.kpiId)?.externalRef ?? null : null })),
      nonImportActivityLogs: activityLogs,
      notifications: notifications.map((n) => ({ id: n.id, eventKey: n.eventKey ?? n.type, title: n.title, isRead: n.isRead, user: who(n.user), metadata: n.metadata, createdAt: n.createdAt })),
    },
    preservedTodos: c.preservedTodos,
    manualObjectives: c.manualObjectives,
    manifest: {
      deletedByTable: c.doomed,
      todoReasons: c.todoReasons,
      polymorphicDeletes: c.polymorphic,
      fkDetached: c.fkDetached,
      columnDetaches: c.columnDetaches,
    },
  }
}

export type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>

/** One line per non-empty user-generated list, for the console. */
export function snapshotHighlights(s: Snapshot): string[] {
  return Object.entries(s.userGenerated)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
}
