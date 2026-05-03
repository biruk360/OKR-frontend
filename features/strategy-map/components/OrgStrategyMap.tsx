'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background, Controls, ReactFlowProvider,
  type Node, type Edge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { CompanyNode } from './nodes/CompanyNode'
import { DepartmentNode } from './nodes/DepartmentNode'
import { PersonNode } from './nodes/PersonNode'
import { MapObjectiveNode } from './nodes/MapObjectiveNode'
import type { MapFilters, MapMode } from '../types'

const NODE_TYPES = {
  company:   CompanyNode,
  department: DepartmentNode,
  person:    PersonNode,
  objective: MapObjectiveNode,
}

interface OrgTreeApi {
  company: { name: string; ceo: { id: string; name: string | null; email: string } | null; objectives?: any[] }
  departments: Array<{
    id: string; name: string
    head: { id: string; name: string | null; email: string } | null
    members: Array<{
      membershipId: string; role: string; isPrimary: boolean
      user: { id: string; name: string | null; email: string; role: string }
      objectives?: Array<{ id: string; title: string; level: string; progress: number; confidence?: string; parentObjectiveId?: string | null }>
    }>
    objectiveCount: number
    objectives?: Array<{ id: string; title: string; level: string; progress: number; confidence?: string; parentObjectiveId?: string | null }>
  }>
  unassignedUsers: Array<{ id: string; name: string | null; email: string; role: string }>
}

const COLS = {
  COMPANY_X: 600,
  DEPT_GAP_X: 320,
  PERSON_GAP_X: 200,
  OBJ_GAP_X: 240,
}
const ROWS = {
  COMPANY_Y: 0,
  COMPANY_OBJ_Y: 130,
  DEPT_Y: 280,
  DEPT_OBJ_Y: 410,
  PERSON_Y: 560,
  PERSON_OBJ_Y: 660,
}

export function OrgStrategyMap({
  mode, timeframeId, filters,
}: { mode: MapMode; timeframeId: string; filters: MapFilters }) {
  const [tree, setTree] = useState<OrgTreeApi | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = `/api/org/tree?withObjectives=1${timeframeId ? `&timeframeId=${timeframeId}` : ''}`
    fetch(url)
      .then((r) => r.json())
      .then((j) => setTree(j?.success ? j.data : null))
      .catch(() => setTree(null))
      .finally(() => setLoading(false))
  }, [timeframeId])

  const { nodes, edges } = useMemo(() => buildGraph(tree, mode, filters), [tree, mode, filters])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }
  if (!tree) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Failed to load org tree.
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.0 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </ReactFlowProvider>
  )
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(tree: OrgTreeApi | null, mode: MapMode, filters: MapFilters):
  { nodes: Node[]; edges: Edge[] } {
  if (!tree) return { nodes: [], edges: [] }

  const nodes: Node[] = []
  const edges: Edge[] = []
  const objectiveNodeIds = new Set<string>()

  // Root: Company
  const totalCompanyOkrs = tree.company.objectives?.length ?? 0
  const companyAvg = avgProgress(tree.company.objectives ?? [])
  nodes.push({
    id: 'company',
    type: 'company',
    position: { x: COLS.COMPANY_X, y: ROWS.COMPANY_Y },
    data: {
      name: tree.company.name,
      ceoName: tree.company.ceo?.name ?? null,
      companyOkrCount: totalCompanyOkrs,
      avgProgress: companyAvg,
    },
  })

  // Company-level OKRs (rendered horizontally below the company node)
  if (!filters.showOrgOnly && tree.company.objectives) {
    tree.company.objectives.forEach((o, i) => {
      const id = `obj:${o.id}`
      nodes.push({
        id, type: 'objective',
        position: { x: COLS.COMPANY_X - 100 + (i - tree.company.objectives!.length / 2) * COLS.OBJ_GAP_X, y: ROWS.COMPANY_OBJ_Y },
        data: { title: o.title, level: o.level, progress: Math.round(o.progress ?? 0), confidence: o.confidence },
      })
      objectiveNodeIds.add(o.id)
      edges.push({
        id: `e:company-${o.id}`, source: 'company', target: id,
        style: { stroke: '#94a3b8', strokeDasharray: '4 3' }, // dashed = ownership
      })
    })
  }

  // Departments
  const visibleDepts = tree.departments.filter((d) =>
    filters.showEmptyDepartments || d.members.length > 0 || (d.objectives?.length ?? 0) > 0
  )

  const totalDeptWidth = Math.max(visibleDepts.length, 1) * COLS.DEPT_GAP_X
  const startDeptX = COLS.COMPANY_X - totalDeptWidth / 2 + COLS.DEPT_GAP_X / 2

  visibleDepts.forEach((d, di) => {
    const dx = startDeptX + di * COLS.DEPT_GAP_X
    const memberCount = d.members.length
    const deptOkrs = d.objectives ?? []
    const personObjs = d.members.flatMap((m) => m.objectives ?? [])
    const allDeptOkrs = [...deptOkrs, ...personObjs]
    const deptAvg = avgProgress(allDeptOkrs)

    const deptNodeId = `dept:${d.id}`
    nodes.push({
      id: deptNodeId,
      type: 'department',
      position: { x: dx, y: ROWS.DEPT_Y },
      data: {
        name: d.name,
        headName: d.head?.name ?? null,
        memberCount,
        okrCount: allDeptOkrs.length,
        avgProgress: deptAvg,
      },
    })
    edges.push({
      id: `e:company-${deptNodeId}`,
      source: 'company',
      target: deptNodeId,
      style: { stroke: '#94a3b8', strokeDasharray: '4 3' },
    })

    // Department OKRs sit just below the department node
    if (!filters.showOrgOnly && deptOkrs.length > 0) {
      deptOkrs.forEach((o, i) => {
        const id = `obj:${o.id}`
        const startX = dx - ((deptOkrs.length - 1) / 2) * COLS.OBJ_GAP_X
        nodes.push({
          id, type: 'objective',
          position: { x: startX + i * COLS.OBJ_GAP_X, y: ROWS.DEPT_OBJ_Y },
          data: { title: o.title, level: o.level, progress: Math.round(o.progress ?? 0), confidence: o.confidence },
        })
        objectiveNodeIds.add(o.id)
        edges.push({
          id: `e:${deptNodeId}-${o.id}`,
          source: deptNodeId, target: id,
          style: { stroke: '#94a3b8', strokeDasharray: '4 3' },
        })
      })
    }

    // People in this department
    const sortedMembers = [...d.members].sort((a, b) =>
      (a.role === 'HEAD' ? -1 : 0) - (b.role === 'HEAD' ? -1 : 0)
    )
    const personStartX = dx - ((sortedMembers.length - 1) / 2) * COLS.PERSON_GAP_X
    sortedMembers.forEach((m, i) => {
      const px = personStartX + i * COLS.PERSON_GAP_X
      const personNodeId = `person:${m.user.id}`
      const personOkrs = (m.objectives ?? []).filter((o) =>
        filters.showIndividualOkrs || o.level !== 'INDIVIDUAL'
      )
      nodes.push({
        id: personNodeId,
        type: 'person',
        position: { x: px, y: ROWS.PERSON_Y },
        data: {
          name: m.user.name ?? m.user.email,
          email: m.user.email,
          role: m.user.role,
          isHead: m.role === 'HEAD',
          okrCount: personOkrs.length,
        },
      })
      edges.push({
        id: `e:${deptNodeId}-${personNodeId}`,
        source: deptNodeId, target: personNodeId,
        style: { stroke: '#cbd5e1', strokeDasharray: '2 4' }, // dotted = reporting
      })

      // Person OKRs (only when not org-only mode)
      if (!filters.showOrgOnly && personOkrs.length > 0) {
        personOkrs.forEach((o, oi) => {
          const id = `obj:${o.id}`
          if (objectiveNodeIds.has(o.id)) return // already placed
          const ox = px + (oi - (personOkrs.length - 1) / 2) * 110
          nodes.push({
            id, type: 'objective',
            position: { x: ox - 90, y: ROWS.PERSON_OBJ_Y + (oi % 2 === 0 ? 0 : 90) },
            data: { title: o.title, level: o.level, progress: Math.round(o.progress ?? 0), confidence: o.confidence },
          })
          objectiveNodeIds.add(o.id)
          edges.push({
            id: `e:${personNodeId}-${o.id}`,
            source: personNodeId, target: id,
            style: { stroke: '#94a3b8', strokeDasharray: '4 3' },
          })
        })
      }
    })
  })

  // Combined mode: overlay strategic alignment (parent/child) edges as solid lines
  if (mode === 'combined') {
    const allObjectives = [
      ...(tree.company.objectives ?? []),
      ...tree.departments.flatMap((d) => [...(d.objectives ?? []), ...d.members.flatMap((m) => m.objectives ?? [])]),
    ]
    for (const o of allObjectives) {
      if (!o.parentObjectiveId) continue
      if (!objectiveNodeIds.has(o.id) || !objectiveNodeIds.has(o.parentObjectiveId)) continue
      edges.push({
        id: `align:${o.parentObjectiveId}-${o.id}`,
        source: `obj:${o.parentObjectiveId}`,
        target: `obj:${o.id}`,
        style: { stroke: '#2563eb', strokeWidth: 1.5 }, // solid = strategic alignment
        animated: true,
      })
    }
  }

  return { nodes, edges }
}

function avgProgress(objs: Array<{ progress?: number }>): number {
  if (objs.length === 0) return 0
  return Math.round(objs.reduce((s, o) => s + (o.progress ?? 0), 0) / objs.length)
}
