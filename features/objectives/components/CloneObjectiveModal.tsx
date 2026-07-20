'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Copy, Check, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Modal } from '@/components/ui'
import { useTimeframes } from '@/hooks'

interface CloneObjectiveModalProps {
  isOpen: boolean
  onClose: () => void
  objective: any
  timeframes: any[]
}

interface CloneFormData {
  title: string
  timeframeId: string
  includeKeyResults: boolean
  includeIncompleteTodos: boolean
  keyResultOverrides: Record<string, { targetValue: number; startValue: number; useCarriedBaseline: boolean }>
}

export default function CloneObjectiveModal({ isOpen, onClose, objective, timeframes }: CloneObjectiveModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { timeframes: fetchedTimeframes } = useTimeframes({ enabled: isOpen })
  const availableTimeframes = fetchedTimeframes.length > 0 ? fetchedTimeframes : timeframes

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CloneFormData>({
    defaultValues: {
      title: `Copy of ${objective?.title || ''}`,
      timeframeId: '',
      includeKeyResults: true,
      includeIncompleteTodos: false,
      keyResultOverrides: {},
    },
  })

  const includeKeyResults = watch('includeKeyResults')

  useEffect(() => {
    if (isOpen && objective) {
      const nextTimeframe = [...availableTimeframes]
        .filter((candidate) => candidate.type === objective.timeframe?.type && new Date(candidate.startDate) > new Date(objective.timeframe?.endDate || 0))
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0]
      setValue('title', objective.title)
      setValue('includeKeyResults', true)
      setValue('includeIncompleteTodos', false)
      setValue('timeframeId', nextTimeframe?.id || '')
      setValue('keyResultOverrides', Object.fromEntries((objective.keyResults || []).map((kr: any) => {
        const carried = kr.finalValue ?? kr.currentValue ?? kr.startValue ?? 0
        return [kr.id, { targetValue: kr.targetValue, startValue: carried, useCarriedBaseline: true }]
      })))
    }
  }, [isOpen, objective, availableTimeframes, setValue])

  const onSubmit = async (data: CloneFormData) => {
    setIsLoading(true)

    try {
      const response = await fetch(`/api/objectives/${objective.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          timeframeId: data.timeframeId,
          includeKeyResults: data.includeKeyResults,
          includeIncompleteTodos: data.includeIncompleteTodos,
          keyResultOverrides: data.keyResultOverrides,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Objective rolled forward with its period history linked.')
        onClose()
        router.push(`/dashboard/objectives/${result.data.id}`)
      } else {
        toast.error(result.error || 'Failed to clone objective')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!objective) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Roll Forward Objective" icon={Copy} iconClassName="text-primary" size="lg">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-6">
          <label htmlFor="title" className="block text-sm font-medium text-muted-foreground mb-2">
            Objective Title
          </label>
          <input
            type="text"
            id="title"
            {...register('title', { required: 'Title is required' })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter objective title"
          />
          {errors.title && <p className="mt-1 text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="mb-6">
          <label htmlFor="timeframe" className="block text-sm font-medium text-muted-foreground mb-2">
            Timeframe <span className="text-destructive">*</span>
          </label>
          <select
            id="timeframe"
            {...register('timeframeId', { required: 'Timeframe is required' })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a timeframe</option>
            {availableTimeframes.map((timeframe) => {
              const typeLabel =
                timeframe.type === 'MONTHLY' ? 'Monthly' :
                timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                timeframe.type === 'SIX_MONTH' ? '6-Month' :
                timeframe.type === 'YEARLY' ? 'Yearly' : 'Quarterly'
              return (
                <option key={timeframe.id} value={timeframe.id}>
                  {timeframe.name} ({typeLabel}) - {new Date(timeframe.startDate).toLocaleDateString()} to {new Date(timeframe.endDate).toLocaleDateString()}
                </option>
              )
            })}
          </select>
          {errors.timeframeId && <p className="mt-1 text-sm text-destructive">{errors.timeframeId.message}</p>}
        </div>

        <div className="mb-6">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="includeKeyResults"
              {...register('includeKeyResults')}
              className="size-4 rounded border-border accent-primary focus:ring-ring"
            />
            <label htmlFor="includeKeyResults" className="ml-2 block text-sm text-muted-foreground">
              Include Key Results
            </label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {includeKeyResults
              ? `Will clone ${objective._count?.keyResults || 0} key result(s) with progress reset to 0`
              : 'Will create objective without key results'}
          </p>
        </div>

        {includeKeyResults && objective.keyResults?.length > 0 && (
          <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
            <h4 className="mb-3 text-sm font-medium text-foreground">Carried Key Result baselines</h4>
            <div className="space-y-4">
              {objective.keyResults?.map((kr: any) => (
                <div key={kr.id} className="rounded-md border border-border bg-background p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Check className="size-4 text-primary" /> {kr.title}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Carried start</label>
                      <input type="number" step="any" {...register(`keyResultOverrides.${kr.id}.startValue`, { valueAsNumber: true })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">New target</label>
                      <input type="number" step="any" {...register(`keyResultOverrides.${kr.id}.targetValue`, { valueAsNumber: true })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" {...register(`keyResultOverrides.${kr.id}.useCarriedBaseline`)} className="size-4 rounded border-border accent-primary" />
                    Use previous final value as the carried baseline
                  </label>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Each new Key Result starts at its carried value with 0% new-period progress. Check-ins and retrospectives are not copied.</p>
          </div>
        )}

        <label className="mb-6 flex items-start gap-3 rounded-lg border border-border p-3">
          <input type="checkbox" {...register('includeIncompleteTodos')} className="mt-0.5 size-4 rounded border-border accent-primary" />
          <span>
            <span className="block text-sm font-medium text-foreground">Carry incomplete linked initiatives</span>
            <span className="mt-1 block text-xs text-muted-foreground">Creates fresh pending copies; completed and cancelled work stays in the previous period.</span>
          </span>
        </label>

        <div className="flex items-center justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Cloning...
              </div>
            ) : (
              <span className="flex items-center gap-2">Roll forward <ArrowRight className="size-4" /></span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
