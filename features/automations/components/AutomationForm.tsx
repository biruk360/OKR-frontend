'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertTriangle, Info, Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/PageHeader'
import { Textarea } from '@/components/ui/textarea'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import {
  DEFAULT_TIMEZONE,
  ODOO_ALLOWED_MODELS,
  OKR_QUERY_ENTITIES,
  WEEKDAYS,
  type OdooModel,
  type OkrQueryEntity,
  type PlanSpec,
  type PlanStep,
  type ScheduleSpec,
  type ToolGrant,
  type ScheduleKind,
  type Weekday,
} from '@/types/automations'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { diffPlans, summarizeDiff } from '@/lib/automations/plan-diff'
import {
  useAutomationTools,
  useCompileInstruction,
  useCreateAutomation,
  useUpdateAutomation,
} from '../hooks/useAutomations'
import type { AutomationDetail as AutomationDetailData } from '../types'
import { PlanDiffView } from './PlanDiffView'

/**
 * Plan authoring by form, for both creating and editing (FR-01, FR-02, FR-03).
 * The fields map one-to-one onto the PlanSpec the worker executes, so what a
 * user configures is literally what runs.
 *
 * One component for both modes on purpose: the plan a user edits must be built
 * by exactly the same code that built it originally, or the two drift and an
 * edit silently changes something the user never touched.
 */

type PlanDiffState = Parameters<typeof PlanDiffView>[0]['diff']

interface FormValues {
  name: string
  description: string
  instructionText: string
  scheduleKind: ScheduleKind
  atTime: string
  weekdaysOnly: boolean
  dayOfMonth: number
  objective: string
  relevanceCriteria: string
  titleTemplate: string
  scope: 'OWNER' | 'DEPARTMENT' | 'ORG'
  staleForDays: number
  limit: number
  odooModel: OdooModel
  odooStaleDays: number
  odooLimit: number
}

const ENTITY_LABELS: Record<OkrQueryEntity, string> = {
  objectives: 'Objectives',
  keyResults: 'Key results',
  todos: 'To-dos',
  projects: 'Projects',
  risks: 'Risks',
  sprints: 'Sprints',
}

/** Fields worth pulling per model. Identity fields are added by the tool itself. */
const ODOO_FIELD_PRESETS: Partial<Record<OdooModel, string[]>> = {
  'crm.lead': ['expected_revenue', 'probability', 'email_from', 'phone', 'date_deadline'],
  'sale.order': ['amount_total', 'date_order', 'state'],
  'sale.order.line': ['product_uom_qty', 'price_subtotal'],
  'account.move': ['amount_total', 'amount_residual', 'invoice_date_due', 'payment_state'],
  'res.partner': ['email', 'phone', 'city', 'country_id'],
  'project.task': ['date_deadline', 'priority', 'kanban_state'],
  'project.project': ['date_start', 'date'],
}

const ODOO_MODEL_LABELS: Record<OdooModel, string> = {
  'crm.lead': 'Leads / opportunities (crm.lead)',
  'crm.stage': 'CRM stages (crm.stage)',
  'sale.order': 'Sales orders (sale.order)',
  'sale.order.line': 'Sales order lines (sale.order.line)',
  'account.move': 'Invoices & bills (account.move)',
  'res.partner': 'Contacts (res.partner)',
  'project.task': 'Tasks (project.task)',
  'project.project': 'Projects (project.project)',
}

/**
 * Rebuild the form's state from a saved plan. The inverse of the submit handler
 * below — if you change one, change the other.
 */
function planToFormState(automation: AutomationDetailData) {
  const plan = automation.plan
  const schedule = plan.schedule
  const okrStep = plan.steps.find((step) => step.tool === 'okr.query')
  const odooStep = plan.steps.find((step) => step.tool === 'odoo.search')
  const okrParams = (okrStep?.params ?? {}) as Record<string, unknown>
  const odooParams = (odooStep?.params ?? {}) as Record<string, unknown>

  // The staleness window lives inside the templated domain, not as its own field.
  const domain = odooParams.domain as Array<[string, string, string]> | undefined
  const staleMatch = domain?.[0]?.[2]?.match(/\{\{now-(\d+)d\}\}/)

  return {
    values: {
      name: automation.name,
      description: automation.description ?? '',
      instructionText: automation.instructionText,
      scheduleKind: schedule.kind as ScheduleKind,
      atTime: schedule.atTime ?? '08:00',
      weekdaysOnly: schedule.weekdaysOnly ?? false,
      dayOfMonth: schedule.dayOfMonth ?? 1,
      objective: plan.synthesis.objective,
      relevanceCriteria: plan.synthesis.relevanceCriteria ?? '',
      titleTemplate: plan.briefing.titleTemplate,
      scope: (okrParams.scope as FormValues['scope']) ?? 'OWNER',
      staleForDays: (okrParams.staleForDays as number) ?? 14,
      limit: (okrParams.limit as number) ?? 100,
      odooModel: (odooParams.model as OdooModel) ?? 'crm.lead',
      odooStaleDays: staleMatch ? Number(staleMatch[1]) : 14,
      odooLimit: (odooParams.limit as number) ?? 50,
    } satisfies FormValues,
    entities: (okrParams.entities as OkrQueryEntity[]) ?? [],
    byDay: (schedule.byDay as Weekday[]) ?? ['MON'],
    recipientIds: (automation.recipients ?? []).map((r) => r.userId),
    odooEnabled: Boolean(odooStep),
  }
}

const SCHEDULE_KINDS: Array<{ value: ScheduleKind; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
]

export function AutomationForm({ automation }: { automation?: AutomationDetailData } = {}) {
  const router = useRouter()
  const isEdit = Boolean(automation)
  const initial = automation ? planToFormState(automation) : null
  const createAutomation = useCreateAutomation()
  const updateAutomation = useUpdateAutomation(automation?.id ?? '')
  const { data: catalog } = useAutomationTools()
  const compile = useCompileInstruction()
  const { users } = useUsersForSelection()

  const [entities, setEntities] = useState<OkrQueryEntity[]>(initial?.entities ?? ['keyResults'])
  const [byDay, setByDay] = useState<Weekday[]>(initial?.byDay ?? ['MON'])
  const [recipientIds, setRecipientIds] = useState<string[]>(initial?.recipientIds ?? [])
  const [odooEnabled, setOdooEnabled] = useState(initial?.odooEnabled ?? false)
  const [pendingSave, setPendingSave] = useState<{ plan: PlanSpec; grants: ToolGrant[]; values: FormValues } | null>(null)
  const [compileNotes, setCompileNotes] = useState<string | null>(null)
  const [compileDiff, setCompileDiff] = useState<PlanDiffState | null>(null)
  const [lastCompiledPlan, setLastCompiledPlan] = useState<PlanSpec | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<FormValues>({
    defaultValues: initial?.values ?? {
      name: '',
      description: '',
      instructionText: '',
      scheduleKind: 'WEEKLY',
      atTime: '08:00',
      weekdaysOnly: true,
      dayOfMonth: 1,
      objective: '',
      relevanceCriteria: '',
      titleTemplate: '{{date}} briefing',
      scope: 'OWNER',
      staleForDays: 14,
      limit: 100,
      odooModel: 'crm.lead',
      odooStaleDays: 14,
      odooLimit: 50,
    },
  })

  const scheduleKind = watch('scheduleKind')
  const odooModel = watch('odooModel')

  const odooTool = catalog?.tools.find((t) => t.tool === 'odoo.search')
  const odooUsable = Boolean(odooTool?.available && odooTool?.configured)

  const toggle = <T,>(list: T[], value: T, setter: (next: T[]) => void) => {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  /**
   * Compile the instruction and pour the result into the form. The user reviews
   * and edits it here — the plan is never saved straight from the model.
   */
  const runCompile = async () => {
    const instruction = getValues('instructionText')?.trim()
    if (!instruction || instruction.length < 10) {
      setError('Describe what the automation should do first — a sentence or two.')
      return
    }
    setError(null)
    setCompileNotes(null)
    setCompileDiff(null)

    try {
      // When editing, the meaningful comparison is against the plan that is
      // actually scheduled — not against a draft compiled a minute ago.
      const baseline = lastCompiledPlan ?? automation?.plan ?? null
      const result = await compile.mutateAsync({
        instruction,
        ...(baseline ? { previousPlan: baseline } : {}),
      })
      const schedule = result.plan.schedule as ScheduleSpec

      if (!getValues('name')) setValue('name', result.suggestedName)
      setValue('scheduleKind', schedule.kind)
      if (schedule.atTime) setValue('atTime', schedule.atTime)
      if (typeof schedule.weekdaysOnly === 'boolean') setValue('weekdaysOnly', schedule.weekdaysOnly)
      if (schedule.dayOfMonth) setValue('dayOfMonth', schedule.dayOfMonth)
      if (schedule.byDay?.length) setByDay(schedule.byDay)

      setValue('objective', result.plan.synthesis.objective)
      setValue('relevanceCriteria', result.plan.synthesis.relevanceCriteria ?? '')
      setValue('titleTemplate', result.plan.briefing.titleTemplate)

      const okrStep = result.plan.steps.find((step) => step.tool === 'okr.query')
      if (okrStep) {
        const params = okrStep.params as Record<string, unknown>
        if (Array.isArray(params.entities)) setEntities(params.entities as OkrQueryEntity[])
        if (params.scope) setValue('scope', params.scope as FormValues['scope'])
        if (typeof params.staleForDays === 'number') setValue('staleForDays', params.staleForDays)
        if (typeof params.limit === 'number') setValue('limit', params.limit)
      } else {
        setEntities([])
      }

      const odooStep = result.plan.steps.find((step) => step.tool === 'odoo.search')
      if (odooStep && odooUsable) {
        const params = odooStep.params as Record<string, unknown>
        setOdooEnabled(true)
        setValue('odooModel', params.model as OdooModel)
        if (typeof params.limit === 'number') setValue('odooLimit', params.limit)
        // The staleness window lives inside the templated domain the compiler built.
        const domain = params.domain as Array<[string, string, string]> | undefined
        const match = domain?.[0]?.[2]?.match(/\{\{now-(\d+)d\}\}/)
        if (match) setValue('odooStaleDays', Number(match[1]))
      } else {
        setOdooEnabled(false)
      }

      setCompileNotes(result.notes || null)
      if (result.diff.hasChanges) setCompileDiff(result.diff)
      setLastCompiledPlan(result.plan)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (entities.length === 0 && !odooEnabled) {
      setError('Pick at least one source for the automation to read.')
      return
    }

    const steps: PlanStep[] = []
    const toolGrants: ToolGrant[] = []

    if (entities.length > 0) {
      steps.push({
        id: 's1',
        tool: 'okr.query',
        label: 'Collect internal data',
        params: {
          entities,
          scope: values.scope,
          ...(entities.includes('keyResults') && values.staleForDays ? { staleForDays: Number(values.staleForDays) } : {}),
          limit: Number(values.limit),
        },
      })
      toolGrants.push({ tool: 'okr.query' })
    }

    if (odooEnabled && odooUsable) {
      steps.push({
        id: 's2',
        tool: 'odoo.search',
        label: `Collect ${values.odooModel} records`,
        params: {
          model: values.odooModel,
          // Resolved by the worker before the call — never by the model.
          domain: [['write_date', '<', `{{now-${Number(values.odooStaleDays)}d}}`]],
          fields: ODOO_FIELD_PRESETS[values.odooModel] ?? [],
          limit: Number(values.odooLimit),
          order: 'write_date asc',
        },
      })
      // The grant pins the model, so editing the plan later cannot reach another one.
      toolGrants.push({ tool: 'odoo.search', params: { models: [values.odooModel], maxLimit: 200 } })
    }

    const plan: PlanSpec = {
      version: 1,
      schedule: {
        kind: values.scheduleKind,
        timezone: DEFAULT_TIMEZONE,
        atTime: values.atTime,
        ...(values.scheduleKind === 'DAILY' ? { weekdaysOnly: values.weekdaysOnly } : {}),
        ...(values.scheduleKind === 'WEEKLY' ? { byDay } : {}),
        ...(values.scheduleKind === 'MONTHLY' ? { dayOfMonth: Number(values.dayOfMonth) } : {}),
        ...(values.scheduleKind === 'QUARTERLY'
          ? { quarterSource: 'CALENDAR' as const, quarterOffset: 'LAST_DAY' as const }
          : {}),
        catchUpPolicy: 'SKIP',
      },
      steps,
      synthesis: {
        objective: values.objective,
        ...(values.relevanceCriteria ? { relevanceCriteria: values.relevanceCriteria } : {}),
        findingSchema: { dedupeKeyFields: ['title'], fields: ['status', 'owner', 'progress'] },
        maxFindings: 30,
      },
      briefing: { titleTemplate: values.titleTemplate },
      notify: {
        emailRecipients: recipientIds,
        inApp: true,
        onEmpty: 'SKIP',
      },
      limits: { maxCostUsd: 0.5, timeoutSeconds: 600 },
    }

    if (isEdit) {
      // Saving an edit rewrites what runs unattended, so a change that WIDENS
      // what the automation does is confirmed rather than applied silently.
      const diff = diffPlans(automation!.plan, plan)
      if (diff.changes.some((c) => c.widening)) {
        setPendingSave({ plan, grants: toolGrants, values })
        return
      }
      await persist(plan, toolGrants, values)
      return
    }

    await persist(plan, toolGrants, values)
  })

  const persist = async (plan: PlanSpec, toolGrants: ToolGrant[], values: FormValues) => {
    const recipients = recipientIds.map((userId) => ({ userId, channels: ['EMAIL' as const, 'IN_APP' as const] }))
    try {
      if (isEdit) {
        await updateAutomation.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          instructionText: values.instructionText,
          plan,
          toolGrants,
          recipients,
        })
        router.push(`/dashboard/automations/${automation!.id}`)
        return
      }
      const created = await createAutomation.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        instructionText: values.instructionText,
        plan,
        toolGrants,
        recipients,
      })
      router.push(`/dashboard/automations/${created.id}`)
    } catch (err) {
      setError((err as Error).message)
      setPendingSave(null)
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl">
      <PageHeader
        title={isEdit ? `Edit ${automation!.name}` : 'New automation'}
        description={
          isEdit
            ? `Saving creates plan version ${automation!.planVersion + 1}. Runs already queued keep the version they started with.`
            : 'It starts in dry run: it will produce briefings you can read, and send nothing to anyone until you promote it.'
        }
        breadcrumb={
          isEdit ? (
            <Link
              href={`/dashboard/automations/${automation!.id}`}
              className="text-body-sm text-ink-secondary hover:text-primary-600"
            >
              ← {automation!.name}
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-6">
        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">Basics</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Weekly stalled key results" {...register('name', { required: 'A name is required' })} />
              {errors.name && <p className="mt-1 text-body-sm text-danger-500">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" placeholder="What this is for" {...register('description')} />
            </div>
            <div>
              <Label htmlFor="instructionText">What should it do?</Label>
              <Textarea
                id="instructionText"
                rows={3}
                placeholder="Every Monday morning, find key results with no check-in for two weeks and tell me which ones are at risk."
                {...register('instructionText', { required: 'Describe what the automation should do' })}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={runCompile} disabled={compile.isPending}>
                  {compile.isPending
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    : <Sparkles className="mr-1.5 h-4 w-4" />}
                  {compile.isPending ? 'Compiling…' : 'Compile into a plan'}
                </Button>
                <p className="flex items-start gap-1.5 text-body-sm text-ink-secondary">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Fills the settings below. Review and edit them before saving — the plan is what runs, not the sentence.
                </p>
              </div>

              {compileNotes && (
                <div className="mt-3 rounded-card border border-surface-muted bg-surface-sidebar p-3">
                  <p className="text-body-sm font-medium text-ink-primary">What it assumed</p>
                  <p className="mt-1 whitespace-pre-wrap text-body-sm text-ink-secondary">{compileNotes}</p>
                </div>
              )}

              {compileDiff && (
                <div className="mt-3 rounded-card border border-surface-muted p-3">
                  <p className="mb-2 text-body-sm font-medium text-ink-primary">What re-compiling changed</p>
                  <PlanDiffView diff={compileDiff} />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">Schedule</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">Evaluated in {DEFAULT_TIMEZONE}.</p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_KINDS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1.5 text-body-sm transition-colors',
                    scheduleKind === option.value
                      ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                      : 'border-surface-muted text-ink-secondary hover:bg-surface-hover'
                  )}
                >
                  <input type="radio" value={option.value} className="sr-only" {...register('scheduleKind')} />
                  {option.label}
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="atTime">Time</Label>
                <Input id="atTime" type="time" {...register('atTime', { required: true })} />
              </div>

              {scheduleKind === 'MONTHLY' && (
                <div>
                  <Label htmlFor="dayOfMonth">Day of month</Label>
                  <Input id="dayOfMonth" type="number" min={1} max={31} {...register('dayOfMonth', { valueAsNumber: true })} />
                  <p className="mt-1 text-body-sm text-ink-secondary">A day past the end of a short month runs on the last day.</p>
                </div>
              )}
            </div>

            {scheduleKind === 'WEEKLY' && (
              <div>
                <Label>Days</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      type="button"
                      key={day}
                      onClick={() => toggle(byDay, day, setByDay)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-body-sm transition-colors',
                        byDay.includes(day)
                          ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                          : 'border-surface-muted text-ink-secondary hover:bg-surface-hover'
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {scheduleKind === 'DAILY' && (
              <label className="flex items-center gap-2 text-body-sm text-ink-primary">
                <input type="checkbox" {...register('weekdaysOnly')} />
                Weekdays only
              </label>
            )}
          </div>
        </section>

        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">What it reads</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">
            Runs as you — it can only see what you can already see.
          </p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {OKR_QUERY_ENTITIES.map((entity) => (
                <button
                  type="button"
                  key={entity}
                  onClick={() => toggle(entities, entity, setEntities)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-body-sm transition-colors',
                    entities.includes(entity)
                      ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                      : 'border-surface-muted text-ink-secondary hover:bg-surface-hover'
                  )}
                >
                  {ENTITY_LABELS[entity]}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="scope">Scope</Label>
                <select
                  id="scope"
                  className="mt-1 h-10 w-full rounded-md border border-surface-muted bg-surface-card px-3 text-body-sm"
                  {...register('scope')}
                >
                  <option value="OWNER">Mine only</option>
                  <option value="DEPARTMENT">My department</option>
                  <option value="ORG">Whole organisation</option>
                </select>
              </div>
              {entities.includes('keyResults') && (
                <div>
                  <Label htmlFor="staleForDays">Stale after (days)</Label>
                  <Input id="staleForDays" type="number" min={1} max={365} {...register('staleForDays', { valueAsNumber: true })} />
                </div>
              )}
              <div>
                <Label htmlFor="limit">Row limit</Label>
                <Input id="limit" type="number" min={1} max={500} {...register('limit', { valueAsNumber: true })} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-body font-semibold text-ink-primary">Odoo CRM &amp; ERP</h2>
              <p className="mt-1 text-body-sm text-ink-secondary">
                Read-only. The automation can never write back to Odoo.
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-body-sm text-ink-primary">
              <input
                type="checkbox"
                checked={odooEnabled}
                disabled={!odooUsable}
                onChange={(event) => setOdooEnabled(event.target.checked)}
              />
              Include
            </label>
          </div>

          {!odooUsable && (
            <p className="mt-3 flex items-start gap-1.5 text-body-sm text-ink-secondary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-500" />
              Odoo is not configured on this server. Set ODOO_URL, ODOO_DB, ODOO_USER and ODOO_KEY to enable it.
            </p>
          )}

          {odooEnabled && odooUsable && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label htmlFor="odooModel">Record type</Label>
                <select
                  id="odooModel"
                  className="mt-1 h-10 w-full rounded-md border border-surface-muted bg-surface-card px-3 text-body-sm"
                  {...register('odooModel')}
                >
                  {ODOO_ALLOWED_MODELS.map((model) => (
                    <option key={model} value={model}>{ODOO_MODEL_LABELS[model]}</option>
                  ))}
                </select>
                <p className="mt-1 text-body-sm text-ink-secondary">
                  This automation will be granted access to {odooModel} only.
                </p>
              </div>
              <div>
                <Label htmlFor="odooStaleDays">Untouched for (days)</Label>
                <Input id="odooStaleDays" type="number" min={1} max={365} {...register('odooStaleDays', { valueAsNumber: true })} />
              </div>
              <div>
                <Label htmlFor="odooLimit">Record limit</Label>
                <Input id="odooLimit" type="number" min={1} max={200} {...register('odooLimit', { valueAsNumber: true })} />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">The briefing</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="objective">What should the briefing cover?</Label>
              <Textarea
                id="objective"
                rows={2}
                placeholder="Surface key results with no check-in in two weeks, ranked by how far behind they are."
                {...register('objective', { required: 'Tell the automation what to look for' })}
              />
              {errors.objective && <p className="mt-1 text-body-sm text-danger-500">{errors.objective.message}</p>}
            </div>
            <div>
              <Label htmlFor="relevanceCriteria">Relevance criteria (optional)</Label>
              <Input id="relevanceCriteria" placeholder="Only key results below 50% progress" {...register('relevanceCriteria')} />
            </div>
            <div>
              <Label htmlFor="titleTemplate">Briefing title</Label>
              <Input id="titleTemplate" {...register('titleTemplate', { required: true })} />
              <p className="mt-1 text-body-sm text-ink-secondary">
                {'Supports {{date}}, {{month}}, {{year}}, {{quarter}}.'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">Recipients</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">
            They receive nothing until you promote this automation out of dry run.
          </p>
          <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
            {(users ?? []).map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  checked={recipientIds.includes(user.id)}
                  onChange={() => toggle(recipientIds, user.id, setRecipientIds)}
                />
                <span className="text-body-sm text-ink-primary">{user.name ?? user.email}</span>
                <span className="text-body-sm text-ink-secondary">{user.email}</span>
              </label>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-4 text-body-sm text-danger-500">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createAutomation.isPending || updateAutomation.isPending}>
            {(createAutomation.isPending || updateAutomation.isPending) && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            {isEdit ? 'Save changes' : 'Create automation'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingSave)}
        onClose={() => setPendingSave(null)}
        onConfirm={async () => {
          if (pendingSave) await persist(pendingSave.plan, pendingSave.grants, pendingSave.values)
        }}
        title="These changes widen what this automation does"
        message={
          pendingSave
            ? summarizeDiff(diffPlans(automation!.plan, pendingSave.plan))
            : ''
        }
        confirmLabel="Save anyway"
        variant="warning"
        isLoading={updateAutomation.isPending}
        extraContent={
          pendingSave ? (
            <div className="mt-3 max-h-64 overflow-y-auto">
              <PlanDiffView diff={diffPlans(automation!.plan, pendingSave.plan)} />
            </div>
          ) : undefined
        }
      />
    </form>
  )
}
