'use client'

import { useState, useEffect } from 'react'
import { Calendar, Tag, User, Search } from 'lucide-react'
import { useTimeframes } from '@/hooks'

interface GoalsFilterBarProps {
  filters: {
    timeframe: string
    startDate: string
    endDate: string
    labels: string[]
    owner: string
    search: string
  }
  onFilterChange: (key: string, value: any) => void
}

export default function GoalsFilterBar({ filters, onFilterChange }: GoalsFilterBarProps) {
  const { timeframes } = useTimeframes()
  const [labels, setLabels] = useState<any[]>([])

  // Labels aren't in the shared reference-data hook; keep inline.
  useEffect(() => {
    fetch('/api/labels')
      .then((r) => r.json())
      .catch(() => ({ success: false, data: [] }))
      .then((labelsData) => {
        if (labelsData.success) setLabels(labelsData.data || [])
      })
      .catch((error) => {
        console.error('Error fetching labels:', error)
      })
  }, [])

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search goals..."
              value={filters.search}
              onChange={(e) => onFilterChange('search', e.target.value)}
              className="pl-10 input w-full"
            />
          </div>
        </div>

        {/* Timeframe */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe</label>
          <select
            value={filters.timeframe}
            onChange={(e) => onFilterChange('timeframe', e.target.value)}
            className="input w-full"
          >
            <option value="">All Timeframes</option>
            {timeframes.map((tf) => (
              <option key={tf.id} value={tf.id}>{tf.name}</option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => onFilterChange('startDate', e.target.value)}
            className="input w-full"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => onFilterChange('endDate', e.target.value)}
            className="input w-full"
          />
        </div>

        {/* Owner */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by owner..."
              value={filters.owner}
              onChange={(e) => onFilterChange('owner', e.target.value)}
              className="pl-10 input w-full"
            />
          </div>
        </div>
      </div>

      {/* Labels Filter */}
      {labels.length > 0 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Labels</label>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => {
                  const newLabels = filters.labels.includes(label.id)
                    ? filters.labels.filter(l => l !== label.id)
                    : [...filters.labels, label.id]
                  onFilterChange('labels', newLabels)
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.labels.includes(label.id)
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
                style={{
                  borderColor: filters.labels.includes(label.id) ? label.color : undefined
                }}
              >
                {label.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

