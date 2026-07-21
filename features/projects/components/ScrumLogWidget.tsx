'use client'

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { AlertTriangle, CalendarCheck, Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { useSaveScrumLog, useScrumLog, type ScrumAttendancePerson } from '../hooks/useProject'
import { ProjectDatePicker } from './ProjectDatePicker'

interface ScrumLogWidgetProps {
  projectId: string
  canEdit: boolean
}

interface FormValues {
  scrumDate: string
  timeHeld: string
  durationMin: number
  facilitatorId: string
  blockersRaised: string
  notes: string
}

type AttendanceState = 'ATTENDED' | 'LATE' | 'ABSENT'

export function ScrumLogWidget({ projectId, canEdit }: ScrumLogWidgetProps) {
  const query = useScrumLog(projectId)
  const save = useSaveScrumLog(projectId)
  const [attendance, setAttendance] = useState<Record<string, AttendanceState>>({})
  const today = todayKey()
  const nowTime = currentTime()
  const form = useForm<FormValues>({
    defaultValues: {
      scrumDate: today,
      timeHeld: nowTime,
      durationMin: 15,
      facilitatorId: '',
      blockersRaised: '',
      notes: '',
    },
  })
  const { control, register, handleSubmit, reset, watch } = form
  const selectedDate = watch('scrumDate')
  const people = query.data?.people ?? []
  const selectedLog = useMemo(
    () => query.data?.logs.find((log) => log.scrumDate === selectedDate),
    [query.data?.logs, selectedDate],
  )

  useEffect(() => {
    if (!query.data) return
    const firstPerson = query.data.people[0]
    const log = query.data.logs.find((row) => row.scrumDate === selectedDate)
    reset({
      scrumDate: selectedDate || today,
      timeHeld: log?.timeHeld ?? nowTime,
      durationMin: log?.durationMin ?? 15,
      facilitatorId: log?.facilitatorId ?? firstPerson?.userId ?? '',
      blockersRaised: log?.blockersRaised ?? '',
      notes: log?.notes ?? '',
    })
    const next: Record<string, AttendanceState> = {}
    for (const person of query.data.people) {
      next[person.userId] = log?.lateIds.includes(person.userId)
        ? 'LATE'
        : log?.absenteeIds.includes(person.userId)
          ? 'ABSENT'
          : 'ATTENDED'
    }
    setAttendance(next)
  }, [query.data, reset, selectedDate])

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-card" />
  if (!query.data || people.length === 0) {
    return <EmptyState icon={CalendarCheck} title="No project members" description="Add project members before logging daily scrum attendance." />
  }

  async function submit(values: FormValues) {
    const attendeeIds = people.filter((person) => attendance[person.userId] === 'ATTENDED').map((person) => person.userId)
    const lateIds = people.filter((person) => attendance[person.userId] === 'LATE').map((person) => person.userId)
    const absenteeIds = people.filter((person) => attendance[person.userId] === 'ABSENT').map((person) => person.userId)
    await save.mutateAsync({
      scrumDate: values.scrumDate,
      timeHeld: values.timeHeld,
      durationMin: Number(values.durationMin) || 15,
      facilitatorId: values.facilitatorId,
      attendeeIds,
      lateIds,
      absenteeIds,
      blockersRaised: values.blockersRaised || null,
      notes: values.notes || null,
    })
  }

  const summary = query.data.summary
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(360px,520px)_1fr]">
      <form onSubmit={handleSubmit(submit)} className="rounded-card bg-surface-card p-4 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-section-title text-ink-primary">
              <CalendarCheck className="size-5" /> Daily Scrum
            </div>
            <div className="mt-1 text-body-sm text-ink-secondary">{selectedLog ? 'Re-log edits the existing record for this date.' : 'Quick-log attendance for the project team.'}</div>
          </div>
          <Clock className="size-5 text-ink-tertiary" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="text-body-sm font-medium text-ink-secondary">Date</span>
            <Controller
              name="scrumDate"
              control={control}
              rules={{ required: true }}
              render={({ field }) => <ProjectDatePicker value={field.value} onChange={field.onChange} ariaLabel="Scrum date" disabled={!canEdit} allowClear={false} className="mt-1" />}
            />
          </label>
          <label>
            <span className="text-body-sm font-medium text-ink-secondary">Time held</span>
            <input className="input mt-1" type="time" disabled={!canEdit} {...register('timeHeld', { required: true })} />
          </label>
          <label>
            <span className="text-body-sm font-medium text-ink-secondary">Duration minutes</span>
            <input className="input mt-1" type="number" min={1} max={240} disabled={!canEdit} {...register('durationMin', { valueAsNumber: true, required: true })} />
          </label>
          <label>
            <span className="text-body-sm font-medium text-ink-secondary">Facilitator</span>
            <select className="input mt-1" disabled={!canEdit} {...register('facilitatorId', { required: true })}>
              {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-body-sm font-medium text-ink-secondary">Attendance</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((person) => (
              <AttendanceControl
                key={person.userId}
                person={person}
                value={attendance[person.userId] ?? 'ATTENDED'}
                disabled={!canEdit}
                onChange={(value) => setAttendance((current) => ({ ...current, [person.userId]: value }))}
              />
            ))}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-body-sm font-medium text-ink-secondary">Blockers raised</span>
          <textarea className="input mt-1 min-h-20" disabled={!canEdit} {...register('blockersRaised')} />
        </label>
        <label className="mt-3 block">
          <span className="text-body-sm font-medium text-ink-secondary">Notes</span>
          <textarea className="input mt-1 min-h-20" disabled={!canEdit} {...register('notes')} />
        </label>

        {canEdit && (
          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary" disabled={save.isPending} type="submit">
              {save.isPending ? 'Saving…' : selectedLog ? 'Update Scrum' : 'Log Scrum'}
            </button>
          </div>
        )}
      </form>

      <div className="rounded-card bg-surface-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-section-title text-ink-primary">Attendance Report</div>
          <div className="text-body-sm text-ink-secondary">{summary.totalScrumsHeld} held · {summary.teamAttendanceRate}% team</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-body-sm">
            <thead className="text-body-xs uppercase text-ink-tertiary">
              <tr>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 pr-3 font-medium">Rate</th>
                <th className="py-2 pr-3 font-medium">Attended</th>
                <th className="py-2 pr-3 font-medium">Late</th>
                <th className="py-2 pr-3 font-medium">Absent</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="py-2 pr-3">
                    <span className="text-ink-primary">{row.name}</span>
                    {row.flagged && <AlertTriangle className="ml-2 inline size-4 text-warning-600" />}
                  </td>
                  <td className={cn('py-2 pr-3 font-medium', row.flagged ? 'text-warning-700' : 'text-success-700')}>{row.attendanceRate}%</td>
                  <td className="py-2 pr-3">{row.attended}</td>
                  <td className="py-2 pr-3">{row.late}</td>
                  <td className="py-2 pr-3">{row.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary.rows.some((row) => row.flagged) && (
          <div className="mt-3 rounded-md border border-warning-500/30 bg-warning-50 px-3 py-2 text-body-sm text-warning-700">
            Attendance below 70% is flagged for R5 and Performance accountability.
          </div>
        )}
        <AttendanceHeatmap people={people} logs={query.data.logs.slice(0, 10).reverse()} />
      </div>
    </div>
  )
}

function AttendanceHeatmap({ people, logs }: { people: ScrumAttendancePerson[]; logs: Array<{ scrumDate: string; attendeeIds: string[]; lateIds: string[]; absenteeIds: string[] }> }) {
  if (logs.length === 0) return null
  return (
    <div className="mt-5">
      <div className="mb-2 text-body-sm font-semibold text-ink-primary">C16 Attendance Heatmap</div>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="grid gap-1" style={{ gridTemplateColumns: `140px repeat(${logs.length}, 32px)` }}>
            <div />
            {logs.map((log) => <div key={log.scrumDate} className="text-center text-[10px] text-ink-tertiary">{log.scrumDate.slice(5)}</div>)}
            {people.map((person) => (
              <HeatmapRow key={person.userId} person={person} logs={logs} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HeatmapRow({ person, logs }: { person: ScrumAttendancePerson; logs: Array<{ scrumDate: string; attendeeIds: string[]; lateIds: string[]; absenteeIds: string[] }> }) {
  return (
    <>
      <div className="truncate py-1 pr-2 text-body-xs text-ink-secondary">{person.name}</div>
      {logs.map((log) => {
        const state = log.lateIds.includes(person.userId)
          ? 'LATE'
          : log.attendeeIds.includes(person.userId)
            ? 'IN'
            : 'OUT'
        return (
          <div
            key={`${person.userId}-${log.scrumDate}`}
            title={`${person.name} · ${log.scrumDate} · ${state}`}
            className={cn(
              'h-6 rounded',
              state === 'IN' && 'bg-success-500',
              state === 'LATE' && 'bg-warning-500',
              state === 'OUT' && 'bg-danger-500',
            )}
          />
        )
      })}
    </>
  )
}

function AttendanceControl({
  person,
  value,
  disabled,
  onChange,
}: {
  person: ScrumAttendancePerson
  value: AttendanceState
  disabled: boolean
  onChange: (value: AttendanceState) => void
}) {
  return (
    <div className="rounded-md border border-border bg-surface-hover p-2">
      <div className="mb-2 truncate text-body-sm font-medium text-ink-primary">{person.name}</div>
      <div className="grid grid-cols-3 gap-1">
        {(['ATTENDED', 'LATE', 'ABSENT'] as AttendanceState[]).map((state) => (
          <button
            key={state}
            type="button"
            disabled={disabled}
            onClick={() => onChange(state)}
            className={cn(
              'rounded-md px-2 py-1 text-body-xs',
              value === state ? 'bg-primary-600 text-white' : 'bg-surface-card text-ink-secondary',
            )}
          >
            {state === 'ATTENDED' ? 'In' : state === 'LATE' ? 'Late' : 'Out'}
          </button>
        ))}
      </div>
    </div>
  )
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5)
}
