'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, X, Target, Building2, Filter } from 'lucide-react'
import { Modal, EmptyState, FilterSelect } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'

interface ParentObjectiveSelectorProps {
  selectedParentId: string | null
  onSelectParent: (parentId: string | null) => void
  currentTimeframeId: string
  currentObjectiveId?: string
  currentObjectiveLevel?: string
  /** When the selected parent is not yet in the loaded list, show this summary (e.g. from server objective). */
  knownParent?: { id: string; title: string; ownerName?: string; timeframeName?: string; level?: string } | null
  className?: string
}

interface ParentObjective {
  id: string
  title: string
  description?: string | null
  level: string
  goalStatus: string
  progress: number
  timeframe: {
    id: string
    name: string
    type?: string
  }
  owner: {
    id: string
    name: string
  }
  department?: {
    id: string
    name: string
  }
}

type LevelFilter = 'ALL' | 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'

const LEVEL_FILTER_OPTIONS = [
  { value: 'COMPANY', label: 'Company only' },
  { value: 'DEPARTMENT', label: 'Department only' },
  { value: 'INDIVIDUAL', label: 'Individual only' },
]

export default function ParentObjectiveSelector({
  selectedParentId,
  onSelectParent,
  currentTimeframeId,
  currentObjectiveId,
  currentObjectiveLevel,
  knownParent,
  className = '',
}: ParentObjectiveSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [parentObjectives, setParentObjectives] = useState<ParentObjective[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedParent, setSelectedParent] = useState<ParentObjective | null>(null)
  const [activeTimeframeOnly, setActiveTimeframeOnly] = useState(true)
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('ALL')
  const loadParents = useCallback(async () => {
    if (!currentTimeframeId) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        timeframeId: currentTimeframeId,
        activeTimeframeOnly: String(activeTimeframeOnly),
      })
      if (currentObjectiveId) params.set('excludeObjectiveId', currentObjectiveId)
      if (levelFilter !== 'ALL') params.set('level', levelFilter)

      const res = await fetch(`/api/objectives/alignment-search?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setParentObjectives(data.data)
      } else {
        setParentObjectives([])
      }
    } catch (error) {
      console.error('Error fetching alignment candidates:', error)
      setParentObjectives([])
    } finally {
      setIsLoading(false)
    }
  }, [currentTimeframeId, currentObjectiveId, activeTimeframeOnly, levelFilter])

  useEffect(() => {
    if (isOpen) {
      loadParents()
    }
  }, [isOpen, loadParents])

  useEffect(() => {
    if (selectedParentId && parentObjectives.length > 0) {
      const parent = parentObjectives.find((obj) => obj.id === selectedParentId)
      setSelectedParent(parent || null)
    } else if (!selectedParentId) {
      setSelectedParent(null)
    }
  }, [selectedParentId, parentObjectives])

  const displayParent =
    selectedParent ||
    (knownParent && selectedParentId === knownParent.id
      ? ({
          id: knownParent.id,
          title: knownParent.title,
          level: knownParent.level || '—',
          goalStatus: 'ON_TRACK',
          progress: 0,
          owner: { id: '', name: knownParent.ownerName || '—' },
          timeframe: { id: currentTimeframeId, name: knownParent.timeframeName || '—' },
        } as ParentObjective)
      : null)

  const filteredObjectives = searchTerm.trim()
    ? parentObjectives.filter(
        (obj) =>
          obj.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (obj.description && obj.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : parentObjectives

  const handleSelectParent = (objective: ParentObjective) => {
    setSelectedParent(objective)
    onSelectParent(objective.id)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClearSelection = () => {
    setSelectedParent(null)
    onSelectParent(null)
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-muted-foreground mb-2">
        Align to (parent goal)
      </label>

      {displayParent ? (
        <div className="mb-3 p-3 bg-primary-50 border border-primary-200 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Building2 className="h-4 w-4 text-primary-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-primary-900">{displayParent.title}</p>
                <p className="text-xs text-primary-700">
                  {displayParent.owner.name} • {displayParent.timeframe.name}
                  <span className="ml-1 text-xs bg-primary-100 text-primary-800 px-1 rounded">
                    {displayParent.level}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-primary-400 hover:text-primary-600"
              title="Remove alignment"
              aria-label="Remove alignment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3 p-3 bg-muted border border-border rounded-md">
          <p className="text-sm text-muted-foreground">No parent goal selected</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-card text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary-500 hover:bg-muted"
      >
        <div className="flex items-center">
          <Target className="h-4 w-4 text-muted-foreground mr-2" />
          <span className="text-muted-foreground">
            {displayParent ? 'Change parent goal' : 'Search parent goals…'}
          </span>
        </div>
      </button>

      {currentObjectiveLevel ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Search all objectives in this timeframe (excluding archived and your subtree). Same timeframe
          required.
        </p>
      ) : null}

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Relationship picker"
        icon={Building2}
        iconClassName="text-primary-600"
        size="lg"
        scrollBehavior="internal"
        footer={
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
        }
      >
        <div className="sticky top-0 z-10 bg-popover pb-4 mb-2 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title or description…"
              aria-label="Search parent goals"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-border rounded-md shadow-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters
            </span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={activeTimeframeOnly}
                onChange={(e) => setActiveTimeframeOnly(e.target.checked)}
                className="rounded border-border text-primary-600 focus:ring-ring"
              />
              <span>Active timeframe only</span>
            </label>
            <FilterSelect
              label="Level"
              value={levelFilter === 'ALL' ? undefined : levelFilter}
              onValueChange={(v) => setLevelFilter((v ?? 'ALL') as LevelFilter)}
              options={LEVEL_FILTER_OPTIONS}
              placeholder="All levels"
            />
          </div>
        </div>

        <div className="min-h-[200px] py-2">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading objectives">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredObjectives.length > 0 ? (
            <div className="space-y-2">
              {filteredObjectives.map((objective) => (
                <button
                  key={objective.id}
                  type="button"
                  onClick={() => handleSelectParent(objective)}
                  className="w-full p-4 text-left border border-border rounded-md hover:bg-primary-50 hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="flex items-start">
                    <Building2 className="h-5 w-5 text-primary-600 mr-3 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground">{objective.title}</h3>
                        <span className="text-xs bg-primary-100 text-primary-800 px-2 py-0.5 rounded-full">
                          {objective.level}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {Math.round(Number(objective.progress) || 0)}%
                        </span>
                      </div>
                      {objective.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{objective.description}</p>
                      )}
                      <div className="flex flex-wrap items-center mt-2 text-xs text-muted-foreground gap-x-3">
                        <span>Owner: {objective.owner.name}</span>
                        <span>Timeframe: {objective.timeframe.name}</span>
                        {objective.department && <span>{objective.department.name}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              bare
              icon={Target}
              title="No goals found"
              description={
                searchTerm
                  ? 'Nothing matches your search. Try clearing filters or the query.'
                  : 'No eligible parent objectives in this timeframe.'
              }
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
