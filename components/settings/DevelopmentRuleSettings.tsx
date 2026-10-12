'use client'

/**
 * DevelopmentRuleSettings — the organization-wide development plan rule
 * (DEV-3): every person should complete at least `devMinItems` certifications
 * or courses and log at least `devMinHours` training hours per (yearly)
 * timeframe. The profile's Development tab draws one progress bar for each.
 *
 * Reads and writes `OrganizationSettings` through /api/admin/org-settings
 * (GET: ADMIN / EXECUTIVE or `page.admin.org-settings`; PATCH: ADMIN /
 * EXECUTIVE). Shares the admin-org settings query key so the Organization
 * workspace sees the change without a reload.
 */
import { useEffect } from 'react'
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { GraduationCap, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  DEV_MIN_HOURS_MAX,
  DEV_MIN_ITEMS_MAX,
  orgSettingsPatchSchema,
} from '@/app/api/admin/org-settings/schema'

/** Same key as features/admin-org `useOrgSettings`, so both stay in sync. */
const ORG_SETTINGS_KEY = ['admin-org', 'settings'] as const
const ENDPOINT = '/api/admin/org-settings'

/** Schema defaults (prisma/schema.prisma OrganizationSettings). */
const DEFAULT_ITEMS = 1
const DEFAULT_HOURS = 40

interface DevelopmentRuleValues {
  devMinItems: number
  devMinHours: number
}

interface OrgSettingsRow extends Partial<DevelopmentRuleValues> {
  id: string
  updatedAt?: string
}

const ruleSchema = orgSettingsPatchSchema.pick({ devMinItems: true, devMinHours: true }).required()

const resolver: Resolver<DevelopmentRuleValues> = async (values) => {
  const errors: FieldErrors<DevelopmentRuleValues> = {}
  for (const field of ['devMinItems', 'devMinHours'] as const) {
    if (typeof values[field] !== 'number' || Number.isNaN(values[field])) {
      errors[field] = { type: 'required', message: 'Enter a number' }
    }
  }
  if (Object.keys(errors).length === 0) {
    const result = ruleSchema.safeParse(values)
    if (result.success) return { values: result.data, errors: {} }
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof DevelopmentRuleValues
      if (!errors[field]) errors[field] = { type: issue.code, message: issue.message }
    }
  }
  return { values: {}, errors }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `Request failed: ${res.status}`)
  }
  return json.data as T
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export interface DevelopmentRuleSettingsProps {
  className?: string
}

export function DevelopmentRuleSettings({ className }: DevelopmentRuleSettingsProps) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ORG_SETTINGS_KEY,
    queryFn: () => fetchJson<OrgSettingsRow>(ENDPOINT),
    staleTime: 60_000,
  })

  const saved: DevelopmentRuleValues = {
    devMinItems: query.data?.devMinItems ?? DEFAULT_ITEMS,
    devMinHours: query.data?.devMinHours ?? DEFAULT_HOURS,
  }

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<DevelopmentRuleValues>({ resolver, defaultValues: saved })

  // Load the stored values into the form once they arrive (and after a save).
  useEffect(() => {
    if (query.data) reset({ devMinItems: saved.devMinItems, devMinHours: saved.devMinHours })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.devMinItems, query.data?.devMinHours, reset])

  const mutation = useMutation({
    mutationFn: (body: DevelopmentRuleValues) =>
      fetchJson<OrgSettingsRow>(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ORG_SETTINGS_KEY })
      // Development plan views read the rule from their own list API.
      void qc.invalidateQueries({ queryKey: ['development-plan'] })
      toast.success('Development rule saved')
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the development rule'),
  })

  const items = watch('devMinItems')
  const hours = watch('devMinHours')
  const previewItems = typeof items === 'number' && !Number.isNaN(items) ? items : saved.devMinItems
  const previewHours = typeof hours === 'number' && !Number.isNaN(hours) ? hours : saved.devMinHours
  const isDefault = saved.devMinItems === DEFAULT_ITEMS && saved.devMinHours === DEFAULT_HOURS

  return (
    <section
      className={cn('rounded-card border border-border bg-card shadow-card', className)}
      aria-labelledby="development-rule-title"
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <GraduationCap className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h2 id="development-rule-title" className="text-section-title text-foreground">
            Development plan rule
          </h2>
          <p className="mt-0.5 text-body-sm text-muted-foreground">
            The yearly target every person&apos;s development plan is measured against. Each profile shows one
            progress bar for items and one for hours.
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          <p className="min-w-0 flex-1 text-body-sm text-[var(--ap-danger-fg)]">
            Could not load the organization settings.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dev-min-items">Certifications or courses completed</Label>
                <Input
                  id="dev-min-items"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={DEV_MIN_ITEMS_MAX}
                  step={1}
                  aria-invalid={Boolean(errors.devMinItems)}
                  aria-describedby="dev-min-items-hint"
                  {...register('devMinItems', { valueAsNumber: true })}
                />
                <p id="dev-min-items-hint" className="text-caption text-muted-foreground">
                  Items of kind certification or course marked done. 0 turns this bar off.
                </p>
                <FieldError message={errors.devMinItems?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dev-min-hours">Training hours logged</Label>
                <Input
                  id="dev-min-hours"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={DEV_MIN_HOURS_MAX}
                  step={0.25}
                  aria-invalid={Boolean(errors.devMinHours)}
                  aria-describedby="dev-min-hours-hint"
                  {...register('devMinHours', { valueAsNumber: true })}
                />
                <p id="dev-min-hours-hint" className="text-caption text-muted-foreground">
                  Hours logged across all development items. 0 turns this bar off.
                </p>
                <FieldError message={errors.devMinHours?.message} />
              </div>
            </div>

            <p className="rounded-lg bg-muted px-3 py-2 text-body-sm text-muted-foreground">
              Rule shown on profiles:{' '}
              <span className="font-medium text-foreground">
                ≥ {previewItems} {previewItems === 1 ? 'certification or course' : 'certifications or courses'} and ≥{' '}
                {formatHours(previewHours)} training hours
              </span>
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending || isDefault}
              onClick={() => mutation.mutate({ devMinItems: DEFAULT_ITEMS, devMinHours: DEFAULT_HOURS })}
              title={`Reset to ${DEFAULT_ITEMS} item and ${DEFAULT_HOURS} hours`}
            >
              <RotateCcw className="size-4" />
              Reset to default
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => reset()} disabled={!isDirty || mutation.isPending}>
                Discard changes
              </Button>
              <Button type="submit" disabled={!isDirty || mutation.isPending}>
                <Save className="size-4" />
                {mutation.isPending ? 'Saving…' : 'Save rule'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}

export default DevelopmentRuleSettings
