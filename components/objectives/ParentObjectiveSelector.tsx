'use client'

import { useState, useEffect } from 'react'
import { Search, X, Target, Building2 } from 'lucide-react'

interface ParentObjectiveSelectorProps {
  selectedParentId: string | null
  onSelectParent: (parentId: string | null) => void
  currentTimeframeId: string
  currentObjectiveId?: string
  currentObjectiveLevel?: string
  userDepartmentId?: string
  className?: string
}

interface ParentObjective {
  id: string
  title: string
  description?: string
  level: string
  timeframe: {
    id: string
    name: string
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

export default function ParentObjectiveSelector({
  selectedParentId,
  onSelectParent,
  currentTimeframeId,
  currentObjectiveId,
  currentObjectiveLevel,
  userDepartmentId,
  className = ''
}: ParentObjectiveSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [parentObjectives, setParentObjectives] = useState<ParentObjective[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedParent, setSelectedParent] = useState<ParentObjective | null>(null)

  // Fetch parent objectives when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchParentObjectives()
    }
  }, [isOpen, currentTimeframeId, currentObjectiveLevel, userDepartmentId])

  // Set selected parent when selectedParentId changes
  useEffect(() => {
    if (selectedParentId && parentObjectives.length > 0) {
      const parent = parentObjectives.find(obj => obj.id === selectedParentId)
      setSelectedParent(parent || null)
    } else {
      setSelectedParent(null)
    }
  }, [selectedParentId, parentObjectives])

  const fetchParentObjectives = async () => {
    setIsLoading(true)
    try {
      let objectives: ParentObjective[] = []
      
      // For individual objectives, fetch both department and company objectives
      if (currentObjectiveLevel === 'INDIVIDUAL') {
        // Fetch department objectives from user's department
        if (userDepartmentId) {
          const deptResponse = await fetch(`/api/objectives?level=DEPARTMENT&timeframeId=${currentTimeframeId}&status=ACTIVE&departmentId=${userDepartmentId}`)
          if (deptResponse.ok) {
            const deptData = await deptResponse.json()
            if (deptData.success) {
              objectives = [...objectives, ...deptData.data]
            }
          }
        }
        
        // Fetch company objectives
        const companyResponse = await fetch(`/api/objectives?level=COMPANY&timeframeId=${currentTimeframeId}&status=ACTIVE`)
        if (companyResponse.ok) {
          const companyData = await companyResponse.json()
          if (companyData.success) {
            objectives = [...objectives, ...companyData.data]
          }
        }
      } else {
        // For department objectives, only fetch company objectives
        const response = await fetch(`/api/objectives?level=COMPANY&timeframeId=${currentTimeframeId}&status=ACTIVE`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            objectives = data.data
          }
        }
      }
      
      // Filter out current objective if editing
      const filteredObjectives = currentObjectiveId 
        ? objectives.filter((obj: ParentObjective) => obj.id !== currentObjectiveId)
        : objectives
      
      setParentObjectives(filteredObjectives)
    } catch (error) {
      console.error('Error fetching parent objectives:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredObjectives = parentObjectives.filter(obj =>
    obj.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    obj.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
        Align to Parent Objective
      </label>
      
      {/* Selected Parent Display */}
      {selectedParent ? (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Building2 className="h-4 w-4 text-blue-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-blue-900">{selectedParent.title}</p>
                <p className="text-xs text-blue-700">
                  {selectedParent.owner.name} • {selectedParent.timeframe.name}
                </p>
              </div>
            </div>
            <button
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
          <p className="text-sm text-gray-500">No parent objective selected</p>
        </div>
      )}

      {/* Select Parent Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-50"
      >
        <div className="flex items-center">
          <Target className="h-4 w-4 text-gray-400 mr-2" />
          <span className="text-gray-700">
            {selectedParent ? 'Change Parent Objective' : 'Select Parent Objective'}
          </span>
        </div>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsOpen(false)} />
            
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center">
                  <Building2 className="h-6 w-6 text-blue-600 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {currentObjectiveLevel === 'INDIVIDUAL' ? 'Select Parent Objective' : 'Select Parent Objective'}
                  </h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6">
                {/* Search */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={currentObjectiveLevel === 'INDIVIDUAL' ? "Search department and company objectives..." : "Search company objectives..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Objectives List */}
                <div className="max-h-96 overflow-y-auto">
                  {isLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-500">Loading objectives...</p>
                    </div>
                  ) : filteredObjectives.length > 0 ? (
                    <div className="space-y-2">
                      {filteredObjectives.map((objective) => (
                        <button
                          key={objective.id}
                          onClick={() => handleSelectParent(objective)}
                          className="w-full p-4 text-left border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <div className="flex items-start">
                            <Building2 className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h3 className="text-sm font-medium text-gray-900">{objective.title}</h3>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                  {objective.level}
                                </span>
                              </div>
                              {objective.description && (
                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                  {objective.description}
                                </p>
                              )}
                              <div className="flex items-center mt-2 text-xs text-gray-500">
                                <span className="mr-4">Owner: {objective.owner.name}</span>
                                <span className="mr-4">Timeframe: {objective.timeframe.name}</span>
                                {objective.department && (
                                  <span>Department: {objective.department.name}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-sm font-medium text-gray-900 mb-2">No objectives found</h3>
                      <p className="text-sm text-gray-500">
                        {searchTerm 
                          ? 'No objectives match your search.'
                          : currentObjectiveLevel === 'INDIVIDUAL' 
                            ? 'No active department or company objectives available for this timeframe.'
                            : 'No active company objectives available for this timeframe.'
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
