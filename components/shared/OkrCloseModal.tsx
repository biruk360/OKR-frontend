'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { LockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui'
import RichTextEditor from '@/components/shared/RichTextEditor'
import { cn } from '@/lib/utils'

type Outcome = 'ACHIEVED' | 'PARTIAL' | 'MISSED' | 'ABANDONED'

interface CloseFormData {
  outcome: Outcome
  finalGrade: number
  closureNote: string
  gradeRationale: string
  whatWasAchieved: string
  whatWentWell: string
  whatBlockedUs: string
  whatWeLearned: string
  primaryBlocker: string
  wouldSetAgain: string
  wasAmbitious: string
  recommendedAction: string
}

interface OkrCloseModalProps {
  open: boolean
  onClose: () => void
  entityType: 'objective' | 'keyResult'
  entity: any
  onInitiated?: () => void
  onCommitted?: () => void
  achievedShortcut?: boolean
}

const OUTCOMES: Array<{ value: Outcome; label: string; description: string }> = [
  { value: 'ACHIEVED', label: 'Achieved', description: 'The intended result was delivered.' },
  { value: 'PARTIAL', label: 'Partial', description: 'Meaningful progress, but the full result was not reached.' },
  { value: 'MISSED', label: 'Missed', description: 'The result was not achieved this period.' },
  { value: 'ABANDONED', label: 'Abandoned', description: 'Stopping was the healthy strategic choice.' },
]

const BLOCKERS = ['NONE', 'UNCLEAR_GOAL', 'INSUFFICIENT_RESOURCE', 'EXTERNAL_DEPENDENCY', 'SHIFTING_PRIORITY', 'TECHNICAL', 'CAPACITY', 'POOR_ESTIMATION', 'CLIENT_DELAY', 'SCOPE_CREEP', 'OTHER']
const ACTIONS = ['ROLL_FORWARD', 'ROLL_FORWARD_MODIFIED', 'ABANDON', 'COMPLETE_NO_ROLLOVER', 'SPLIT']

export default function OkrCloseModal({ open, onClose, entityType, entity, onInitiated, onCommitted, achievedShortcut = false }: OkrCloseModalProps) {
  const computedGrade = Math.min(1, Math.max(0, Number(entity?.progress ?? 0) / 100))
  const endpointType = entityType === 'objective' ? 'objectives' : 'keyresults'
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [evidence, setEvidence] = useState<any>(null)
  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<CloseFormData>()

  useEffect(() => {
    if (!open) return
    const closing = entity?.closureStatus === 'CLOSING'
    setStep(closing ? 2 : 1)
    reset({
      outcome: achievedShortcut ? 'ACHIEVED' : (entity?.outcome || 'PARTIAL'),
      finalGrade: achievedShortcut ? 1 : Number(entity?.finalGrade ?? Math.round(computedGrade * 20) / 20),
      closureNote: entity?.closureNote || '',
      gradeRationale: '',
      whatWasAchieved: '', whatWentWell: '', whatBlockedUs: '', whatWeLearned: '',
      primaryBlocker: 'NONE', wouldSetAgain: '', wasAmbitious: '', recommendedAction: '',
    })
    if (closing) {
      fetch(`/api/${endpointType}/${entity.id}/retrospective`)
        .then((response) => response.json())
        .then((result) => {
          if (!result.success) return
          const retro = result.data?.retrospective ?? result.data
          setEvidence(result.data?.evidence ?? null)
          if (retro) reset({
            outcome: entity.outcome || 'PARTIAL', finalGrade: Number(entity.finalGrade ?? computedGrade), closureNote: entity.closureNote || '',
            gradeRationale: retro.gradeRationale || '', whatWasAchieved: retro.whatWasAchieved || '', whatWentWell: retro.whatWentWell || '',
            whatBlockedUs: retro.whatBlockedUs || '', whatWeLearned: retro.whatWeLearned || '', primaryBlocker: retro.primaryBlocker || 'NONE',
            wouldSetAgain: retro.wouldSetAgain == null ? '' : String(retro.wouldSetAgain), wasAmbitious: retro.wasAmbitious == null ? '' : String(retro.wasAmbitious),
            recommendedAction: retro.recommendedAction || '',
          })
        })
        .catch(() => {})
    }
  }, [open, achievedShortcut, computedGrade, endpointType, entity, reset])

  const outcome = watch('outcome')
  const finalGrade = Number(watch('finalGrade') ?? computedGrade)
  const recommendedAction = watch('recommendedAction')
  const needsRationale = outcome !== 'ABANDONED' && Math.abs(finalGrade - computedGrade) > 0.15

  async function api(path: string, method: 'POST' | 'PUT', body?: unknown) {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) throw new Error(result.error || 'Request failed')
    return result.data
  }

  const saveGrade = async (values: CloseFormData) => {
    await api(`/api/${endpointType}/${entity.id}/close/initiate`, 'POST', {
      outcome: values.outcome,
      finalGrade: values.outcome === 'ABANDONED' ? null : Number(values.finalGrade),
      closureNote: values.closureNote,
      gradeRationale: values.gradeRationale,
    })
    onInitiated?.()
    setStep(2)
  }

  const saveRetro = async (values: CloseFormData) => {
    const saved = await api(`/api/${endpointType}/${entity.id}/retrospective`, 'PUT', {
      whatWasAchieved: values.whatWasAchieved, whatWentWell: values.whatWentWell, whatBlockedUs: values.whatBlockedUs,
      whatWeLearned: values.whatWeLearned, primaryBlocker: values.primaryBlocker,
      wouldSetAgain: values.wouldSetAgain === '' ? null : values.wouldSetAgain === 'true',
      wasAmbitious: values.wasAmbitious === '' ? null : values.wasAmbitious === 'true',
      recommendedAction: values.recommendedAction, gradeRationale: values.gradeRationale,
    })
    if (!saved.whatWasAchieved || !saved.whatWeLearned || !saved.recommendedAction) throw new Error('Complete all required retrospective fields')
    const previewResponse = await fetch(`/api/${endpointType}/${entity.id}/retrospective`)
    const previewResult = await previewResponse.json().catch(() => null)
    const preview = previewResult?.success ? previewResult.data : null
    if (preview?.evidence) setEvidence(preview.evidence)
    setStep(3)
  }

  const commit = async () => {
    await api(`/api/${endpointType}/${entity.id}/close/commit`, 'POST')
    toast.success(`${entityType === 'objective' ? 'Objective' : 'Key Result'} closed and locked.`)
    onInitiated?.()
    onClose()
    onCommitted?.()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Close ${entityType === 'objective' ? 'Objective' : 'Key Result'}`} icon={LockKeyhole} size="xl">
      <form onSubmit={handleSubmit(async (values) => {
        try {
          if (step === 1) await saveGrade(values)
          else if (step === 2) await saveRetro(values)
          else await commit()
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not continue close workflow') }
      })} className="space-y-6">
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
          {[['1', 'Grade'], ['2', 'Reflect'], ['3', 'Confirm & Lock']].map(([number, label], index) => (
            <span key={number} className={cn('rounded-full px-3 py-1 font-semibold', step === index + 1 ? 'bg-primary/10 text-primary' : 'bg-surface-muted')}>{number} · {label}</span>
          ))}
        </div>

        {step === 1 && <>
          <section className="rounded-card border border-border bg-surface p-5 shadow-card"><p className="text-label text-muted-foreground">Computed progress</p><div className="mt-1 flex items-end gap-3"><span className="text-page-title text-foreground">{Math.round(Number(entity?.progress ?? 0))}%</span><span className="pb-1 text-body-sm text-muted-foreground">Suggested grade {computedGrade.toFixed(2)}</span></div></section>
          <fieldset><legend className="mb-3 text-section-title text-foreground">Outcome</legend><div className="grid gap-3 sm:grid-cols-2">{OUTCOMES.map((item) => <label key={item.value} className={cn('cursor-pointer rounded-card border p-4 transition-colors', outcome === item.value ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-muted')}><input type="radio" value={item.value} {...register('outcome', { required: true })} className="sr-only" /><span className="block text-body font-semibold text-foreground">{item.label}</span><span className="mt-1 block text-body-sm text-muted-foreground">{item.description}</span></label>)}</div></fieldset>
          {outcome !== 'ABANDONED' && <div><div className="mb-2 flex items-center justify-between"><label htmlFor="final-grade" className="text-body font-semibold text-foreground">Final grade</label><span className="rounded-full bg-surface-muted px-3 py-1 text-body font-semibold text-foreground">{finalGrade.toFixed(2)}</span></div><input id="final-grade" type="range" min="0" max="1" step="0.05" {...register('finalGrade', { valueAsNumber: true })} className="w-full accent-primary" /><div className="relative mt-1 h-5 text-caption text-muted-foreground"><span className="absolute left-0">0.0</span><span className="absolute left-[70%] -translate-x-1/2 font-semibold text-success">0.7 win line</span><span className="absolute right-0">1.0</span></div></div>}
          {needsRationale && <div><label className="mb-2 block text-body font-semibold text-foreground">Why does your grade differ from computed progress?</label><textarea rows={3} {...register('gradeRationale', { required: 'An explanation is required' })} className="w-full rounded-card border border-border bg-surface px-3 py-2" />{errors.gradeRationale && <p className="mt-1 text-body-sm text-danger">{errors.gradeRationale.message}</p>}</div>}
          <div><label className="mb-2 block text-body font-semibold text-foreground">{outcome === 'ABANDONED' ? 'Why are we abandoning this?' : 'Closure note (optional)'}</label><textarea rows={3} maxLength={500} {...register('closureNote', { required: outcome === 'ABANDONED' ? 'An abandonment reason is required' : false })} className="w-full rounded-card border border-border bg-surface px-3 py-2" /></div>
        </>}

        {step === 2 && <>
          {evidence && <EvidencePanel evidence={evidence} />}
          <RichField name="whatWasAchieved" label="What was achieved?" required control={control} />
          <RichField name="whatWentWell" label="What went well?" control={control} />
          <RichField name="whatBlockedUs" label="What blocked us?" control={control} />
          <RichField name="whatWeLearned" label="What did we learn?" required control={control} />
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-body font-semibold text-foreground">Primary blocker<select {...register('primaryBlocker')} className="mt-2 w-full rounded-card border border-border bg-surface px-3 py-2 font-normal">{BLOCKERS.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label><label className="text-body font-semibold text-foreground">Recommended action<select {...register('recommendedAction', { required: 'Choose a recommended action' })} className="mt-2 w-full rounded-card border border-border bg-surface px-3 py-2 font-normal"><option value="">Choose…</option>{ACTIONS.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select>{errors.recommendedAction && <span className="text-body-sm text-danger">{errors.recommendedAction.message}</span>}</label></div>
          <div className="grid gap-4 sm:grid-cols-2"><BooleanSelect label="Would you set this OKR again?" registration={register('wouldSetAgain')} /><BooleanSelect label="Was this OKR ambitious?" registration={register('wasAmbitious')} /></div>
        </>}

        {step === 3 && <section className="space-y-4 rounded-card border border-border bg-surface p-6 shadow-card"><h3 className="text-section-title text-foreground">Ready to lock</h3><p className="text-body text-muted-foreground">Closing freezes the grade, progress, confidence, check-in history, labels, contributors, and retrospective. Reopening requires a reason and leaves a permanent audit scar.</p>{evidence && <EvidencePanel evidence={evidence} />}{['ROLL_FORWARD', 'ROLL_FORWARD_MODIFIED', 'SPLIT'].includes(recommendedAction) && <p className="rounded-card bg-primary/10 p-3 text-body-sm text-primary">After closing, use Clone to next period to carry this OKR forward with its lineage and baseline.</p>}</section>}

        <div className="flex justify-between gap-3 border-t border-border pt-4"><button type="button" onClick={() => step === 1 ? onClose() : setStep((step - 1) as 1 | 2)} className="btn-outline" disabled={isSubmitting}>{step === 1 ? 'Cancel' : 'Back'}</button><button type="submit" className={step === 3 ? 'btn-danger' : 'btn-primary'} disabled={isSubmitting}>{isSubmitting ? 'Saving…' : step === 1 ? 'Save grade & continue' : step === 2 ? 'Save reflection & continue' : 'Confirm & lock'}</button></div>
      </form>
    </Modal>
  )
}

function RichField({ name, label, required, control }: { name: keyof CloseFormData; label: string; required?: boolean; control: any }) {
  return <div><label className="mb-2 block text-body font-semibold text-foreground">{label}{required && <span className="text-danger"> *</span>}</label><Controller name={name} control={control} rules={required ? { required: `${label} is required` } : undefined} render={({ field, fieldState }) => <><RichTextEditor value={field.value || ''} onChange={field.onChange} minHeight={120} />{fieldState.error && <p className="mt-1 text-body-sm text-danger">{fieldState.error.message}</p>}</>} /></div>
}

function BooleanSelect({ label, registration }: { label: string; registration: any }) {
  return <label className="text-body font-semibold text-foreground">{label}<select {...registration} className="mt-2 w-full rounded-card border border-border bg-surface px-3 py-2 font-normal"><option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option></select></label>
}

function EvidencePanel({ evidence }: { evidence: any }) {
  return <div className="grid gap-3 rounded-card bg-surface-muted p-4 sm:grid-cols-4"><Evidence label="Check-ins" value={evidence.checkInCount ?? 0} /><Evidence label="Longest gap" value={`${evidence.longestGapDays ?? 0} days${evidence.hasLongGap ? ' ⚠' : ''}`} /><Evidence label="Todo completion" value={evidence.todoCompletionRate == null ? '—' : `${evidence.todoCompletionRate}%`} /><Evidence label="Days at risk" value={evidence.daysAtRisk ?? 0} /></div>
}

function Evidence({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-caption text-muted-foreground">{label}</p><p className="text-body font-semibold text-foreground">{value}</p></div>
}
