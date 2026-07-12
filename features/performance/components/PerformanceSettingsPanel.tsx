'use client'

import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Loader2, Save } from 'lucide-react'
import { Button, Checkbox, Input, Label } from '@/components/ui'
import { usePerformanceSettings, useSavePerformanceSettings, type RecommendationRulesInput } from '../hooks/useSettings'
import { NativeSelect } from './NativeSelect'
import { SectionCard } from './SectionCard'

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

type FormValues = {
  varianceThreshold: number
  improvementFocusLimit: number
  remarkAttributionEnabled: boolean
  weeklyNudgeDay: number
  rules: RecommendationRulesInput
}

const RULE_TOGGLES: Array<{ key: keyof Omit<RecommendationRulesInput, 'criterionTrainingThreshold'>; label: string; hint: string }> = [
  {
    key: 'readySalaryAdjustment',
    label: 'Salary adjustment for "Ready" band',
    hint: 'Recommend SALARY_ADJUSTMENT when the decision band is Ready and the gatekeeper passes.',
  },
  {
    key: 'readyTopTierBonus',
    label: 'Top-tier bonus for "Ready" band',
    hint: 'Recommend a top-tier BONUS when the decision band is Ready and the gatekeeper passes.',
  },
  {
    key: 'readyPromotionRequiresImprovingTrend',
    label: 'Promotion requires improving trend',
    hint: 'When on, a PROMOTION recommendation also requires a higher normalized score than the prior finalized cycle.',
  },
  {
    key: 'onTrackBonus',
    label: 'Bonus for "On Track" band',
    hint: 'Recommend a BONUS when the decision band is On Track.',
  },
]

/**
 * Admin panel for the PerformanceSettings singleton — scoring variance,
 * improvement focus limit, remark attribution, weekly nudge day, and the
 * configurable reward recommendation rules. Saves via PATCH /api/performance/settings.
 */
export function PerformanceSettingsPanel() {
  const settingsQuery = usePerformanceSettings()
  const saveSettings = useSavePerformanceSettings()

  const form = useForm<FormValues>({
    defaultValues: {
      varianceThreshold: 3,
      improvementFocusLimit: 2,
      remarkAttributionEnabled: false,
      weeklyNudgeDay: 1,
      rules: {
        readyPromotionRequiresImprovingTrend: true,
        readySalaryAdjustment: true,
        readyTopTierBonus: true,
        onTrackBonus: true,
        criterionTrainingThreshold: 4,
      },
    },
  })
  const { register, control, handleSubmit, reset, formState: { errors, isDirty } } = form

  useEffect(() => {
    const data = settingsQuery.data
    if (!data) return
    reset({
      varianceThreshold: data.varianceThreshold,
      improvementFocusLimit: data.improvementFocusLimit,
      remarkAttributionEnabled: data.remarkAttributionEnabled,
      weeklyNudgeDay: data.weeklyNudgeDay,
      rules: data.recommendationRules,
    })
  }, [settingsQuery.data, reset])

  function onSubmit(values: FormValues) {
    saveSettings.mutate({
      varianceThreshold: values.varianceThreshold,
      improvementFocusLimit: values.improvementFocusLimit,
      remarkAttributionEnabled: values.remarkAttributionEnabled,
      weeklyNudgeDay: values.weeklyNudgeDay,
      recommendationRulesJson: values.rules,
    })
  }

  if (settingsQuery.isLoading) {
    return (
      <SectionCard title="Performance settings">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading settings…
        </div>
      </SectionCard>
    )
  }
  if (settingsQuery.isError) {
    return (
      <SectionCard title="Performance settings">
        <p className="text-sm text-danger-600">
          {settingsQuery.error instanceof Error ? settingsQuery.error.message : 'Failed to load settings'}
        </p>
      </SectionCard>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <SectionCard title="Scoring & calibration" contentClassName="space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="varianceThreshold">Calibration variance threshold</Label>
            <Input
              id="varianceThreshold"
              type="number"
              step="0.5"
              {...register('varianceThreshold', {
                valueAsNumber: true,
                validate: (value) => (Number.isFinite(value) && value > 0) || 'Must be a number greater than 0',
              })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Score spread between evaluators that flags a criterion for calibration.</p>
            {errors.varianceThreshold && <p className="mt-1 text-xs text-danger-600">{errors.varianceThreshold.message}</p>}
          </div>
          <div>
            <Label htmlFor="improvementFocusLimit">Improvement focus limit</Label>
            <Input
              id="improvementFocusLimit"
              type="number"
              {...register('improvementFocusLimit', {
                valueAsNumber: true,
                validate: (value) => (Number.isInteger(value) && value >= 1 && value <= 5) || 'Must be an integer between 1 and 5',
              })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Lowest-scoring criteria turned into improvement focuses at finalization (1–5).</p>
            {errors.improvementFocusLimit && <p className="mt-1 text-xs text-danger-600">{errors.improvementFocusLimit.message}</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Reports & nudges" contentClassName="space-y-4 px-4 py-4">
        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="remarkAttributionEnabled"
            render={({ field }) => (
              <Checkbox
                id="remarkAttributionEnabled"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <div>
            <Label htmlFor="remarkAttributionEnabled">Attribute remarks to evaluators</Label>
            <p className="text-xs text-muted-foreground">
              When on, report feedback shows evaluator names next to their remarks. Numeric scores are never shown either way.
            </p>
          </div>
        </div>
        <div className="sm:max-w-xs">
          <Label htmlFor="weeklyNudgeDay">Weekly nudge day</Label>
          <NativeSelect id="weeklyNudgeDay" {...register('weeklyNudgeDay', { valueAsNumber: true })}>
            {WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </NativeSelect>
          <p className="mt-1 text-xs text-muted-foreground">Day the weekly improvement-focus nudge email goes out.</p>
        </div>
      </SectionCard>

      <SectionCard title="Reward recommendation rules" contentClassName="space-y-4 px-4 py-4">
        <p className="text-xs text-muted-foreground">
          Applied when an evaluation is finalized. Recommendations always require approval — they are never executed automatically.
        </p>
        <div className="space-y-3">
          {RULE_TOGGLES.map((toggle) => (
            <div key={toggle.key} className="flex items-start gap-2">
              <Controller
                control={control}
                name={`rules.${toggle.key}` as const}
                render={({ field }) => (
                  <Checkbox
                    id={`rule-${toggle.key}`}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <div>
                <Label htmlFor={`rule-${toggle.key}`}>{toggle.label}</Label>
                <p className="text-xs text-muted-foreground">{toggle.hint}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="sm:max-w-xs">
          <Label htmlFor="criterionTrainingThreshold">Training threshold (score)</Label>
          <Input
            id="criterionTrainingThreshold"
            type="number"
            step="0.5"
            {...register('rules.criterionTrainingThreshold', {
              valueAsNumber: true,
              validate: (value) => (Number.isFinite(value) && value >= 0 && value <= 5) || 'Must be a number between 0 and 5',
            })}
          />
          <p className="mt-1 text-xs text-muted-foreground">Criteria consolidated below this score get a TRAINING recommendation (0 disables).</p>
          {errors.rules?.criterionTrainingThreshold && (
            <p className="mt-1 text-xs text-danger-600">{errors.rules.criterionTrainingThreshold.message}</p>
          )}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button type="submit" disabled={saveSettings.isPending || !isDirty}>
          {saveSettings.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save settings
        </Button>
      </div>
    </form>
  )
}
