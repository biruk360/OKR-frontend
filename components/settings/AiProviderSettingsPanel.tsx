'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, KeyRound, Save, ShieldCheck, Trash2, Wifi } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Button, Checkbox, ConfirmDialog } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'

interface AiProviderSettings {
  provider: 'openai'
  configured: boolean
  available: boolean
  source: 'database' | 'environment' | null
  maskedKey: string | null
  label: string | null
  lastVerifiedAt: string | null
  environmentFallbackConfigured: boolean
  canRemove: boolean
  featureEnabled: boolean
  model: string
  modelOptions: string[]
  dailyGenerationCap: number
  perUserCooldownMinutes: number
}

interface AiSettingsForm {
  apiKey: string
  label: string
  featureEnabled: boolean
  model: string
  dailyGenerationCap: number
  perUserCooldownMinutes: number
}

interface ConnectionTestResult {
  ok: boolean
  outcome: string
  message: string
  retryable: boolean
  verifiedAt: string | null
}

export default function AiProviderSettingsPanel() {
  const [settings, setSettings] = useState<AiProviderSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AiSettingsForm>({
    defaultValues: {
      apiKey: '',
      label: '',
      featureEnabled: false,
      model: '',
      dailyGenerationCap: 50,
      perUserCooldownMinutes: 30,
    },
  })

  const applySettings = useCallback((next: AiProviderSettings) => {
    setSettings(next)
    reset({
      apiKey: '',
      label: next.source === 'database' ? next.label ?? '' : '',
      featureEnabled: next.featureEnabled,
      model: next.model,
      dailyGenerationCap: next.dailyGenerationCap,
      perUserCooldownMinutes: next.perUserCooldownMinutes,
    })
  }, [reset])

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/settings/integrations/ai', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load AI settings')
      applySettings(result.data)
    } catch {
      setLoadError('AI integration settings could not be loaded. Try again.')
    } finally {
      setIsLoading(false)
    }
  }, [applySettings])

  useEffect(() => {
    void load()
  }, [load])

  async function save(values: AiSettingsForm) {
    try {
      const response = await fetch('/api/settings/integrations/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: values.apiKey.trim() || undefined,
          label: values.label.trim() || null,
          featureEnabled: values.featureEnabled,
          model: values.model,
          dailyGenerationCap: Number(values.dailyGenerationCap),
          perUserCooldownMinutes: Number(values.perUserCooldownMinutes),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save AI settings')
      applySettings(result.data)
      if (values.apiKey.trim()) setTestResult(null)
      toast.success(values.apiKey.trim() ? 'OpenAI key and settings saved' : 'AI settings saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save AI settings')
    }
  }

  async function removeCredential() {
    setIsRemoving(true)
    try {
      const response = await fetch('/api/settings/integrations/ai', { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to remove the OpenAI key')
      applySettings(result.data)
      setTestResult(null)
      setRemoveOpen(false)
      toast.success('Stored OpenAI key removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove the OpenAI key')
    } finally {
      setIsRemoving(false)
    }
  }

  async function testConnection() {
    setIsTesting(true)
    setTestResult(null)
    try {
      const response = await fetch('/api/settings/integrations/ai/test', { method: 'POST' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error('Unable to test the OpenAI connection')
      setTestResult(result.data)
      if (result.data.ok) toast.success('OpenAI connection verified')
      else toast.error(result.data.message)
      await load()
    } catch {
      setTestResult({
        ok: false,
        outcome: 'REQUEST_FAILED',
        message: 'The connection test could not be completed. Try again.',
        retryable: true,
        verifiedAt: null,
      })
      toast.error('The connection test could not be completed')
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) return <Skeleton className="h-[32rem] w-full rounded-card" />

  if (loadError || !settings) {
    return (
      <section className="rounded-card border border-danger-500/30 bg-surface-card p-6 shadow-card">
        <div className="flex items-start gap-3 text-danger-700">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-section-title">OpenAI project creation</h2>
            <p className="mt-1 text-body-sm">{loadError ?? 'AI integration settings are unavailable.'}</p>
            <Button className="mt-4" type="button" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const databaseKeyConfigured = settings.source === 'database'
  const availabilityLabel = !settings.featureEnabled
    ? 'Disabled'
    : settings.available
      ? 'Available'
      : settings.configured
        ? 'Needs verification'
        : 'Unavailable'
  const removalMessage = settings.environmentFallbackConfigured
    ? 'The encrypted database key will be removed. OPENAI_API_KEY will become the active fallback for future AI requests.'
    : 'The encrypted OpenAI key will be removed. AI-assisted project creation will become unavailable until another key is configured. Manual creation and deterministic file import are unaffected.'

  return (
    <>
      <section className="rounded-card bg-surface-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-section-title text-ink-primary">
              <KeyRound className="size-5" /> OpenAI project creation
            </div>
            <p className="mt-1 text-body-sm text-ink-secondary">
              Configure the server-side key, approved model, and generation limits for AI-assisted project planning.
            </p>
          </div>
          <span className={`rounded-pill px-3 py-1 text-body-sm font-semibold ${settings.featureEnabled && settings.available ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
            {availabilityLabel}
          </span>
        </div>

        <div className="mt-4 rounded-card border border-border bg-surface-muted px-4 py-3">
          <Controller
            name="featureEnabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="project-creation-ai-enabled"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  aria-label="Enable AI-assisted project creation"
                />
                <label htmlFor="project-creation-ai-enabled" className="cursor-pointer">
                  <span className="block text-body-sm font-semibold text-ink-primary">Enable AI-assisted project creation</span>
                  <span className="mt-1 block text-body-xs text-ink-secondary">
                    Independent of AI Sprint Planning. When disabled, project-creation AI options and endpoints remain unavailable.
                  </span>
                </label>
              </div>
            )}
          />
        </div>

        {!settings.configured && (
          <div className="mt-4 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm text-warning-700">
            <AlertTriangle className="mr-2 inline size-4" />
            No OpenAI key is configured. AI-assisted creation is unavailable; manual creation and deterministic file import remain unaffected.
          </div>
        )}

        {settings.featureEnabled && settings.configured && !settings.available && (
          <div className="mt-4 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm text-warning-700">
            <AlertTriangle className="mr-2 inline size-4" />
            The stored OpenAI key must pass connection testing before AI-assisted project creation becomes available.
          </div>
        )}

        {testResult && (
          <div className={`mt-4 rounded-card border px-4 py-3 text-body-sm ${testResult.ok ? 'border-success-500/30 bg-success-50 text-success-700' : 'border-warning-500/30 bg-warning-50 text-warning-700'}`}>
            {testResult.ok
              ? <CheckCircle2 className="mr-2 inline size-4" />
              : <AlertTriangle className="mr-2 inline size-4" />}
            <span className="font-semibold">{testResult.outcome.replace(/_/g, ' ')}:</span>{' '}
            {testResult.message}
          </div>
        )}

        {settings.maskedKey && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-muted px-4 py-3">
            <div>
              <div className="text-body-sm font-semibold text-ink-primary">Current key: {settings.maskedKey}</div>
              <div className="mt-1 text-body-xs text-ink-secondary">
                {databaseKeyConfigured ? settings.label || 'Stored in the encrypted database' : 'Managed by OPENAI_API_KEY on the server'}
              </div>
              {settings.lastVerifiedAt && (
                <div className="mt-1 text-body-xs text-ink-secondary">
                  Last verified {new Date(settings.lastVerifiedAt).toLocaleString()}
                </div>
              )}
            </div>
            <ShieldCheck className="size-5 text-success-600" />
          </div>
        )}

        <form className="mt-5 space-y-5" onSubmit={handleSubmit(save)}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={databaseKeyConfigured ? 'Replace or rotate OpenAI key' : 'OpenAI API key'} error={errors.apiKey?.message} hint="The full key is sent once and cleared immediately after saving. It is never returned by the API.">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={databaseKeyConfigured ? 'Enter a new key to rotate' : 'sk-…'}
                {...register('apiKey', {
                  minLength: { value: 12, message: 'OpenAI key is too short.' },
                  maxLength: { value: 512, message: 'OpenAI key is too long.' },
                  pattern: { value: /^sk-/, message: 'OpenAI key must start with sk-.' },
                })}
              />
            </Field>
            <Field label="Key label" error={errors.label?.message} hint="A safe identifier such as Production project key.">
              <input className="input" placeholder="Production project key" {...register('label', { maxLength: 100 })} />
            </Field>
            <Field label="Project creation model" error={errors.model?.message} hint="Only models approved by the server can be selected.">
              <select className="input" {...register('model', { required: 'Choose an approved model.' })}>
                {settings.modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </Field>
            <Field label="Daily generation cap" error={errors.dailyGenerationCap?.message} hint="Maximum successful project-plan generations per day.">
              <input className="input" type="number" min={1} max={1000} {...register('dailyGenerationCap', { valueAsNumber: true, required: true, min: 1, max: 1000 })} />
            </Field>
            <Field label="Per-user cooldown (minutes)" error={errors.perUserCooldownMinutes?.message} hint="Minimum time between project-plan generations for one user.">
              <input className="input" type="number" min={1} max={1440} {...register('perUserCooldownMinutes', { valueAsNumber: true, required: true, min: 1, max: 1440 })} />
            </Field>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={!settings.configured || isTesting} onClick={() => void testConnection()}>
              <Wifi className="size-4" /> {isTesting ? 'Testing…' : 'Test connection'}
            </Button>
            {settings.canRemove && (
              <Button type="button" variant="destructive" onClick={() => setRemoveOpen(true)}>
                <Trash2 className="size-4" /> Remove stored key
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              <Save className="size-4" /> {isSubmitting ? 'Saving…' : 'Save AI settings'}
            </Button>
          </div>
        </form>
      </section>

      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={removeCredential}
        title="Remove stored OpenAI key?"
        message="This changes which credentials future AI project planning can use."
        description={removalMessage}
        confirmLabel="Remove key"
        isLoading={isRemoving}
      />
    </>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block text-body-sm font-medium text-ink-primary">
      {label}
      <span className="mt-1 block">{children}</span>
      {error && <span className="mt-1 block text-body-xs text-danger-700">{error}</span>}
      {!error && hint && <span className="mt-1 block text-body-xs font-normal text-ink-tertiary">{hint}</span>}
    </label>
  )
}
