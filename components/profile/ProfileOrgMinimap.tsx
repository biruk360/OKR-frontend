'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import type { ProfilePlanMetrics } from '@/lib/profileMetrics'
import { cn } from '@/lib/utils'

type OrgPersonData = {
  variant: 'mini' | 'center'
  /** Mini row: manager has only bottom source; report has only top target. */
  miniRole?: 'manager' | 'report'
  name: string
  avatarUrl?: string | null
  metrics?: ProfilePlanMetrics
  showMetrics: boolean
  href?: string
}

const OrgPersonNode = memo(({ data }: NodeProps<OrgPersonData>) => {
  const { variant, miniRole, name, avatarUrl, metrics, showMetrics, href } = data
  const isCenter = variant === 'center'
  const showTargetTop = isCenter || miniRole === 'report'
  const showSourceBottom = isCenter || miniRole === 'manager'
  const inner = (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm',
        isCenter ? 'w-[220px] p-3' : 'w-[140px] p-2'
      )}
    >
      {showTargetTop && (
        <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2 !border-0" />
      )}
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className={cn('rounded-full object-cover', isCenter ? 'h-9 w-9' : 'h-7 w-7')} />
        ) : (
          <div
            className={cn(
              'rounded-full bg-blue-500 flex items-center justify-center text-white font-medium shrink-0',
              isCenter ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-xs'
            )}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <p className={cn('font-medium text-gray-900 truncate', isCenter ? 'text-sm' : 'text-xs')}>{name}</p>
      </div>
      {metrics && showMetrics && isCenter && (
        <div className="mt-3 grid grid-cols-3 gap-1 text-center border-t border-gray-100 pt-2">
          <div>
            <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500">Key results</p>
            <p className="text-sm font-semibold tabular-nums text-gray-900">{metrics.avgKrProgress}%</p>
            <div className="mt-0.5 h-1 w-full rounded-full bg-sky-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.min(metrics.avgKrProgress, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500">Initiatives</p>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {metrics.initiativeTotal > 0 ? `${metrics.initiativeDone}/${metrics.initiativeTotal}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500">Confidence</p>
            <p className="text-sm font-semibold tabular-nums text-gray-900">{metrics.ncsScore} NCS</p>
            <div className="mt-0.5 h-1 w-full rounded-full bg-amber-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.min(metrics.ncsScore, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {showSourceBottom && (
        <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !border-0" />
      )}
    </div>
  )
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    )
  }
  return inner
})
OrgPersonNode.displayName = 'OrgPersonNode'

const nodeTypes = { orgPerson: OrgPersonNode }

export interface ProfileOrgMinimapPersonProps {
  mode: 'person'
  name: string
  avatarUrl?: string | null
  metrics: ProfilePlanMetrics
  manager: { id: string; name: string; avatar?: string | null } | null
  directReports: { id: string; name: string; avatar?: string | null }[]
  addReportsHref?: string
}

export interface ProfileOrgMinimapTeamProps {
  mode: 'team'
  teamName: string
  metrics: ProfilePlanMetrics
  members: { id: string; name: string; avatar?: string | null }[]
}

type ProfileOrgMinimapProps = ProfileOrgMinimapPersonProps | ProfileOrgMinimapTeamProps

function MinimapInner(props: ProfileOrgMinimapProps) {
  const [showData, setShowData] = useState(true)
  const [full, setFull] = useState(false)

  const { nodes, edges } = useMemo(() => {
    const list: Node[] = []
    const edgeList: { id: string; source: string; target: string }[] = []

    if (props.mode === 'person') {
      const cx = 280
      const cy = 200
      if (props.manager) {
        list.push({
          id: 'mgr',
          type: 'orgPerson',
          position: { x: cx, y: 20 },
          data: {
            variant: 'mini',
            miniRole: 'manager',
            name: props.manager.name,
            avatarUrl: props.manager.avatar,
            showMetrics: false,
            href: `/dashboard/org/users/${props.manager.id}`,
          },
        })
        edgeList.push({ id: 'e-mgr', source: 'mgr', target: 'center' })
      }
      list.push({
        id: 'center',
        type: 'orgPerson',
        position: { x: props.manager ? cx - 30 : cx, y: props.manager ? 120 : 80 },
        data: {
          variant: 'center',
          name: props.name,
          avatarUrl: props.avatarUrl,
          metrics: props.metrics,
          showMetrics: showData,
        },
      })
      const reports = props.directReports.slice(0, 4)
      const startX = cx - (reports.length * 80) / 2 + 40
      reports.forEach((r, i) => {
        const id = `r-${r.id}`
        list.push({
          id,
          type: 'orgPerson',
          position: { x: startX + i * 100, y: 320 },
          data: {
            variant: 'mini',
            miniRole: 'report',
            name: r.name,
            avatarUrl: r.avatar,
            showMetrics: false,
            href: `/dashboard/org/users/${r.id}`,
          },
        })
        edgeList.push({ id: `e-${id}`, source: 'center', target: id })
      })
    } else {
      const cx = 200
      list.push({
        id: 'team',
        type: 'orgPerson',
        position: { x: cx, y: 100 },
        data: {
          variant: 'center',
          name: props.teamName,
          avatarUrl: null,
          metrics: props.metrics,
          showMetrics: showData,
        },
      })
      const members = props.members.slice(0, 5)
      const startX = cx - (members.length * 70) / 2 + 50
      members.forEach((m, i) => {
        const id = `m-${m.id}`
        list.push({
          id,
          type: 'orgPerson',
          position: { x: startX + i * 92, y: 300 },
          data: {
            variant: 'mini',
            miniRole: 'report',
            name: m.name,
            avatarUrl: m.avatar,
            showMetrics: false,
            href: `/dashboard/org/users/${m.id}`,
          },
        })
        edgeList.push({ id: `e-${id}`, source: 'team', target: id })
      })
    }

    return { nodes: list, edges: edgeList }
  }, [props, showData])

  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: 'smoothstep' as const,
        style: { stroke: '#9ca3af', strokeWidth: 1.25 },
      })),
    [edges]
  )

  const [rfNodes, setNodes, onNodesChange] = useNodesState(nodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(styledEdges)

  useEffect(() => {
    setNodes(nodes)
    setEdges(styledEdges)
  }, [nodes, styledEdges, setNodes, setEdges])

  const onFullscreen = useCallback(() => {
    setFull((f) => !f)
  }, [])

  const wrapperClass = full
    ? 'fixed inset-0 z-50 bg-gray-100 p-4'
    : 'relative rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden min-h-[320px]'

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white/90">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Org minimap</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowData((s) => !s)}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
          >
            {showData ? 'Hide data' : 'Show data'}
          </button>
          <button
            type="button"
            onClick={onFullscreen}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
          >
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
          <Link
            href="/dashboard/alignment-map"
            className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
          >
            Alignment map
          </Link>
        </div>
      </div>
      <div className={full ? 'h-[calc(100vh-3.5rem)]' : 'h-[min(420px,55vh)]'}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.4}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={14} size={1} color="#d1d5db" />
          <Controls showInteractive={false} className="!shadow-md" />
        </ReactFlow>
      </div>
      {props.mode === 'person' && props.addReportsHref && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10">
          <Link
            href={props.addReportsHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add direct reports
          </Link>
        </div>
      )}
    </div>
  )
}

export default function ProfileOrgMinimap(props: ProfileOrgMinimapProps) {
  return (
    <ReactFlowProvider>
      <MinimapInner {...props} />
    </ReactFlowProvider>
  )
}
