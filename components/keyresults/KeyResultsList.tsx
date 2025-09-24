'use client'

import { useState } from 'react'
import { Target, User, Archive } from 'lucide-react'
import { getProgressColor } from '@/lib/utils'
import ArchiveKeyResultButton from './ArchiveKeyResultButton'
import UnarchiveKeyResultButton from './UnarchiveKeyResultButton'
import AddKeyResultButton from './AddKeyResultButton'
import EditKeyResultButton from './EditKeyResultButton'
import DeleteKeyResultButton from './DeleteKeyResultButton'
import CloneKeyResultButton from './CloneKeyResultButton'
import ToDoList from '../todos/ToDoList'

interface KeyResultsListProps {
  keyResults: any[]
  objectiveId: string
  objective: any
  users: any[]
}

export default function KeyResultsList({ keyResults, objectiveId, objective, users }: KeyResultsListProps) {
  const [showArchived, setShowArchived] = useState(false)

  const activeKeyResults = keyResults.filter(kr => kr.status === 'ACTIVE')
  const archivedKeyResults = keyResults.filter(kr => kr.status === 'ARCHIVED')

  return (
    <div className="space-y-4">
      {/* Active Key Results */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Active Key Results ({activeKeyResults.length})
          </h3>
          <AddKeyResultButton objective={objective} users={users} />
        </div>
        {activeKeyResults.length > 0 && (
          <ul className="space-y-3">
            {activeKeyResults.map(kr => (
              <li key={kr.id} className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Target className="h-4 w-4 text-gray-500" />
                      <span className="font-medium text-gray-800">{kr.title}</span>
                      <div className="flex items-center space-x-1">
                        <CloneKeyResultButton keyResult={kr} users={users} />
                        <EditKeyResultButton keyResult={kr} users={users} />
                        <ArchiveKeyResultButton keyResult={kr} />
                        <DeleteKeyResultButton keyResult={kr} />
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Target: {kr.targetValue} {kr.unit} • Current: {kr.currentValue} {kr.unit}
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <div className="flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        {kr.owner?.name}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        kr.confidence === 'ON_TRACK' ? 'bg-green-100 text-green-800' :
                        kr.confidence === 'AT_RISK' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {kr.confidence.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600">Progress</span>
                        <span className={`font-semibold ${getProgressColor(kr.progress)}`}>
                          {Math.round(kr.progress)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            getProgressColor(kr.progress).split(' ')[0].replace('text-', 'bg-')
                          }`}
                          style={{ width: `${Math.min(kr.progress, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* To-Do List Section */}
                <ToDoList keyResultId={kr.id} keyResult={kr} users={users} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Archived Key Results */}
      {archivedKeyResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Archived Key Results ({archivedKeyResults.length})
            </h3>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
            >
              <Archive className="h-4 w-4 mr-1" />
              {showArchived ? 'Hide' : 'Show'} Archived
            </button>
          </div>
          
          {showArchived && (
            <ul className="space-y-3">
              {archivedKeyResults.map(kr => (
                <li key={kr.id} className="bg-orange-50 p-4 rounded-md border border-orange-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Archive className="h-4 w-4 text-orange-600" />
                        <span className="font-medium text-gray-800 line-through">{kr.title}</span>
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                          Archived
                        </span>
                        <div className="flex items-center space-x-1">
                          <CloneKeyResultButton keyResult={kr} users={users} />
                          <EditKeyResultButton keyResult={kr} users={users} />
                          <UnarchiveKeyResultButton keyResult={kr} />
                          <DeleteKeyResultButton keyResult={kr} />
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        Target: {kr.targetValue} {kr.unit} • Current: {kr.currentValue} {kr.unit}
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <div className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {kr.owner?.name}
                        </div>
                        <span>Archived: {new Date(kr.archivedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">Progress (at time of archiving)</span>
                          <span className={`font-semibold ${getProgressColor(kr.progress)}`}>
                            {Math.round(kr.progress)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              getProgressColor(kr.progress).split(' ')[0].replace('text-', 'bg-')
                            }`}
                            style={{ width: `${Math.min(kr.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* To-Do List Section */}
                  <ToDoList keyResultId={kr.id} keyResult={kr} users={users} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {keyResults.length === 0 && (
        <div className="text-center py-8">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No key results</h3>
          <p className="mt-1 text-sm text-gray-500">
            No key results have been defined for this objective yet.
          </p>
        </div>
      )}
    </div>
  )
}






