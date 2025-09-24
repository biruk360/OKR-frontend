'use client'

import { useState } from 'react'
import { Calendar, Plus, Edit, Trash2, Check, X } from 'lucide-react'

interface Timeframe {
  id: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface TimeframeManagementProps {
  timeframes: Timeframe[]
}

export default function TimeframeManagement({ timeframes }: TimeframeManagementProps) {
  const [timeframesList, setTimeframesList] = useState(timeframes)
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTimeframe, setNewTimeframe] = useState({
    name: '',
    startDate: '',
    endDate: ''
  })
  const [editTimeframe, setEditTimeframe] = useState({
    name: '',
    startDate: '',
    endDate: ''
  })

  const handleCreateTimeframe = async () => {
    try {
      const response = await fetch('/api/timeframes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTimeframe)
      })

      if (response.ok) {
        const data = await response.json()
        setTimeframesList(prev => [data.timeframe, ...prev])
        setNewTimeframe({ name: '', startDate: '', endDate: '' })
        setIsCreating(false)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create timeframe')
      }
    } catch (error) {
      alert('An error occurred. Please try again.')
    }
  }

  const handleUpdateTimeframe = async (id: string) => {
    try {
      const response = await fetch(`/api/timeframes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editTimeframe)
      })

      if (response.ok) {
        const data = await response.json()
        setTimeframesList(prev => prev.map(tf => 
          tf.id === id ? data.timeframe : tf
        ))
        setEditingId(null)
        setEditTimeframe({ name: '', startDate: '', endDate: '' })
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to update timeframe')
      }
    } catch (error) {
      alert('An error occurred. Please try again.')
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/timeframes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      })

      if (response.ok) {
        const data = await response.json()
        setTimeframesList(prev => prev.map(tf => 
          tf.id === id ? data.timeframe : tf
        ))
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to update timeframe')
      }
    } catch (error) {
      alert('An error occurred. Please try again.')
    }
  }

  const handleDeleteTimeframe = async (id: string) => {
    if (!confirm('Are you sure you want to delete this timeframe? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/timeframes/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setTimeframesList(prev => prev.filter(tf => tf.id !== id))
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to delete timeframe')
      }
    } catch (error) {
      alert('An error occurred. Please try again.')
    }
  }

  const startEditing = (timeframe: Timeframe) => {
    setEditingId(timeframe.id)
    setEditTimeframe({
      name: timeframe.name,
      startDate: timeframe.startDate.split('T')[0],
      endDate: timeframe.endDate.split('T')[0]
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditTimeframe({ name: '', startDate: '', endDate: '' })
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Timeframe Management
          </h3>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Timeframe
          </button>
        </div>

        {/* Create New Timeframe */}
        {isCreating && (
          <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Create New Timeframe</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={newTimeframe.name}
                  onChange={(e) => setNewTimeframe(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g., Q1 2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  value={newTimeframe.startDate}
                  onChange={(e) => setNewTimeframe(prev => ({ ...prev, startDate: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  value={newTimeframe.endDate}
                  onChange={(e) => setNewTimeframe(prev => ({ ...prev, endDate: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex space-x-3">
              <button
                onClick={handleCreateTimeframe}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-1" />
                Create
              </button>
              <button
                onClick={() => setIsCreating(false)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Timeframes List */}
        <div className="space-y-3">
          {timeframesList.map((timeframe) => (
            <div key={timeframe.id} className="flex items-center justify-between p-4 border rounded-lg">
              {editingId === timeframe.id ? (
                <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <input
                      type="text"
                      value={editTimeframe.name}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, name: e.target.value }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      value={editTimeframe.startDate}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, startDate: e.target.value }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      value={editTimeframe.endDate}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, endDate: e.target.value }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Calendar className="h-5 w-5 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {timeframe.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(timeframe.startDate).toLocaleDateString()} - {new Date(timeframe.endDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      timeframe.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {timeframe.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2">
                {editingId === timeframe.id ? (
                  <>
                    <button
                      onClick={() => handleUpdateTimeframe(timeframe.id)}
                      className="p-2 text-green-600 hover:text-green-700"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="p-2 text-gray-600 hover:text-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleToggleActive(timeframe.id, timeframe.isActive)}
                      className={`px-3 py-1 text-xs font-medium rounded-md ${
                        timeframe.isActive
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {timeframe.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => startEditing(timeframe)}
                      className="p-2 text-blue-600 hover:text-blue-700"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTimeframe(timeframe.id)}
                      className="p-2 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {timeframesList.length === 0 && (
          <div className="text-center py-6">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No timeframes</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating a new timeframe.</p>
          </div>
        )}
      </div>
    </div>
  )
}






