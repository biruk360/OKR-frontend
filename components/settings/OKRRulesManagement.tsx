'use client'

import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Calendar, Bell } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

interface FormData {
  defaultVisibility: string
  gradingScale: string
  checkInCadence: string
  reminderEnabled: boolean
  reminderDays: number
}

export default function OKRRulesManagement() {
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      defaultVisibility: 'PUBLIC',
      gradingScale: 'PERCENTAGE',
      checkInCadence: 'WEEKLY',
      reminderEnabled: true,
      reminderDays: 7
    }
  })

  useEffect(() => {
    // Load current settings
    fetch('/api/settings/okr-rules')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          reset(data.data)
        }
      })
      .catch(() => {
        // Use defaults if no settings exist
      })
  }, [reset])

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/settings/okr-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('OKR rules updated successfully')
      } else {
        toast.error(result.error || 'Failed to update OKR rules')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">OKR Rules</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure default settings and rules for OKRs in your organization.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Default Visibility */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Eye className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Default Visibility</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default visibility for new objectives
            </label>
            <select
              {...register('defaultVisibility')}
              className="input"
            >
              <option value="PUBLIC">Public (visible to all)</option>
              <option value="PRIVATE">Private (visible to owner and managers)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              This setting applies to newly created objectives. Users can override this when creating objectives.
            </p>
          </div>
        </div>

        {/* Grading Scale */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Calendar className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Grading Scale</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Progress measurement scale
            </label>
            <select
              {...register('gradingScale')}
              className="input"
            >
              <option value="PERCENTAGE">Percentage (0-100%)</option>
              <option value="NUMERIC">Numeric Value</option>
              <option value="CURRENCY">Currency</option>
              <option value="BOOLEAN">Completed/Not Completed</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Default scale for measuring progress on key results.
            </p>
          </div>
        </div>

        {/* Check-in Cadence */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Calendar className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Check-in Cadence</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recommended check-in frequency
            </label>
            <select
              {...register('checkInCadence')}
              className="input"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Bi-weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Recommended frequency for updating progress on key results.
            </p>
          </div>
        </div>

        {/* Reminders */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Bell className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Reminders</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('reminderEnabled')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Enable check-in reminders</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remind users every (days)
              </label>
              <input
                type="number"
                {...register('reminderDays', { min: 1, max: 30 })}
                className="input"
                min="1"
                max="30"
              />
              <p className="mt-1 text-xs text-gray-500">
                Number of days between reminder notifications.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

