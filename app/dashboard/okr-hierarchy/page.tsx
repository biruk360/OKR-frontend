import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import OkrHierarchyGrid from './OkrHierarchyGrid'

export const dynamic = 'force-dynamic'

export default async function OkrHierarchyPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const objectives = await prisma.objective.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          title: true,
          progress: true,
          confidence: true,
          unit: true,
          targetValue: true,
          currentValue: true,
          owner: { select: { name: true } },
          todos: {
            select: { id: true, title: true, status: true },
          },
        },
      },
    },
  })

  type Node = {
    path: string[]
    id: string
    kind: 'OBJ' | 'KR' | 'INIT'
    title: string
    progress: number | null
    status: string | null
    owner: string | null
    href: string | null
    parentObjectiveId?: string | null
  }

  // Walk objectives and flatten into tree-data rows (AG Grid tree uses a path array).
  const objectiveTitleById = new Map(objectives.map((o) => [o.id, o.title]))
  function buildPath(o: (typeof objectives)[number]): string[] {
    const chain: string[] = []
    let cursor: string | null | undefined = o.id
    const safety = new Set<string>()
    while (cursor && !safety.has(cursor)) {
      safety.add(cursor)
      const title = objectiveTitleById.get(cursor)
      if (!title) break
      chain.unshift(title)
      cursor = objectives.find((x) => x.id === cursor)?.parentObjectiveId ?? null
    }
    return chain
  }

  const rows: Node[] = []
  for (const o of objectives) {
    const path = buildPath(o)
    rows.push({
      path,
      id: `obj:${o.id}`,
      kind: 'OBJ',
      title: o.title,
      progress: o.progress,
      status: o.goalStatus,
      owner: o.owner.name,
      href: `/dashboard/objectives/${o.id}`,
      parentObjectiveId: o.parentObjectiveId,
    })
    for (const kr of o.keyResults) {
      rows.push({
        path: [...path, kr.title],
        id: `kr:${kr.id}`,
        kind: 'KR',
        title: kr.title,
        progress: kr.progress,
        status: kr.confidence,
        owner: kr.owner?.name ?? null,
        href: `/dashboard/key-results/${kr.id}`,
      })
      for (const t of kr.todos) {
        rows.push({
          path: [...path, kr.title, t.title],
          id: `init:${t.id}`,
          kind: 'INIT',
          title: t.title,
          progress: null,
          status: t.status,
          owner: null,
          href: null,
        })
      }
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">OKR hierarchy</h1>
        <p className="text-sm text-gray-500">
          Full tree of objectives, key results, and initiatives. Click any row to open details in
          the side drawer.
        </p>
      </header>
      <OkrHierarchyGrid rows={rows} />
    </div>
  )
}
