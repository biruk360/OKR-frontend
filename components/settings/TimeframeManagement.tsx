'use client'

import { useState, useEffect } from 'react'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { z } from 'zod'
import { Calendar, Plus, Edit, Trash2, Check, X } from 'lucide-react'
import { calculateTimeframeDates, getTimeframeTypeLabel, type TimeframeType } from '@/lib/timeframe-utils'
import toast from 'react-hot-toast'
// Shared Zod bridge (the repo has no @hookform/resolvers); imported by path to avoid the auth UI barrel.
import { zodFormResolver } from '@/features/auth/services/zod-resolver'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { SettingsSelect, type SettingsSelectOption } from './SettingsSelect'

const TIMEFRAME_TYPE_OPTIONS: SettingsSelectOption[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'SIX_MONTH', label: '6-Month' },
  { value: 'YEARLY', label: 'Yearly' },
]

const TIMEFRAME_TYPES = ['MONTHLY', 'QUARTERLY', 'SIX_MONTH', 'YEARLY'] as const

const timeframeFields = {
  name: z.string().trim().min(1, 'Name is required'),
  type: z.enum(TIMEFRAME_TYPES),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
}
const endAfterStart = (v: { startDate: string; endDate: string }) => !v.startDate || !v.endDate || v.endDate >= v.startDate

const createTimeframeSchema = z
  .object({ ...timeframeFields, baseDate: z.string().min(1, 'Base date is required') })
  .refine(endAfterStart, { path: ['endDate'], message: 'End date must be on or after the start date' })
const editTimeframeSchema = z
  .object(timeframeFields)
  .refine(endAfterStart, { path: ['endDate'], message: 'End date must be on or after the start date' })

type CreateTimeframeValues = z.infer<typeof createTimeframeSchema>
type EditTimeframeValues = z.infer<typeof editTimeframeSchema>

const todayInputValue = () => new Date().toISOString().split('T')[0]
const emptyCreateValues = (): CreateTimeframeValues => ({ name: '', type: 'QUARTERLY', startDate: '', endDate: '', baseDate: todayInputValue() })
const EMPTY_EDIT_VALUES: EditTimeframeValues = { name: '', type: 'QUARTERLY', startDate: '', endDate: '' }

/** First validation message, shown as a toast (matches the old submit-time checks). */
function firstError(errors: FieldErrors): string {
  for (const value of Object.values(errors)) {
    if (value && typeof value.message === 'string' && value.message) return value.message
  }
  return 'Please fill in all required fields'
}

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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const createForm = useForm<CreateTimeframeValues>({
    defaultValues: emptyCreateValues(),
    resolver: zodFormResolver<CreateTimeframeValues>(createTimeframeSchema),
  })
  const editForm = useForm<EditTimeframeValues>({
    defaultValues: EMPTY_EDIT_VALUES,
    resolver: zodFormResolver<EditTimeframeValues>(editTimeframeSchema),
  })
  const newTimeframe = createForm.watch()
  const editType = editForm.watch('type')

  // Auto-generate dates when type or base date changes
  useEffect(() => {
    if (newTimeframe.type && newTimeframe.baseDate) {
      const baseDate = new Date(newTimeframe.baseDate)
      const { startDate, endDate, name } = calculateTimeframeDates(newTimeframe.type as TimeframeType, baseDate)
      createForm.setValue('startDate', startDate.toISOString().split('T')[0])
      createForm.setValue('endDate', endDate.toISOString().split('T')[0])
      createForm.setValue('name', name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTimeframe.type, newTimeframe.baseDate])

  const handleCreateTimeframe = async (values: CreateTimeframeValues) => {
    const newTimeframe = values
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
        setTimeframesList(prev => [result.data, ...prev])
        createForm.reset(emptyCreateValues())
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

  const handleUpdateTimeframe = async (id: string, editTimeframe: EditTimeframeValues) => {
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
          tf.id === id ? data.data : tf
        ))
        setEditingId(null)
        editForm.reset(EMPTY_EDIT_VALUES)
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
          tf.id === id ? data.data : tf
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

  const handleDeleteTimeframe = async () => {
    const id = pendingDeleteId
    if (!id) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/timeframes/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setTimeframesList(prev => prev.filter(tf => tf.id !== id))
        setPendingDeleteId(null)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete timeframe')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const startEditing = (timeframe: Timeframe) => {
    editForm.reset({
      name: timeframe.name,
      type: (timeframe.type || 'QUARTERLY') as EditTimeframeValues['type'],
      startDate: toDateInputValue(timeframe.startDate),
      endDate: toDateInputValue(timeframe.endDate)
    })
    setEditingId(timeframe.id)
  }

  // Auto-generate dates when editing type changes (and on entering edit mode),
  // based on the current start date — same behaviour as before the RHF move.
  useEffect(() => {
    const current = editForm.getValues()
    if (editingId && editType && current.startDate) {
      const baseDate = new Date(current.startDate)
      const { startDate, endDate, name } = calculateTimeframeDates(editType as TimeframeType, baseDate)
      const newStart = startDate.toISOString().split('T')[0]
      const newEnd = endDate.toISOString().split('T')[0]
      // Only update if the calculated values differ
      if (current.startDate !== newStart) editForm.setValue('startDate', newStart)
      if (current.endDate !== newEnd) editForm.setValue('endDate', newEnd)
      if (current.name !== name) editForm.setValue('name', name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editType, editingId])

  const cancelEditing = () => {
    setEditingId(null)
    editForm.reset(EMPTY_EDIT_VALUES)
  }

  const submitCreate = createForm.handleSubmit(handleCreateTimeframe, (errors) => toast.error(firstError(errors)))
  const submitEdit = (id: string) => editForm.handleSubmit(
    (values) => handleUpdateTimeframe(id, values),
    (errors) => toast.error(firstError(errors)),
  )()

  return (
    <div className="bg-card shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-foreground">
            Timeframe Management
          </h3>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-primary-foreground bg-primary-600 hover:bg-primary-700 cursor-pointer relative z-10"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Timeframe
          </button>
        </div>

        {/* Create New Timeframe */}
        {isCreating && (
          <div className="mb-6 p-4 border border-border rounded-lg bg-muted">
            <h4 className="text-sm font-medium text-foreground mb-3">Create New Timeframe</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="timeframe-new-type" className="block text-sm font-medium text-muted-foreground mb-1">Timeframe Type *</label>
                <Controller
                  control={createForm.control}
                  name="type"
                  render={({ field }) => (
                    <SettingsSelect
                      id="timeframe-new-type"
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as CreateTimeframeValues['type'])}
                      options={TIMEFRAME_TYPE_OPTIONS}
                      className="mt-1"
                    />
                  )}
                />
              </div>
              <div>
                <label htmlFor="timeframe-new-base" className="block text-sm font-medium text-muted-foreground mb-1">Base Date *</label>
                <input
                  id="timeframe-new-base"
                  type="date"
                  {...createForm.register('baseDate')}
                  className="mt-1 block w-full border-border rounded-md shadow-sm focus:ring-ring focus:border-primary-500 sm:text-sm cursor-pointer relative z-10"
                />
                <p className="mt-1 text-xs text-muted-foreground">Start date will be auto-calculated</p>
              </div>
              <div>
                <label htmlFor="timeframe-new-name" className="block text-sm font-medium text-muted-foreground mb-1">Name (Auto-generated)</label>
                <input
                  id="timeframe-new-name"
                  type="text"
                  {...createForm.register('name')}
                  className="mt-1 block w-full border-border rounded-md shadow-sm focus:ring-ring focus:border-primary-500 sm:text-sm bg-muted"
                  placeholder="Auto-generated from type"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date Range</label>
                <div className="mt-1 text-sm text-muted-foreground">
                  <div>{newTimeframe.startDate ? new Date(newTimeframe.startDate).toLocaleDateString() : 'N/A'}</div>
                  <div className="text-xs">to</div>
                  <div>{newTimeframe.endDate ? new Date(newTimeframe.endDate).toLocaleDateString() : 'N/A'}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex space-x-3">
              <button
                type="button"
                onClick={submitCreate}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-primary-foreground bg-success-600 hover:bg-success-700 cursor-pointer relative z-10"
              >
                <Check className="h-4 w-4 mr-1" />
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="inline-flex items-center px-3 py-2 border border-border text-sm leading-4 font-medium rounded-md text-muted-foreground bg-card hover:bg-muted cursor-pointer relative z-10"
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
                    <label htmlFor={`timeframe-${timeframe.id}-type`} className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
                    <Controller
                      control={editForm.control}
                      name="type"
                      render={({ field }) => (
                        <SettingsSelect
                          id={`timeframe-${timeframe.id}-type`}
                          value={field.value}
                          onValueChange={(v) => field.onChange(v as EditTimeframeValues['type'])}
                          options={TIMEFRAME_TYPE_OPTIONS}
                        />
                      )}
                    />
                  </div>
                  <div>
                    <label htmlFor={`timeframe-${timeframe.id}-name`} className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
                    <input
                      id={`timeframe-${timeframe.id}-name`}
                      type="text"
                      {...editForm.register('name')}
                      className="block w-full border-border rounded-md shadow-sm focus:ring-ring focus:border-primary-500 sm:text-sm cursor-text relative z-10"
                    />
                  </div>
                  <div>
                    <label htmlFor={`timeframe-${timeframe.id}-start`} className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
                    <input
                      id={`timeframe-${timeframe.id}-start`}
                      type="date"
                      {...editForm.register('startDate')}
                      className="block w-full border-border rounded-md shadow-sm focus:ring-ring focus:border-primary-500 sm:text-sm cursor-pointer relative z-10"
                    />
                  </div>
                  <div>
                    <label htmlFor={`timeframe-${timeframe.id}-end`} className="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
                    <input
                      id={`timeframe-${timeframe.id}-end`}
                      type="date"
                      {...editForm.register('endDate')}
                      className="block w-full border-border rounded-md shadow-sm focus:ring-ring focus:border-primary-500 sm:text-sm cursor-pointer relative z-10"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Calendar className="h-5 w-5 text-muted-foreground mr-2" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-foreground">
                            {timeframe.name}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800">
                            {getTimeframeTypeLabel((timeframe.type || 'QUARTERLY') as TimeframeType)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(timeframe.startDate).toLocaleDateString()} - {new Date(timeframe.endDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      timeframe.isActive 
                        ? 'bg-success-100 text-success-800' 
                        : 'bg-muted text-foreground'
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
                      onClick={() => submitEdit(timeframe.id)}
                      aria-label={`Save ${timeframe.name}`}
                      className="p-2 text-success-700 hover:text-success-700 cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      aria-label="Cancel editing"
                      className="p-2 text-muted-foreground hover:text-foreground cursor-pointer"
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
                          ? 'bg-muted text-muted-foreground hover:bg-muted'
                          : 'bg-success-100 text-success-700 hover:bg-success-200'
                      }`}
                    >
                      {timeframe.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditing(timeframe)}
                      aria-label={`Edit ${timeframe.name}`}
                      className="p-2 text-primary-600 hover:text-primary-700 cursor-pointer"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(timeframe.id)}
                      aria-label={`Delete ${timeframe.name}`}
                      className="p-2 text-danger-600 hover:text-danger-700 cursor-pointer"
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
          <EmptyState
            bare
            icon={Calendar}
            title="No timeframes"
            description="Get started by creating a new timeframe."
          />
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onClose={() => { if (!isDeleting) setPendingDeleteId(null) }}
        onConfirm={handleDeleteTimeframe}
        title="Delete timeframe"
        message="Are you sure you want to delete this timeframe? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </div>
  )
}
