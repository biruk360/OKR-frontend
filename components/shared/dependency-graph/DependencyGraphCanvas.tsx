'use client'

/**
 * DependencyGraphCanvas — renders a pure `DependencyGraphLayout` with React
 * Flow (CON-4): read-only (no drag / connect / select), pan + zoom, a tone
 * legend, and click-to-open on every node.
 *
 * Default click targets: a dependency opens its Dependency Map deep link
 * (`row.href`, `?dependency=<id>`); a person opens their profile's
 * "Links & dependencies" tab. Pass `onOpenDependency` / `onOpenPerson` to
 * open a quick view in place instead.
 */
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { cn } from '@/lib/utils'
import {
  DEPENDENCY_GRAPH_NODE_TYPES,
  DEPENDENCY_TONE_LABELS,
  type DependencyEdgeTone,
  type DependencyGraphLayout,
  type DependencyGraphNodeData,
  type GraphDependency,
  type GraphPerson,
} from './graph-model'
import { DEPENDENCY_TONE_COLOR, DependencyItemNode, DependencyPersonNode, type NodeRuntime } from './nodes'

const nodeTypes: NodeTypes = {
  [DEPENDENCY_GRAPH_NODE_TYPES.dependency]: DependencyItemNode,
  [DEPENDENCY_GRAPH_NODE_TYPES.person]: DependencyPersonNode,
}

const EDGE_STYLE: Record<DependencyEdgeTone, { strokeWidth: number; strokeDasharray?: string; animated: boolean }> = {
  danger: { strokeWidth: 2, animated: true },
  warn: { strokeWidth: 2, animated: false },
  open: { strokeWidth: 1.5, animated: false },
  muted: { strokeWidth: 1.25, strokeDasharray: '4 4', animated: false },
}

const LEGEND_ORDER: DependencyEdgeTone[] = ['danger', 'warn', 'open', 'muted']

export interface DependencyGraphCanvasProps {
  layout: DependencyGraphLayout
  /** Highlights this dependency's node(s). */
  focusedDependencyId?: string | null
  onOpenDependency?: (dependency: GraphDependency) => void
  onOpenPerson?: (person: GraphPerson, href: string) => void
  /** Canvas height (CSS length). Default 520px. */
  height?: number | string
  ariaLabel?: string
  className?: string
}

/** Re-fits the viewport whenever the layout changes (filters, timeframe). */
function FitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView({ padding: 0.15, maxZoom: 1, duration: 200 }))
    return () => cancelAnimationFrame(frame)
  }, [signature, fitView])
  return null
}

function Legend() {
  return (
    <Panel position="top-left">
      <ul
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-2.5 py-1.5 text-micro text-[var(--ap-fg-subtle)] shadow-sm"
        aria-label="Edge colours"
      >
        {LEGEND_ORDER.map((tone) => (
          <li key={tone} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4 rounded-full"
              style={{
                background: tone === 'muted' ? 'transparent' : DEPENDENCY_TONE_COLOR[tone],
                borderTop: tone === 'muted' ? `2px dashed ${DEPENDENCY_TONE_COLOR[tone]}` : undefined,
              }}
            />
            {DEPENDENCY_TONE_LABELS[tone]}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function CanvasInner({
  layout,
  focusedDependencyId,
  onOpenDependency,
  onOpenPerson,
}: Pick<DependencyGraphCanvasProps, 'layout' | 'focusedDependencyId' | 'onOpenDependency' | 'onOpenPerson'>) {
  const router = useRouter()

  const nodes = useMemo<Node<DependencyGraphNodeData & NodeRuntime>[]>(
    () =>
      layout.nodes.map((node) => {
        const data = node.data
        const runtime: NodeRuntime =
          data.kind === 'dependency'
            ? {
                focused: !!focusedDependencyId && data.dependency.id === focusedDependencyId,
                onOpen: () => (onOpenDependency ? onOpenDependency(data.dependency) : router.push(data.dependency.href)),
              }
            : {
                onOpen: () => (onOpenPerson ? onOpenPerson(data.person, data.href) : router.push(data.href)),
              }
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          data: { ...data, ...runtime },
          draggable: false,
          selectable: false,
          connectable: false,
        }
      }),
    [layout.nodes, focusedDependencyId, onOpenDependency, onOpenPerson, router],
  )

  const edges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge) => {
        const tone = edge.data.tone
        const color = DEPENDENCY_TONE_COLOR[tone]
        const style = EDGE_STYLE[tone]
        const focused = !!focusedDependencyId && edge.data.dependencyId === focusedDependencyId
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: style.animated,
          focusable: false,
          style: {
            stroke: color,
            strokeWidth: focused ? style.strokeWidth + 1.5 : style.strokeWidth,
            strokeDasharray: style.strokeDasharray,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        }
      }),
    [layout.edges, focusedDependencyId],
  )

  const signature = useMemo(() => layout.nodes.map((n) => n.id).join('|'), [layout.nodes])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.15}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <FitOnChange signature={signature} />
      <Legend />
      <Background gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  )
}

export function DependencyGraphCanvas({
  layout,
  focusedDependencyId,
  onOpenDependency,
  onOpenPerson,
  height = 520,
  ariaLabel = 'Dependency graph',
  className,
}: DependencyGraphCanvasProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn(
        'relative w-full overflow-hidden bg-[var(--ap-bg-sunken)]',
        '[&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-lg [&_.react-flow__controls]:border [&_.react-flow__controls]:border-[var(--ap-border)] [&_.react-flow__controls]:shadow-sm',
        '[&_.react-flow__controls-button]:border-[var(--ap-border)] [&_.react-flow__controls-button]:bg-[var(--ap-bg-raised)] [&_.react-flow__controls-button]:fill-[var(--ap-fg)]',
        className,
      )}
      style={{ height }}
    >
      <ReactFlowProvider>
        <CanvasInner
          layout={layout}
          focusedDependencyId={focusedDependencyId}
          onOpenDependency={onOpenDependency}
          onOpenPerson={onOpenPerson}
        />
      </ReactFlowProvider>
    </div>
  )
}
