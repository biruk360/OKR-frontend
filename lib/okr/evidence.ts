import type { DbLike } from '@/lib/objectiveProgress'

type CheckIn = { asOfDate: Date; value: number; confidence: string }

function summarizeCheckIns(checkIns: CheckIn[]) {
  const ordered = [...checkIns].sort((a, b) => a.asOfDate.getTime() - b.asOfDate.getTime())
  let longestGapDays = 0
  let confidenceFlips = 0
  for (let index = 1; index < ordered.length; index += 1) {
    longestGapDays = Math.max(
      longestGapDays,
      Math.floor((ordered[index].asOfDate.getTime() - ordered[index - 1].asOfDate.getTime()) / 86_400_000),
    )
    if (ordered[index].confidence !== ordered[index - 1].confidence) confidenceFlips += 1
  }
  return {
    checkInCount: ordered.length,
    longestGapDays,
    hasLongGap: longestGapDays > 14,
    progressCurve: ordered.map((row) => ({
      date: row.asOfDate.toISOString(),
      value: row.value,
      confidence: row.confidence,
    })),
    confidenceStart: ordered[0]?.confidence ?? null,
    confidenceEnd: ordered.at(-1)?.confidence ?? null,
    confidenceFlips,
  }
}

async function summarizeSnapshots(tx: DbLike, entityType: string, entityIds: string[]) {
  if (entityIds.length === 0) return { snapshotCount: 0, daysAtRisk: 0 }
  const rows = await tx.confidenceSnapshot.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { confidence: true },
  })
  return {
    snapshotCount: rows.length,
    daysAtRisk: rows.filter((row) => row.confidence !== 'ON_TRACK').length * 14,
  }
}

function summarizeTodos(todos: Array<{ status: string }>) {
  const completed = todos.filter((todo) => todo.status === 'COMPLETED').length
  return {
    linkedTodoCount: todos.length,
    completedTodoCount: completed,
    todoCompletionRate: todos.length > 0 ? Math.round((completed / todos.length) * 100) : null,
  }
}

function summarizeScrum(links: Array<{ context: string }>) {
  return {
    scrumMentionCount: links.length,
    blockerMentions: links.filter((link) => link.context === 'BLOCKER').length,
    winMentions: links.filter((link) => link.context === 'WIN').length,
  }
}

export async function buildKeyResultEvidence(tx: DbLike, keyResultId: string) {
  const keyResult = await tx.keyResult.findUniqueOrThrow({
    where: { id: keyResultId },
    select: {
      checkIns: { select: { asOfDate: true, value: true, confidence: true } },
      todos: { select: { status: true } },
      scrumLinks: { select: { context: true } },
    },
  })
  return {
    generatedAt: new Date().toISOString(),
    ...summarizeCheckIns(keyResult.checkIns),
    ...(await summarizeSnapshots(tx, 'KEY_RESULT', [keyResultId])),
    ...summarizeTodos(keyResult.todos),
    ...summarizeScrum(keyResult.scrumLinks),
  }
}

export async function buildObjectiveEvidence(tx: DbLike, objectiveId: string) {
  const objective = await tx.objective.findUniqueOrThrow({
    where: { id: objectiveId },
    select: {
      todos: { select: { status: true } },
      scrumLinks: { select: { context: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          checkIns: { select: { asOfDate: true, value: true, confidence: true } },
          todos: { select: { status: true } },
          scrumLinks: { select: { context: true } },
        },
      },
    },
  })
  const checkIns = objective.keyResults.flatMap((kr) => kr.checkIns)
  const todos = [...objective.todos, ...objective.keyResults.flatMap((kr) => kr.todos)]
  const scrumLinks = [...objective.scrumLinks, ...objective.keyResults.flatMap((kr) => kr.scrumLinks)]
  return {
    generatedAt: new Date().toISOString(),
    keyResultCount: objective.keyResults.length,
    ...summarizeCheckIns(checkIns),
    ...(await summarizeSnapshots(tx, 'KEY_RESULT', objective.keyResults.map((kr) => kr.id))),
    ...summarizeTodos(todos),
    ...summarizeScrum(scrumLinks),
  }
}
