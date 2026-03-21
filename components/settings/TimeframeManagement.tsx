'use client'

import { useState, useEffect } from 'react'
import { Calendar, Plus, Edit, Trash2, Check, X } from 'lucide-react'
import { calculateTimeframeDates, getTimeframeTypeLabel, type TimeframeType } from '@/lib/timeframe-utils'
import toast from 'react-hot-toast'

function toDateInputValue(d: string | Date): string {
  if (typeof d === 'string') return d.split('T')[0]
  return d.toISOString().split('T')[0]
}

interface Timeframe {
  id: string
  name: string
  type?: string
  startDate: string | Date
  endDate: string | Date
  isActive: boolean
  createdAt: string | Date
  updatedAt: string | Date
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
    type: 'QUARTERLY' as TimeframeType,
    startDate: '',
    endDate: '',
    baseDate: new Date().toISOString().split('T')[0]
  })
  const [editTimeframe, setEditTimeframe] = useState({
    name: '',
    type: 'QUARTERLY' as TimeframeType,
    startDate: '',
    endDate: ''
  })

  // Auto-generate dates when type or base date changes
  useEffect(() => {
    if (newTimeframe.type && newTimeframe.baseDate) {
      const baseDate = new Date(newTimeframe.baseDate)
      const { startDate, endDate, name } = calculateTimeframeDates(newTimeframe.type, baseDate)
      setNewTimeframe(prev => ({
        ...prev,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        name: name
      }))
    }
  }, [newTimeframe.type, newTimeframe.baseDate])

  const handleCreateTimeframe = async () => {
    if (!newTimeframe.name || !newTimeframe.startDate || !newTimeframe.endDate) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/timeframes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTimeframe.name,
          type: newTimeframe.type,
          startDate: newTimeframe.startDate,
          endDate: newTimeframe.endDate
        })
      })

      const result = await response.json()
      
      if (response.ok) {
        setTimeframesList(prev => [result.timeframe, ...prev])
        setNewTimeframe({ 
          name: '', 
          type: 'QUARTERLY',
          startDate: '', 
          endDate: '',
          baseDate: new Date().toISOString().split('T')[0]
        })
        setIsCreating(false)
        toast.success('Timeframe created successfully')
        // Refresh the page to reflect changes
        window.location.reload()
      } else {
        console.error('Timeframe creation error:', result)
        toast.error(result.error || result.details || 'Failed to create timeframe')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    }
  }

  const handleUpdateTimeframe = async (id: string) => {
    try {
      const response = await fetch(`/api/timeframes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editTimeframe.name,
          type: editTimeframe.type,
          startDate: editTimeframe.startDate,
          endDate: editTimeframe.endDate
        })
      })

      if (response.ok) {
        const data = await response.json()
        setTimeframesList(prev => prev.map(tf => 
          tf.id === id ? data.timeframe : tf
        ))
        setEditingId(null)
        setEditTimeframe({ name: '', type: 'QUARTERLY', startDate: '', endDate: '' })
        toast.success('Timeframe updated successfully')
        // Refresh the page to reflect changes
        window.location.reload()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update timeframe')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
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
        toast.success(`Timeframe ${!isActive ? 'activated' : 'deactivated'} successfully`)
        // Refresh the page to reflect changes
        window.location.reload()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update timeframe')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
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
      type: (timeframe.type || 'QUARTERLY') as TimeframeType,
      startDate: toDateInputValue(timeframe.startDate),
      endDate: toDateInputValue(timeframe.endDate)
    })
  }

  // Auto-generate dates when editing type changes
  useEffect(() => {
    if (editingId && editTimeframe.type && editTimeframe.startDate) {
      const baseDate = new Date(editTimeframe.startDate)
      const { startDate, endDate, name } = calculateTimeframeDates(editTimeframe.type, baseDate)
      // Only update if the calculated dates are different to avoid infinite loops
      setEditTimeframe(prev => {
        const newStart = startDate.toISOString().split('T')[0]
        const newEnd = endDate.toISOString().split('T')[0]
        if (prev.startDate === newStart && prev.endDate === newEnd && prev.name === name) {
          return prev // No change needed
        }
        return {
          ...prev,
          startDate: newStart,
          endDate: newEnd,
          name: name
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTimeframe.type, editingId])

  const cancelEditing = () => {
    setEditingId(null)
    setEditTimeframe({ name: '', type: 'QUARTERLY', startDate: '', endDate: '' })
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Timeframe Management
          </h3>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer relative z-10"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Timeframe
          </button>
        </div>

        {/* Create New Timeframe */}
        {isCreating && (
          <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Create New Timeframe</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe Type *</label>
                <select
                  value={newTimeframe.type}
                  onChange={(e) => setNewTimeframe(prev => ({ ...prev, type: e.target.value as TimeframeType }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer relative z-10"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="SIX_MONTH">6-Month</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Date *</label>
                <input
                  type="date"
                  value={newTimeframe.baseDate}
                  onChange={(e) => setNewTimeframe(prev => ({ ...prev, baseDate: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer relative z-10"
                />
                <p className="mt-1 text-xs text-gray-500">Start date will be auto-calculated</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name (Auto-generated)</label>
                <input
                  type="text"
                  value={newTimeframe.name}
                  onChange={(e) => setNewTimeframe(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-gray-50"
                  placeholder="Auto-generated from type"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <div className="mt-1 text-sm text-gray-600">
                  <div>{newTimeframe.startDate ? new Date(newTimeframe.startDate).toLocaleDateString() : 'N/A'}</div>
                  <div className="text-xs">to</div>
                  <div>{newTimeframe.endDate ? new Date(newTimeframe.endDate).toLocaleDateString() : 'N/A'}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex space-x-3">
              <button
                type="button"
                onClick={handleCreateTimeframe}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 cursor-pointer relative z-10"
              >
                <Check className="h-4 w-4 mr-1" />
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer relative z-10"
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
            <div key={timeframe.id} className="flex items-center justify-between p-4 border rounded-lg relative z-0">
              {editingId === timeframe.id ? (
                <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={editTimeframe.type}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, type: e.target.value as TimeframeType }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer relative z-10"
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="SIX_MONTH">6-Month</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={editTimeframe.name}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, name: e.target.value }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-text relative z-10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={editTimeframe.startDate}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, startDate: e.target.value }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer relative z-10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={editTimeframe.endDate}
                      onChange={(e) => setEditTimeframe(prev => ({ ...prev, endDate: e.target.value }))}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm cursor-pointer relative z-10"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Calendar className="h-5 w-5 text-gray-400 mr-2" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            {timeframe.name}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {getTimeframeTypeLabel((timeframe.type || 'QUARTERLY') as TimeframeType)}
                          </span>
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

              <div className="flex items-center space-x-2 relative z-10">
                {editingId === timeframe.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleUpdateTimeframe(timeframe.id)}
                      className="p-2 text-green-600 hover:text-green-700 cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="p-2 text-gray-600 hover:text-gray-700 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(timeframe.id, timeframe.isActive)}
                      className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                        timeframe.isActive
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {timeframe.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditing(timeframe)}
                      className="p-2 text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTimeframe(timeframe.id)}
                      className="p-2 text-red-600 hover:text-red-700 cursor-pointer"
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






