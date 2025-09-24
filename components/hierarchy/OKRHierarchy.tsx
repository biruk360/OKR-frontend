'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import ObjectiveNode from './ObjectiveNode'
import KeyResultNode from './KeyResultNode'

interface Objective {
  id: string
  title: string
  description?: string
  level: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'
  progress: number
  owner: {
    id: string
    name: string
    avatar?: string
  }
  department?: {
    id: string
    name: string
  }
  parentObjectiveId?: string
  childObjectives: Objective[]
  keyResults: any[]
}

interface OKRHierarchyProps {
  objectives: Objective[]
  currentTimeframeId: string
}

const nodeTypes = {
  objectiveNode: ObjectiveNode,
  keyResultNode: KeyResultNode,
}

const OKRHierarchy = ({ objectives, currentTimeframeId }: OKRHierarchyProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [expandedKRNodes, setExpandedKRNodes] = useState<Set<string>>(new Set())

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }, [])

  const handleToggleKR = useCallback((nodeId: string) => {
    setExpandedKRNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }, [])

  // Convert objectives to nodes and edges
  const buildHierarchy = useCallback((objectives: Objective[]) => {
    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    const nodePositions = new Map<string, { x: number; y: number }>()
    
    // First, find all company-level objectives (root nodes)
    const companyObjectives = objectives.filter(obj => obj.level === 'COMPANY')
    
    // Position company objectives horizontally
    companyObjectives.forEach((obj, index) => {
      const x = index * 500 + 200
      const y = 100
      nodePositions.set(obj.id, { x, y })
      
      newNodes.push({
        id: obj.id,
        type: 'objectiveNode',
        position: { x, y },
        data: {
          ...obj,
          keyResultsCount: obj.keyResults.length,
          childObjectivesCount: obj.childObjectives.length,
          isExpanded: expandedNodes.has(obj.id),
          isKRExpanded: expandedKRNodes.has(obj.id),
          onToggleExpand: handleToggleExpand,
          onToggleKR: handleToggleKR,
        },
      })

      // Add Key Result nodes if expanded
      if (expandedKRNodes.has(obj.id)) {
        obj.keyResults.forEach((kr, krIndex) => {
          const krX = x + (krIndex - (obj.keyResults.length - 1) / 2) * 280
          const krY = y + 200
          const krId = `kr-${kr.id}`
          
          newNodes.push({
            id: krId,
            type: 'keyResultNode',
            position: { x: krX, y: krY },
            data: {
              id: kr.id,
              title: kr.title,
              currentValue: kr.currentValue || 0,
              targetValue: kr.targetValue || 100,
              unit: kr.unit || '%',
              progress: kr.progress || 0,
              owner: kr.owner,
            },
          })

          // Add edge from objective to key result
          newEdges.push({
            id: `${obj.id}-${krId}`,
            source: obj.id,
            target: krId,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#9ca3af', strokeWidth: 1 },
          })
        })
      }
    })

    // Then, position department and individual objectives
    const positionChildren = (parentId: string, parentY: number, startX: number = 0) => {
      const children = objectives.filter(obj => obj.parentObjectiveId === parentId)
      if (children.length === 0) return

      const childY = parentY + 400
      const spacing = Math.max(400, 1600 / children.length)
      
      children.forEach((child, index) => {
        const x = startX + index * spacing
        nodePositions.set(child.id, { x, y: childY })
        
        newNodes.push({
          id: child.id,
          type: 'objectiveNode',
          position: { x, y: childY },
          data: {
            ...child,
            keyResultsCount: child.keyResults.length,
            childObjectivesCount: child.childObjectives.length,
            isExpanded: expandedNodes.has(child.id),
            isKRExpanded: expandedKRNodes.has(child.id),
            onToggleExpand: handleToggleExpand,
            onToggleKR: handleToggleKR,
          },
        })

        // Add Key Result nodes if expanded
        if (expandedKRNodes.has(child.id)) {
          child.keyResults.forEach((kr, krIndex) => {
            const krX = x + (krIndex - (child.keyResults.length - 1) / 2) * 280
            const krY = childY + 200
            const krId = `kr-${kr.id}`
            
            newNodes.push({
              id: krId,
              type: 'keyResultNode',
              position: { x: krX, y: krY },
              data: {
                id: kr.id,
                title: kr.title,
                currentValue: kr.currentValue || 0,
                targetValue: kr.targetValue || 100,
                unit: kr.unit || '%',
                progress: kr.progress || 0,
                owner: kr.owner,
              },
            })

            // Add edge from objective to key result
            newEdges.push({
              id: `${child.id}-${krId}`,
              source: child.id,
              target: krId,
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#9ca3af', strokeWidth: 1 },
            })
          })
        }

        // Add edge from parent to child
        newEdges.push({
          id: `${parentId}-${child.id}`,
          source: parentId,
          target: child.id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        })

        // Recursively position grandchildren if parent is expanded
        if (expandedNodes.has(parentId)) {
          positionChildren(child.id, childY, x - (children.length - 1) * spacing / 2)
        }
      })
    }

    // Position children for each company objective
    companyObjectives.forEach((companyObj, index) => {
      if (expandedNodes.has(companyObj.id)) {
        positionChildren(companyObj.id, 100, index * 500)
      }
    })

    setNodes(newNodes)
    setEdges(newEdges)
  }, [objectives, expandedNodes, expandedKRNodes, handleToggleExpand, handleToggleKR])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  // Rebuild hierarchy when objectives or expanded nodes change
  useEffect(() => {
    buildHierarchy(objectives)
  }, [objectives, buildHierarchy])

  // Auto-expand company objectives by default
  useEffect(() => {
    const companyObjectives = objectives.filter(obj => obj.level === 'COMPANY')
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      companyObjectives.forEach(obj => newSet.add(obj.id))
      return newSet
    })
  }, [objectives])

  if (objectives.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No OKRs Found</h3>
          <p className="text-gray-500">Create some objectives to see the hierarchy visualization.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[600px] w-full border border-gray-200 rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        }}
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.data?.level) {
              case 'COMPANY': return '#3b82f6'
              case 'DEPARTMENT': return '#10b981'
              case 'INDIVIDUAL': return '#8b5cf6'
              default: return '#6b7280'
            }
          }}
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
        <Background color="#f3f4f6" gap={20} />
      </ReactFlow>
    </div>
  )
}

// Wrapper component with ReactFlowProvider
const OKRHierarchyWrapper = (props: OKRHierarchyProps) => {
  return (
    <ReactFlowProvider>
      <OKRHierarchy {...props} />
    </ReactFlowProvider>
  )
}

export default OKRHierarchyWrapper
