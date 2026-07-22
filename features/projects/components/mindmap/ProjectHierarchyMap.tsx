'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { ChevronsDownUp, ChevronsUpDown, GitBranch, Maximize2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityNode, ProjectDetail } from '../../hooks/useProject'
import { ProjectMapNode, type ProjectMapNodeData, type ProjectMapNodeKind } from './ProjectMapNode'

const nodeTypes = { projectMapNode: ProjectMapNode }
const LEVEL_Y = [32, 210, 392, 574, 742]
const NODE_GAP = 34
const MIN_SPAN: Record<ProjectMapNodeKind, number> = { project: 320, phase: 320, milestone: 300, activity: 280 }
const POSITION_KEY_PREFIX = 'projects.mindmap.positions.v1'

type SavedPositions = Record<string, { x: number; y: number }>

interface ProjectHierarchyMapProps {
  project: ProjectDetail
  visibleActivityIds: string[]
  isFiltered: boolean
  onOpenActivity: (activityId: string) => void
}

interface TreeNode {
  id: string
  kind: ProjectMapNodeKind
  title: string
  eyebrow: string
  progress: number
  detail: string
  status?: string
  ownerParty?: string
  children: TreeNode[]
}

function ProjectHierarchyMapInner({ project, visibleActivityIds, isFiltered, onOpenActivity }: ProjectHierarchyMapProps) {
  const filterKey = visibleActivityIds.join('|')
  const visibleIds = useMemo(() => new Set(visibleActivityIds), [visibleActivityIds])
  const allExpandableIds = useMemo(() => collectExpandableIds(project), [project])
  const defaultExpanded = useMemo(() => new Set([
    `project:${project.id}`,
    ...project.phases.map((phase) => `phase:${phase.id}`),
  ]), [project.id, project.phases])
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded)
  const [savedPositions, setSavedPositions] = useState<SavedPositions>({})
  const [showDependencies, setShowDependencies] = useState(true)
  const flowRef = useRef<ReactFlowInstance | null>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`${POSITION_KEY_PREFIX}.${project.id}`)
      setSavedPositions(saved ? JSON.parse(saved) as SavedPositions : {})
    } catch {
      setSavedPositions({})
    }
  }, [project.id])

  useEffect(() => {
    setExpanded(isFiltered ? expandedPathsForFilter(project, new Set(visibleActivityIds)) : defaultExpanded)
  }, [defaultExpanded, filterKey, isFiltered, project])

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const tree = useMemo(() => buildProjectTree(project, visibleIds, isFiltered), [isFiltered, project, visibleIds])
  const autoGraph = useMemo(() => layoutTree(tree, expanded, toggle, project.dependencies), [expanded, project.dependencies, toggle, tree])
  const graph = useMemo(() => ({
    nodes: autoGraph.nodes.map((node) => ({ ...node, position: savedPositions[node.id] ?? node.position })),
    edges: showDependencies ? autoGraph.edges : autoGraph.edges.filter((edge) => !edge.id.startsWith('dependency:')),
  }), [autoGraph, savedPositions, showDependencies])
  const [nodes, setNodes, onNodesChange] = useNodesState<ProjectMapNodeData>(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setEdges, setNodes])

  const fit = useCallback(() => {
    requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.16, maxZoom: 1.05, duration: 250 }))
  }, [])

  const saveNodePosition = useCallback((node: Node<ProjectMapNodeData>) => {
    setSavedPositions((current) => {
      const next = { ...current, [node.id]: node.position }
      window.localStorage.setItem(`${POSITION_KEY_PREFIX}.${project.id}`, JSON.stringify(next))
      return next
    })
  }, [project.id])

  const resetLayout = useCallback(() => {
    window.localStorage.removeItem(`${POSITION_KEY_PREFIX}.${project.id}`)
    setSavedPositions({})
    setNodes(autoGraph.nodes)
    fit()
  }, [autoGraph.nodes, fit, project.id, setNodes])

  return (
    <div className="h-[calc(100vh-165px)] min-h-[520px] w-full bg-[#f4f4f5]">
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_event, node) => saveNodePosition(node)}
        nodeTypes={nodeTypes}
        onInit={(instance) => { flowRef.current = instance }}
        onNodeDoubleClick={(_event, node) => {
          if (node.id.startsWith('activity:')) onOpenActivity(node.id.slice('activity:'.length))
        }}
        fitView
        fitViewOptions={{ padding: 0.16, maxZoom: 1.05 }}
        minZoom={0.08}
        maxZoom={1.75}
        panOnScroll
        selectionOnDrag={false}
        panOnDrag
        multiSelectionKeyCode="Meta"
        nodesDraggable
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} className="!shadow-md" />
        <Background color="#d4d4d8" gap={20} size={1} />
        <Panel position="top-left" className="flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-md">
          <button type="button" onClick={() => { setExpanded(new Set(allExpandableIds)); fit() }} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronsUpDown className="size-3.5" /> Expand all
          </button>
          <button type="button" onClick={() => { setExpanded(new Set([`project:${project.id}`])); fit() }} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronsDownUp className="size-3.5" /> Collapse
          </button>
          <button type="button" onClick={fit} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fit project map">
            <Maximize2 className="size-3.5" />
          </button>
          <button type="button" onClick={resetLayout} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Reset project map layout" title="Reset saved layout">
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowDependencies((current) => !current)}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium', showDependencies ? 'bg-blue-50 text-blue-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            aria-pressed={showDependencies}
          >
            <GitBranch className="size-3.5" /> Dependencies
          </button>
        </Panel>
        <Panel position="top-right" className="rounded-md border border-border bg-card/95 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
          Drag cards to save their position · double-click a task to open
        </Panel>
      </ReactFlow>
    </div>
  )
}

export function ProjectHierarchyMap(props: ProjectHierarchyMapProps) {
  return <ReactFlowProvider><ProjectHierarchyMapInner {...props} /></ReactFlowProvider>
}

function buildProjectTree(project: ProjectDetail, visibleIds: Set<string>, filtered: boolean): TreeNode {
  return {
    id: `project:${project.id}`,
    kind: 'project',
    title: project.name,
    eyebrow: `${project.code} · Project`,
    progress: project.percentComplete,
    detail: `${project.clientName} · ${project.phases.length} phases`,
    status: project.status,
    children: project.phases.map((phase) => ({
      id: `phase:${phase.id}`,
      kind: 'phase' as const,
      title: phase.name,
      eyebrow: 'Phase',
      progress: phase.percentComplete,
      detail: `${phase.milestones.length} sections`,
      status: phase.status,
      children: phase.milestones.map((milestone) => {
        const activities = visibleActivities(milestone.activities, visibleIds, filtered)
        return {
          id: `milestone:${milestone.id}`,
          kind: 'milestone' as const,
          title: milestone.name,
          eyebrow: milestone.isKeyMilestone ? 'Key milestone' : 'Section',
          progress: milestone.percentComplete,
          detail: `${activities.length} visible tasks`,
          status: milestone.status,
          children: topLevelActivities(activities).map((activity) => activityTree(activity, activities)),
        }
      }),
    })),
  }
}

function activityTree(activity: ActivityNode, visible: ActivityNode[]): TreeNode {
  const subtasks = visible.filter((candidate) => candidate.parentActivityId === activity.id)
  return {
    id: `activity:${activity.id}`,
    kind: 'activity',
    title: activity.title,
    eyebrow: activity.parentActivityId ? 'Subtask' : activity.isMilestone ? 'Task milestone' : 'Task',
    progress: activity.percentComplete,
    detail: [activity.priority ? `${activity.priority.toLowerCase()} priority` : null, activity.risk ? `${activity.risk.toLowerCase()} risk` : null].filter(Boolean).join(' · ') || 'Scheduled activity',
    status: activity.status,
    ownerParty: activity.ownerParty === '360GROUND' ? '360Ground' : activity.ownerParty === 'CLIENT' ? 'Client' : 'Shared',
    children: subtasks.map((subtask) => activityTree(subtask, visible)),
  }
}

function visibleActivities(activities: ActivityNode[], visibleIds: Set<string>, filtered: boolean): ActivityNode[] {
  if (!filtered) return activities
  const parentsOfVisible = new Set(activities.filter((activity) => visibleIds.has(activity.id) && activity.parentActivityId).map((activity) => activity.parentActivityId))
  return activities.filter((activity) => visibleIds.has(activity.id) || parentsOfVisible.has(activity.id))
}

function topLevelActivities(activities: ActivityNode[]): ActivityNode[] {
  return activities.filter((activity) => !activity.parentActivityId)
}

function collectExpandableIds(project: ProjectDetail): string[] {
  const ids = [`project:${project.id}`]
  for (const phase of project.phases) {
    ids.push(`phase:${phase.id}`)
    for (const milestone of phase.milestones) {
      if (milestone.activities.length) ids.push(`milestone:${milestone.id}`)
      for (const activity of milestone.activities) {
        if (milestone.activities.some((candidate) => candidate.parentActivityId === activity.id)) ids.push(`activity:${activity.id}`)
      }
    }
  }
  return ids
}

function expandedPathsForFilter(project: ProjectDetail, visibleIds: Set<string>): Set<string> {
  const ids = new Set<string>([`project:${project.id}`])
  for (const phase of project.phases) {
    for (const milestone of phase.milestones) {
      const matched = milestone.activities.filter((activity) => visibleIds.has(activity.id))
      if (!matched.length) continue
      ids.add(`phase:${phase.id}`)
      ids.add(`milestone:${milestone.id}`)
      for (const activity of matched) if (activity.parentActivityId) ids.add(`activity:${activity.parentActivityId}`)
    }
  }
  return ids
}

function layoutTree(root: TreeNode, expanded: Set<string>, onToggle: (id: string) => void, dependencies: ProjectDetail['dependencies']): { nodes: Node<ProjectMapNodeData>[]; edges: Edge[] } {
  const nodes: Node<ProjectMapNodeData>[] = []
  const edges: Edge[] = []
  const visibleNodeIds = new Set<string>()

  const visibleChildren = (item: TreeNode) => expanded.has(item.id) ? item.children : []
  const span = (item: TreeNode): number => {
    const children = visibleChildren(item)
    if (!children.length) return MIN_SPAN[item.kind]
    return Math.max(MIN_SPAN[item.kind], children.reduce((total, child) => total + span(child), 0) + NODE_GAP * (children.length - 1))
  }

  const place = (item: TreeNode, left: number, depth: number) => {
    const itemSpan = span(item)
    const width = MIN_SPAN[item.kind] - 20
    const x = left + itemSpan / 2 - width / 2
    nodes.push({
      id: item.id,
      type: 'projectMapNode',
      position: { x, y: LEVEL_Y[Math.min(depth, LEVEL_Y.length - 1)] },
      data: {
        kind: item.kind,
        title: item.title,
        eyebrow: item.eyebrow,
        status: item.status,
        progress: item.progress,
        detail: item.detail,
        ownerParty: item.ownerParty,
        childCount: item.children.length,
        hasChildren: item.children.length > 0,
        isExpanded: expanded.has(item.id),
        onToggle,
      },
    })
    visibleNodeIds.add(item.id)

    let childLeft = left
    for (const child of visibleChildren(item)) {
      const childSpan = span(child)
      place(child, childLeft, depth + 1)
      edges.push({ id: `hierarchy:${item.id}:${child.id}`, source: item.id, target: child.id, type: 'smoothstep', style: { stroke: '#94a3b8', strokeWidth: 1.4 } })
      childLeft += childSpan + NODE_GAP
    }
  }

  place(root, 0, 0)

  for (const dependency of dependencies) {
    const source = `activity:${dependency.predecessorId}`
    const target = `activity:${dependency.successorId}`
    if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) continue
    edges.push({
      id: `dependency:${dependency.id}`,
      source,
      target,
      type: 'smoothstep',
      label: dependency.type,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#2563eb' },
      style: { stroke: '#2563eb', strokeWidth: 1.7, strokeDasharray: '5 4' },
      labelStyle: { fontSize: 9, fill: '#1d4ed8', fontWeight: 600 },
    })
  }

  return { nodes, edges }
}
