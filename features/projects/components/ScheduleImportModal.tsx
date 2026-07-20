'use client'

import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { projectKeys } from '../hooks/useProjects'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  hasSchedule: boolean
}

interface Summary {
  phases: number
  milestones: number
  activities: number
  dependencies: number
  blockedActivities: number
}

export function ScheduleImportModal({ open, onClose, projectId, hasSchedule }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (busy) return
    setFile(null)
    setMode('append')
    setSummary(null)
    setErrors([])
    onClose()
  }

  const send = async (validateOnly: boolean) => {
    if (!file) return
    setBusy(true)
    setErrors([])
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('mode', mode)
      body.set('validateOnly', String(validateOnly))
      const response = await fetch(`/api/projects/${projectId}/schedule-import`, { method: 'POST', body })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) {
        setSummary(json.details?.summary ?? null)
        setErrors(json.details?.errors ?? [json.error || 'Schedule import failed.'])
        return
      }
      setSummary(json.data.summary)
      if (validateOnly) {
        toast.success('Schedule file is valid')
      } else {
        await queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
        await queryClient.invalidateQueries({ queryKey: projectKeys.all })
        toast.success(`${json.data.summary.activities} schedule activities imported`)
        setBusy(false)
        close()
        return
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Import Project Schedule" icon={FileSpreadsheet} size="lg" closeOnBackdrop={!busy} closeOnEsc={!busy}>
      <div className="space-y-5">
        <div className="rounded-card border border-primary-200 bg-primary-50 p-4">
          <div className="font-medium text-ink-primary">1. Download and complete the template</div>
          <p className="mt-1 text-body-sm text-ink-secondary">
            The template includes phases, milestones, activities, dates, responsibility, assignees, blockers, risks, subtasks, and dependency links.
          </p>
          <div className="mt-3 flex gap-2">
            <a className="btn btn-outline btn-sm" href={`/api/projects/${projectId}/schedule-import/template?format=xlsx`}>
              <Download className="size-4" /> Excel template
            </a>
            <a className="btn btn-outline btn-sm" href={`/api/projects/${projectId}/schedule-import/template?format=csv`}>
              <Download className="size-4" /> CSV template
            </a>
          </div>
        </div>

        <div>
          <div className="font-medium text-ink-primary">2. Select the completed file</div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setSummary(null)
              setErrors([])
            }}
          />
          <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-black/20 px-4 py-8 text-body text-ink-secondary hover:bg-surface-hover" onClick={() => inputRef.current?.click()}>
            <Upload className="size-5" />
            {file ? file.name : 'Choose CSV, XLS, or XLSX file (maximum 5 MB)'}
          </button>
        </div>

        {hasSchedule && (
          <div>
            <div className="font-medium text-ink-primary">3. Import behavior</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className={`cursor-pointer rounded-card border p-3 ${mode === 'append' ? 'border-primary-400 bg-primary-50' : 'border-black/10'}`}>
                <input className="mr-2" type="radio" checked={mode === 'append'} onChange={() => { setMode('append'); setSummary(null) }} />
                <span className="font-medium">Add to schedule</span>
                <span className="mt-1 block text-body-sm text-ink-secondary">Keep existing phases and append imported phases.</span>
              </label>
              <label className={`cursor-pointer rounded-card border p-3 ${mode === 'replace' ? 'border-danger-400 bg-danger-50' : 'border-black/10'}`}>
                <input className="mr-2" type="radio" checked={mode === 'replace'} onChange={() => { setMode('replace'); setSummary(null) }} />
                <span className="font-medium">Replace schedule</span>
                <span className="mt-1 block text-body-sm text-ink-secondary">Delete the current unbaselined schedule and import this file.</span>
              </label>
            </div>
          </div>
        )}

        {summary && errors.length === 0 && (
          <div className="flex items-start gap-2 rounded-card border border-success-500/30 bg-success-50 p-3 text-body-sm text-success-700">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>Valid: {summary.phases} phases, {summary.milestones} milestones, {summary.activities} activities, {summary.dependencies} dependencies, and {summary.blockedActivities} blocked activities.</span>
          </div>
        )}
        {errors.length > 0 && (
          <div className="rounded-card border border-danger-500/30 bg-danger-50 p-3">
            <div className="flex items-center gap-2 font-medium text-danger-700"><AlertTriangle className="size-4" /> Fix these issues before importing</div>
            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-body-sm text-danger-700">
              {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-black/[0.06] pt-4">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-outline" onClick={() => void send(true)} disabled={!file || busy}>{busy ? 'Checking…' : 'Validate File'}</button>
          <button type="button" className={mode === 'replace' ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => void send(false)} disabled={!file || !summary || errors.length > 0 || busy}>
            {busy ? 'Importing…' : mode === 'replace' ? 'Replace & Import' : 'Import Schedule'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
