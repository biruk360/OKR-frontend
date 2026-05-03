'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import ObjectiveNode from './ObjectiveNode'
import AddSubPlanNode from './AddSubPlanNode'
import CompanyRootNode from './CompanyRootNode'
import type { PlanMetrics } from './ObjectiveNode'
import { cn } from '@/lib/utils'
import { AddAlignedObjectiveModal } from './AddAlignedObjectiveModal'

const STRATEGY_ROOT_ID = '__strategy_company_root__'
const H_SPACING = 520
const TOP_START_X = 80
const ROOT_Y = 28
const TIER2_Y = 188
const CARD_CENTER_X = 180
const VERTICAL_GAP = 420

interface OKRHierarchyProps {
  objectives: any[]
  currentTimeframeId: string
  timeframeName?: string
  /** Workspace name from branding settings (top “Company” node). */
  workspaceName?: string
  layout?: 'default' | 'fullscreen'
}

const nodeTypes = {
  objectiveNode: ObjectiveNode,
  addSubPlanNode: AddSubPlanNode,
  companyRoot: CompanyRootNode,
}

function avgNcsFromKeyResults(krs: any[]): number {
  const weight: Record<string, number> = { ON_TRACK: 78, AT_RISK: 52, OFF_TRACK: 28 }
  if (!krs.length) return 0
  const sum = krs.reduce((s, kr) => s + (weight[kr.confidence as string] ?? 55), 0)
  return Math.round(sum / krs.length)
}

function computePlanMetrics(obj: any): PlanMetrics {
  const krs = obj.keyResults ?? []
  const avgKrProgress = krs.length
    ? Math.round(krs.reduce((s: number, kr: any) => s + (kr.progress ?? 0), 0) / krs.length)
    : Math.round(obj.progress ?? 0)

  let initiativeDone = 0
  let initiativeTotal = 0
  for (const kr of krs) {
    const todos = kr.todos ?? []
    initiativeTotal += todos.length
    initiativeDone += todos.filter((t: any) => t.status === 'COMPLETED').length
  }

  return {
    avgKrProgress,
    initiativeDone,
    initiativeTotal,
    ncsScore: avgNcsFromKeyResults(krs),
  }
}

function mapKeyResultsForNode(obj: any) {
  return (obj.keyResults ?? []).map((kr: any) => ({
    id: kr.id,
    title: kr.title,
    progress: kr.progress ?? 0,
    currentValue: kr.currentValue ?? 0,
    targetValue: kr.targetValue ?? 0,
    unit: kr.unit ?? '%',
    confidence: kr.confidence ?? 'ON_TRACK',
  }))
}

const dashedEdge = {
  type: 'smoothstep' as const,
  animated: false,
  style: {
    stroke: '#9ca3af',
    strokeWidth: 1.5,
    strokeDasharray: '6 4',
  },
}

function rootObjectivesForGraph(objs: any[]) {
  const roots = objs.filter((o) => !o.parentObjectiveId)
  if (roots.length > 0) return roots
  return objs
}

/** Tier under company: prefer company-level root plans, else all graph roots. */
function getTopLevelPlans(objs: any[]) {
  const companyRoots = objs.filter((o) => o.level === 'COMPANY' && !o.parentObjectiveId)
  if (companyRoots.length > 0) return companyRoots
  return rootObjectivesForGraph(objs)
}

type AlignmentHint = { parentTitle: string; parentLevel?: string }

const OKRHierarchy = ({
  objectives,
  currentTimeframeId,
  timeframeName,
  workspaceName = 'Company',
  layout = 'default',
}: OKRHierarchyProps) => {
  const router = useRouter()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const seedFingerprintRef = useRef<string | null>(null)
  const [alignTarget, setAlignTarget] = useState<{
    parentObjectiveId: string; parentTitle?: string; parentLevel?: string
  } | null>(null)

  const openAlignModal = useCallback((args: {
    parentObjectiveId: string; parentTitle?: string; parentLevel?: string
  }) => setAlignTarget(args), [])

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const noopToggleKr = useCallback(() => {}, [])

  const buildHierarchy = useCallback(
    (objs: any[]) => {
      const newNodes: Node[] = []
      const newEdges: Edge[] = []

      const pushObjectiveNode = (obj: any, x: number, y: number, alignmentHint?: AlignmentHint) => {
        const krs = mapKeyResultsForNode(obj)
        newNodes.push({
          id: obj.id,
          type: 'objectiveNode',
          position: { x, y },
          data: {
            ...obj,
            goalStatus: obj.goalStatus ?? 'ON_TRACK',
            keyResultsCount: krs.length,
            childObjectivesCount:
              obj._count?.childObjectives ?? (obj.childObjectives ?? []).length,
            isExpanded: expandedNodes.has(obj.id),
            isKRExpanded: true,
            onToggleExpand: handleToggleExpand,
            onToggleKR: noopToggleKr,
            keyResults: krs,
            metrics: computePlanMetrics(obj),
            timeframeName,
            alignmentHint,
          },
        })
      }

      const topPlans = getTopLevelPlans(objs)
      const n = topPlans.length

      const tier2LeftXs = n === 0 ? [] : topPlans.map((_, i) => TOP_START_X + i * H_SPACING)

      let rootX = 320
      if (n > 0) {
        const firstCenter = tier2LeftXs[0] + CARD_CENTER_X
        const lastCenter = tier2LeftXs[n - 1] + CARD_CENTER_X
        const mid = (firstCenter + lastCenter) / 2
        rootX = Math.max(40, mid - 72)
      }

      newNodes.push({
        id: STRATEGY_ROOT_ID,
        type: 'companyRoot',
        position: { x: rootX, y: ROOT_Y },
        data: {
          label: workspaceName,
          planCount: n,
          timeframeName,
        },
      })

      topPlans.forEach((obj, i) => {
        const x = tier2LeftXs[i]
        pushObjectiveNode(obj, x, TIER2_Y)
        newEdges.push({
          id: `${STRATEGY_ROOT_ID}-${obj.id}`,
          source: STRATEGY_ROOT_ID,
          target: obj.id,
          ...dashedEdge,
        })
      })

      const positionChildren = (parentId: string, parentY: number, centerX: number) => {
        if (!expandedNodes.has(parentId)) return

        const parent = objs.find((o) => o.id === parentId)
        const children = objs.filter((o) => o.parentObjectiveId === parentId)
        const childY = parentY + VERTICAL_GAP
        const count = Math.max(children.length, 1)
        const spacing = Math.max(380, 1400 / count)

        const startX = centerX - ((children.length + 1) * spacing) / 2 + spacing / 2

        const addEdgeFromParent = (targetId: string) => {
          newEdges.push({
            id: `${parentId}-${targetId}`,
            source: parentId,
            target: targetId,
            ...dashedEdge,
          })
        }

        if (children.length === 0) {
          const addId = `add-plan-${parentId}`
          newNodes.push({
            id: addId,
            type: 'addSubPlanNode',
            position: { x: centerX - 100, y: childY },
            data: {
              parentObjectiveId: parentId,
              parentTitle: parent?.title,
              parentLevel: parent?.level,
              onAdd: openAlignModal,
            },
          })
          addEdgeFromParent(addId)
          return
        }

        children.forEach((child, index) => {
          const x = startX + index * spacing
          const hint: AlignmentHint | undefined = parent
            ? { parentTitle: parent.title, parentLevel: parent.level }
            : undefined
          pushObjectiveNode(child, x, childY, hint)
          addEdgeFromParent(child.id)

          if (expandedNodes.has(child.id)) {
            positionChildren(child.id, childY, x + CARD_CENTER_X)
          }
        })

        const addId = `add-plan-${parentId}`
        const addX = startX + children.length * spacing
        newNodes.push({
          id: addId,
          type: 'addSubPlanNode',
          position: { x: addX, y: childY },
          data: {
            parentObjectiveId: parentId,
            parentTitle: parent?.title,
            parentLevel: parent?.level,
            onAdd: openAlignModal,
          } as any,
        })
        addEdgeFromParent(addId)
      }

      topPlans.forEach((obj, i) => {
        const centerX = tier2LeftXs[i] + CARD_CENTER_X
        positionChildren(obj.id, TIER2_Y, centerX)
      })

      setNodes(newNodes)
      setEdges(newEdges)
    },
    [expandedNodes, handleToggleExpand, noopToggleKr, setEdges, setNodes, timeframeName, workspaceName, openAlignModal]
  )

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges])

  useEffect(() => {
    buildHierarchy(objectives)
  }, [objectives, buildHierarchy])

  useEffect(() => {
    const fingerprint = `${currentTimeframeId}:${objectives
      .map((o) => o.id)
      .sort()
      .join('|')}`
    if (seedFingerprintRef.current === fingerprint) return
    seedFingerprintRef.current = fingerprint

    const top = getTopLevelPlans(objectives)
    const next = new Set<string>([STRATEGY_ROOT_ID])
    top.forEach((o) => next.add(o.id))
    setExpandedNodes(next)
  }, [currentTimeframeId, objectives])

  if (objectives.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted',
          layout === 'fullscreen' ? 'h-full min-h-[200px]' : 'h-96 rounded-lg'
        )}
      >
        <div className="text-center">
          <div className="mb-2 text-muted-foreground">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-medium text-foreground">No OKRs in this timeframe</h3>
          <p className="text-muted-foreground">Create company or team objectives for the active timeframe.</p>
        </div>
      </div>
    )
  }

  const frameClass =
    layout === 'fullscreen'
      ? 'h-full min-h-0 w-full bg-[#f4f4f5]'
      : 'h-[min(640px,calc(100vh-12rem))] min-h-[400px] w-full rounded-lg border border-border bg-[#f4f4f5]'

  return (
    <div className={frameClass}>
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.25 }}
        minZoom={0.12}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={dashedEdge}
      >
        <Controls showInteractive={false} className="!shadow-md" />
        <Background color="#d4d4d8" gap={20} size={1} />
      </ReactFlow>
      <AddAlignedObjectiveModal
        open={!!alignTarget}
        onClose={() => setAlignTarget(null)}
        parentObjectiveId={alignTarget?.parentObjectiveId ?? ''}
        parentTitle={alignTarget?.parentTitle}
        parentLevel={alignTarget?.parentLevel}
        timeframeId={currentTimeframeId}
        onAligned={() => router.refresh()}
        onCreateNew={() => {
          // Hand off to the existing Objectives page with the parent pre-filled
          // so users can use the full create form. Adopting the URL parameter
          // pattern lets the Objectives page open its CreateObjectiveModal
          // pre-linked to this parent.
          if (alignTarget) {
            router.push(`/dashboard/objectives?createUnder=${alignTarget.parentObjectiveId}`)
          }
        }}
      />
    </div>
  )
}

const OKRHierarchyWrapper = (props: OKRHierarchyProps) => {
  return (
    <ReactFlowProvider>
      <div className="h-full min-h-0 w-full">
        <OKRHierarchy {...props} />
      </div>
    </ReactFlowProvider>
  )
}

export default OKRHierarchyWrapper
