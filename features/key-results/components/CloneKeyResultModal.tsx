'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Copy, Target, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Modal } from '@/components/ui'

interface CloneKeyResultModalProps {
  isOpen: boolean
  onClose: () => void
  keyResult: any
  users: any[]
  onSuccess?: () => void
}

interface KeyResultFormData {
  title: string
  description: string
  ownerId: string
  startValue: number
  targetValue: number
  unit: string
  useCarriedBaseline: boolean
  includeIncompleteTodos: boolean
}

export default function CloneKeyResultModal({
  isOpen,
  onClose,
  keyResult,
  users,
  onSuccess,
}: CloneKeyResultModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<KeyResultFormData>({
    defaultValues: {
      title: '',
      description: '',
      ownerId: '',
      startValue: 0,
      targetValue: 100,
      unit: '%',
      useCarriedBaseline: true,
      includeIncompleteTodos: false,
    },
  })

  const startValue = watch('startValue')
  const targetValue = watch('targetValue')

  useEffect(() => {
    if (isOpen && keyResult) {
      reset({
        title: `Copy of ${keyResult.title}`,
        description: keyResult.description || '',
        ownerId: keyResult.ownerId || '',
        startValue: keyResult.finalValue ?? keyResult.currentValue ?? keyResult.startValue ?? 0,
        targetValue: keyResult.targetValue || 100,
        unit: keyResult.unit || '%',
        useCarriedBaseline: true,
        includeIncompleteTodos: false,
      })
    }
  }, [isOpen, keyResult, reset])

  const onSubmit = async (data: KeyResultFormData) => {
    if (data.startValue >= data.targetValue) {
      toast.error('Target Value must be greater than Start Value.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/keyresults/${keyResult.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, objectiveId: keyResult.objectiveId }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Key Result rolled forward with its period history linked.')
        onClose()
        if (onSuccess) onSuccess()
        else window.location.reload()
      } else {
        toast.error(result.error || 'Failed to clone key result')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!keyResult) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Roll Forward Key Result" icon={Copy} iconClassName="text-primary" size="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <label htmlFor="title" className="block text-sm font-medium text-muted-foreground mb-2">
            Title <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="title"
            {...register('title', { required: 'Title is required' })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter key result title"
          />
          {errors.title && <p className="mt-1 text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="description" className="block text-sm font-medium text-muted-foreground mb-2">
            Description
          </label>
          <textarea
            id="description"
            {...register('description')}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter key result description (optional)"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="owner" className="block text-sm font-medium text-muted-foreground mb-2">
            Owner <span className="text-destructive">*</span>
          </label>
          <select
            id="owner"
            {...register('ownerId', { required: 'Owner is required' })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select an owner</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
          {errors.ownerId && <p className="mt-1 text-sm text-destructive">{errors.ownerId.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="startValue" className="block text-sm font-medium text-muted-foreground mb-2">
              Start Value
            </label>
            <input
              type="number"
              id="startValue"
              {...register('startValue', {
                required: 'Start value is required',
                min: { value: 0, message: 'Start value must be 0 or greater' },
              })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0"
            />
            {errors.startValue && <p className="mt-1 text-sm text-destructive">{errors.startValue.message}</p>}
          </div>

          <div>
            <label htmlFor="targetValue" className="block text-sm font-medium text-muted-foreground mb-2">
              Target Value <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              id="targetValue"
              {...register('targetValue', {
                required: 'Target value is required',
                min: { value: 0.01, message: 'Target value must be greater than 0' },
              })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="100"
            />
            {errors.targetValue && <p className="mt-1 text-sm text-destructive">{errors.targetValue.message}</p>}
          </div>
        </div>

        <label className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <input type="checkbox" {...register('useCarriedBaseline')} className="mt-0.5 size-4 rounded border-border accent-primary" />
          <span>
            <span className="block text-sm font-medium text-foreground">Use previous final value as baseline</span>
            <span className="mt-1 block text-xs text-muted-foreground">The new period starts at this banked value with 0% new progress.</span>
          </span>
        </label>

        <label className="mb-4 flex items-start gap-3 rounded-lg border border-border p-3">
          <input type="checkbox" {...register('includeIncompleteTodos')} className="mt-0.5 size-4 rounded border-border accent-primary" />
          <span>
            <span className="block text-sm font-medium text-foreground">Carry incomplete initiatives</span>
            <span className="mt-1 block text-xs text-muted-foreground">Completed and cancelled work stays in the previous period.</span>
          </span>
        </label>

        <div className="mb-6">
          <label htmlFor="unit" className="block text-sm font-medium text-muted-foreground mb-2">
            Unit
          </label>
          <select
            id="unit"
            {...register('unit')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="%">% (percent)</option>
            <option value="pcs">pcs (pieces)</option>
            <option value="qty">qty (quantity)</option>
            <option value="ETB">ETB (birr)</option>
            <option value="time">time (hours)</option>
            <option value="other">other</option>
          </select>
        </div>

        {startValue >= targetValue && startValue > 0 && targetValue > 0 && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <div className="flex items-center">
              <TrendingUp className="mr-2 size-4 text-destructive" />
              <p className="text-sm text-destructive">Target Value must be greater than Start Value.</p>
            </div>
          </div>
        )}

        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center">
            <Target className="mr-2 size-4 text-primary" />
            <p className="text-sm text-primary">
              Rolled-forward progress resets to 0% from a carried baseline of {startValue} {watch('unit')}.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || (startValue >= targetValue && startValue > 0 && targetValue > 0)}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Cloning...
              </div>
            ) : (
              'Clone Key Result'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
