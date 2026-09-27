'use client'

import Link from 'next/link'
import { Controller, useForm } from 'react-hook-form'
import { ArrowLeft, Save } from 'lucide-react'
import { Button, Checkbox, Input, Label, PageHeader } from '@/components/ui'
import { useSaveScrumSettings, useScrumSettings } from '../hooks/queries'
import { cloneElement, isValidElement, useEffect, useId } from 'react'

type FormValues = {
  reminderTime: string
  cutoffTime: string
  absentTime: string
  managerDigestTime: string
  nudgeTime: string
  weeklyDigestDay: number
  weeklyDigestTime: string
  moodEnabled: boolean
  winsEnabled: boolean
  proxyEntryEnabled: boolean
  telegramEnabled: boolean
  requireTodoLink: boolean
  recurringThresholdDays: number
  escalationThresholdDays: number
  moodAlertDays: number
  objectiveNeglectDays: number
}

export interface ScrumSettingsPageProps {
  /** Viewers with `scrum_settings` read but not write (e.g. department leads) see a locked form. */
  readOnly?: boolean
}

export function ScrumSettingsPage({ readOnly = false }: ScrumSettingsPageProps = {}) {
  const settings = useScrumSettings()
  const save = useSaveScrumSettings()
  const form = useForm<FormValues>()
  const { register, control, handleSubmit, reset } = form
  useEffect(() => { if (settings.data) reset(settings.data) }, [settings.data, reset])
  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <Link href="/dashboard/scrum" className="mb-3 inline-flex items-center gap-1 text-body-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="size-4" /> Daily Scrum
      </Link>
      <PageHeader
        title="Scrum Settings"
        description={readOnly ? 'View-only — ask an admin to change these settings.' : 'Timing, holidays, escalation, and feature switches.'}
      />
      <form onSubmit={handleSubmit((values) => { if (!readOnly) save.mutate(values) })} className="rounded-card bg-surface-card p-4 shadow-card">
        <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Reminder" input={<Input type="time" {...register('reminderTime')} />} />
          <Field label="Cutoff" input={<Input type="time" {...register('cutoffTime')} />} />
          <Field label="Absent finalization" input={<Input type="time" {...register('absentTime')} />} />
          <Field label="Manager digest" input={<Input type="time" {...register('managerDigestTime')} />} />
          <Field label="Nudge" input={<Input type="time" {...register('nudgeTime')} />} />
          <Field label="Weekly digest" input={<Input type="time" {...register('weeklyDigestTime')} />} />
          <Field label="Recurring blocker days" input={<Input type="number" {...register('recurringThresholdDays', { valueAsNumber: true })} />} />
          <Field label="Escalation days" input={<Input type="number" {...register('escalationThresholdDays', { valueAsNumber: true })} />} />
          <Field label="Mood alert days" input={<Input type="number" {...register('moodAlertDays', { valueAsNumber: true })} />} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(['moodEnabled', 'winsEnabled', 'proxyEntryEnabled', 'telegramEnabled', 'requireTodoLink'] as const).map((key) => (
            <Controller
              key={key}
              control={control}
              name={key}
              render={({ field }) => (
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  <span className="text-body-sm">{label(key)}</span>
                </label>
              )}
            />
          ))}
        </div>
        {!readOnly && (
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}><Save className="mr-2 size-4" />Save settings</Button>
          </div>
        )}
        </fieldset>
      </form>
    </div>
  )
}

function Field({ label, input }: { label: string; input: React.ReactNode }) {
  // Tie the visible label to the control so it has an accessible name.
  const id = useId()
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {isValidElement<{ id?: string }>(input) ? cloneElement(input, { id }) : input}
    </div>
  )
}

function label(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}
