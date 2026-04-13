'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Target, Building2, Filter } from 'lucide-react'

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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Align to (parent goal)
      </label>

      {displayParent ? (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Building2 className="h-4 w-4 text-blue-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-900">{displayParent.title}</p>
                <p className="text-xs text-blue-700">
                  {displayParent.owner.name} • {displayParent.timeframe.name}
                  <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 rounded">
                    {displayParent.level}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-blue-400 hover:text-blue-600"
              title="Remove alignment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-sm text-gray-500">No parent goal selected</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-50"
      >
        <div className="flex items-center">
          <Target className="h-4 w-4 text-gray-400 mr-2" />
          <span className="text-gray-700">
            {displayParent ? 'Change parent goal' : 'Search parent goals…'}
          </span>
        </div>
      </button>

      {currentObjectiveLevel ? (
        <p className="mt-1 text-xs text-gray-500">
          Search all objectives in this timeframe (excluding archived and your subtree). Same timeframe
          required.
        </p>
      ) : null}

      {mounted &&
        isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alignment-picker-title"
          >
            <div className="flex min-h-screen items-center justify-center p-4">
              <button
                type="button"
                className="fixed inset-0 bg-gray-500 bg-opacity-75 cursor-default"
                aria-label="Close picker"
                onClick={() => setIsOpen(false)}
              />

              <div className="relative z-[1] bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
                  <div className="flex items-center">
                    <Building2 className="h-6 w-6 text-blue-600 mr-2" />
                    <h2 id="alignment-picker-title" className="text-lg font-semibold text-gray-900">
                      Relationship picker
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-6 border-b border-gray-100 shrink-0 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by title or description…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Filter className="h-4 w-4" />
                      Filters
                    </span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeTimeframeOnly}
                        onChange={(e) => setActiveTimeframeOnly(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Active timeframe only</span>
                    </label>
                    <select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
                      className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-6"
                    >
                      <option value="ALL">All levels</option>
                      <option value="COMPANY">Company only</option>
                      <option value="DEPARTMENT">Department only</option>
                      <option value="INDIVIDUAL">Individual only</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 min-h-[200px]">
                  {isLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                      <p className="mt-2 text-sm text-gray-500">Loading objectives…</p>
                    </div>
                  ) : filteredObjectives.length > 0 ? (
                    <div className="space-y-2">
                      {filteredObjectives.map((objective) => (
                        <button
                          key={objective.id}
                          type="button"
                          onClick={() => handleSelectParent(objective)}
                          className="w-full p-4 text-left border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <div className="flex items-start">
                            <Building2 className="h-5 w-5 text-blue-600 mr-3 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-medium text-gray-900">{objective.title}</h3>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                  {objective.level}
                                </span>
                                <span className="text-xs tabular-nums text-gray-600">
                                  {Math.round(Number(objective.progress) || 0)}%
                                </span>
                              </div>
                              {objective.description && (
                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{objective.description}</p>
                              )}
                              <div className="flex flex-wrap items-center mt-2 text-xs text-gray-500 gap-x-3">
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
                    <div className="text-center py-8">
                      <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-sm font-medium text-gray-900 mb-2">No goals found</h3>
                      <p className="text-sm text-gray-500">
                        {searchTerm
                          ? 'Nothing matches your search. Try clearing filters or the query.'
                          : 'No eligible parent objectives in this timeframe.'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
