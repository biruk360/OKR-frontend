'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Sparkles, Hand, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
  /** Defaults to signed-in user. v1 only supports self-subjects. */
  subjectUserId?: string
}

type Scope = 'AUTO' | 'MANUAL'

/**
 * Scope-selection modal for AI sprint generation.
 *
 * v1 supports AUTO scope (the AI picks). MANUAL scope card is rendered
 * disabled with a "Coming soon" label until the OkrPicker refactor lands.
 * Provider selection is shown only to ADMIN/EXECUTIVE; everyone else uses
 * the org default (set via OrganizationSettings.aiPreferredProvider).
 */
export function GenerateSprintModal({ open, onClose, subjectUserId }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const role = session?.user?.role
  const showProvider = role === 'ADMIN' || role === 'EXECUTIVE'
  const subject = subjectUserId ?? session?.user?.id

  const [scope, setScope] = useState<Scope>('AUTO')
  const [startDate, setStartDate] = useState(nextMondayIso())
  const [durationDays, setDurationDays] = useState(14)
  const [provider, setProvider] = useState<'default' | 'openai' | 'anthropic' | 'gemini'>('default')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!subject) {
      toast.error('No subject — sign in first.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/sprints/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectUserId: subject,
          startDate: new Date(startDate).toISOString(),
          durationDays,
          mode: scope,
          ...(provider !== 'default' && { provider }),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const msg = json.error || `Generation failed (${res.status})`
        toast.error(msg)
        return
      }
      toast.success('Plan generated — review it now.')
      onClose()
      router.push(`/dashboard/sprints/ai/${json.data.planId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate AI Sprint"
      icon={Sparkles}
      iconClassName="text-purple-500"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border h-8 px-3 text-[12px] font-medium"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || scope === 'MANUAL'}
            className="inline-flex items-center gap-1.5 rounded-[10px] h-8 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {submitting ? 'Generating…' : 'Generate Sprint'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Sprint window */}
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Sprint window
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col text-[12px]">
              <span className="text-muted-foreground mb-1">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-[8px] border h-8 px-2 text-[13px]"
                style={{ borderColor: 'var(--ap-border)' }}
              />
            </label>
            <label className="flex flex-col text-[12px]">
              <span className="text-muted-foreground mb-1">Duration</span>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="rounded-[8px] border h-8 px-2 text-[13px]"
                style={{ borderColor: 'var(--ap-border)' }}
              >
                <option value={10}>10 days</option>
                <option value={14}>14 days (default)</option>
                <option value={21}>21 days</option>
              </select>
            </label>
          </div>
        </section>

        {/* Provider (admin only) */}
        {showProvider && (
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              AI Provider
            </div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="rounded-[8px] border h-8 px-2 text-[13px] w-56"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <option value="default">Org default</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (not yet wired)</option>
              <option value="gemini">Gemini (not yet wired)</option>
            </select>
          </section>
        )}

        {/* Scope */}
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Scope
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ScopeCard
              icon={Sparkles}
              title="Let AI pick OKRs"
              subtitle="Recommended. The AI reviews all your active objectives and key results and chooses what to plan around."
              selected={scope === 'AUTO'}
              onClick={() => setScope('AUTO')}
            />
            <ScopeCard
              icon={Hand}
              title="I'll choose OKRs"
              subtitle="Pick specific objectives and key results to focus on this sprint."
              selected={scope === 'MANUAL'}
              onClick={() => setScope('MANUAL')}
              disabled
              disabledLabel="Coming soon"
            />
          </div>
          {scope === 'MANUAL' && (
            <div className="mt-3 rounded-[8px] border p-3 text-[12px] text-muted-foreground" style={{ borderColor: 'var(--ap-border)' }}>
              Manual OKR selection lands in a follow-up — for now use "Let AI pick OKRs".
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

function ScopeCard({
  icon: Icon,
  title,
  subtitle,
  selected,
  onClick,
  disabled,
  disabledLabel,
}: {
  icon: typeof Sparkles
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
  disabled?: boolean
  disabledLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`text-left rounded-[12px] border p-3 transition ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-purple-400 cursor-pointer'
      }`}
      style={{
        borderColor: selected ? 'rgb(124 58 237)' : 'var(--ap-border)',
        background: selected ? 'rgba(124 58 237 / 0.05)' : 'transparent',
      }}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-purple-600" />
        {disabled && disabledLabel && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {disabledLabel}
          </span>
        )}
      </div>
      <div className="mt-2 text-[13px] font-semibold">{title}</div>
      <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{subtitle}</div>
    </button>
  )
}

function nextMondayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const delta = ((1 - dow + 7) % 7) || 7
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}
