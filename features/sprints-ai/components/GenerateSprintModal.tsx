'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Sparkles, Hand, Loader2, Target, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { EntityPicker, type EntityPickerValue } from '@/components/ui/EntityPicker'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useOkrOptions } from '@/hooks/useOkrOptions'
import { cn } from '@/lib/utils'
import { AI_PROVIDER_LABELS, WIRED_AI_PROVIDERS, type WiredAiProviderId } from '@/lib/ai/providers/wired'

interface Props {
  open: boolean
  onClose: () => void
  /** The team sprint to attach AI-proposed todos to. Required. */
  sprintId: string
  /** Defaults to signed-in user. Leads/admins can override via the picker. */
  subjectUserId?: string
}

type Scope = 'AUTO' | 'MANUAL'

const sectionLabel = 'mb-2 text-overline uppercase text-ink-secondary'
const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors duration-[180ms] ease-apple focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30'

/**
 * Modal for generating AI tasks into an existing team sprint, scoped to one
 * subject user. Triggered from the sprint board header. The sprint must already
 * exist in PLANNING state with start/end dates.
 *
 * The user picker lets ADMIN/EXECUTIVE/DEPARTMENT_LEAD generate for any team
 * member; employees stay locked to themselves. MANUAL scope sends the picked
 * key results (and their objectives) as `keyResultIds` / `objectiveIds`, which
 * POST /api/sprints/ai/generate requires to be non-empty and ACTIVE.
 * The provider picker lists only providers wired in lib/ai/providers.
 */
export function GenerateSprintModal({ open, onClose, sprintId, subjectUserId }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const role = session?.user?.role
  const showProvider = role === 'ADMIN' || role === 'EXECUTIVE'
  const canPickUser = role === 'ADMIN' || role === 'EXECUTIVE' || role === 'DEPARTMENT_LEAD'
  const sessionUserId = session?.user?.id

  const [selectedSubject, setSelectedSubject] = useState<string | undefined>(subjectUserId ?? sessionUserId)
  const subject = selectedSubject ?? sessionUserId

  const { users, isLoading: loadingUsers } = useUsersForSelection({ enabled: open && canPickUser })

  const [scope, setScope] = useState<Scope>('AUTO')
  const [provider, setProvider] = useState<'default' | WiredAiProviderId>('default')
  const [picked, setPicked] = useState<EntityPickerValue[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Active objectives with their ACTIVE key results only — the API rejects any
  // non-active KR in MANUAL scope, so they are never offered.
  const { objectives, isLoading: loadingOkrs } = useOkrOptions({
    status: 'ACTIVE',
    requireKeyResults: true,
    enabled: open && scope === 'MANUAL',
  })
  const activeObjectives = useMemo(
    () =>
      objectives
        .map((o) => ({ ...o, keyResults: o.keyResults.filter((k) => !k.status || k.status === 'ACTIVE') }))
        .filter((o) => o.keyResults.length > 0),
    [objectives],
  )

  const manualReady = scope !== 'MANUAL' || picked.length > 0

  async function submit() {
    if (!subject) {
      toast.error('No subject — sign in first.')
      return
    }
    if (!manualReady) {
      toast.error('Pick at least one key result.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/sprints/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectUserId: subject,
          sprintId,
          mode: scope,
          ...(scope === 'MANUAL' && {
            keyResultIds: picked.map((p) => p.id),
            objectiveIds: Array.from(new Set(picked.map((p) => p.objectiveId))),
          }),
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
      router.push(`/dashboard/sprints/ai/${json.data.planId}?returnTo=/dashboard/sprints/${sprintId}`)
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
      title="Generate AI tasks"
      icon={Sparkles}
      iconClassName="text-primary"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !manualReady}>
            {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {submitting ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Subject user (admin/exec/lead only) */}
        {canPickUser && (
          <section>
            <label htmlFor="ai-sprint-subject" className={cn('block', sectionLabel)}>
              Generate for
            </label>
            <select
              id="ai-sprint-subject"
              value={selectedSubject ?? ''}
              onChange={(e) => {
                setSelectedSubject(e.target.value || undefined)
                setPicked([])
              }}
              disabled={loadingUsers}
              className={cn(selectClass, 'w-full max-w-sm')}
            >
              {sessionUserId && (
                <option value={sessionUserId}>
                  Myself{session?.user?.name ? ` (${session.user.name})` : ''}
                </option>
              )}
              {users
                .filter((u) => u.id !== sessionUserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email} — {u.role}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-ink-secondary">
              Tasks will be proposed against this user&apos;s OKRs and assigned to them on accept.
            </p>
          </section>
        )}

        {/* Provider (admin/exec only). Only wired providers are offered. */}
        {showProvider && (
          <section>
            <label htmlFor="ai-sprint-provider" className={cn('block', sectionLabel)}>
              AI provider
            </label>
            <select
              id="ai-sprint-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className={cn(selectClass, 'w-56')}
            >
              <option value="default">Org default</option>
              {WIRED_AI_PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {AI_PROVIDER_LABELS[id]}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* Scope */}
        <section>
          <div className={sectionLabel}>Scope</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScopeCard
              icon={Sparkles}
              title="Let AI pick OKRs"
              subtitle="Recommended. The AI reviews this user's active objectives and key results and chooses what to plan around."
              selected={scope === 'AUTO'}
              onClick={() => setScope('AUTO')}
            />
            <ScopeCard
              icon={Hand}
              title="I'll choose OKRs"
              subtitle="Pick specific key results to focus on."
              selected={scope === 'MANUAL'}
              onClick={() => setScope('MANUAL')}
            />
          </div>

          {scope === 'MANUAL' && (
            <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
              <EntityPicker
                value={null}
                onChange={(value) => {
                  if (value && value.kind === 'keyResult') {
                    setPicked((current) => (current.some((p) => p.id === value.id) ? current : [...current, value]))
                  }
                }}
                selectable="keyResult"
                objectives={activeObjectives}
                recentKey="ai-sprint-manual-okr-recent-v1"
                placeholder={loadingOkrs ? 'Loading key results…' : 'Add a key result…'}
                disabledIds={picked.map((p) => p.id)}
                emptyLabel="No active key results match."
                className="w-full"
              />
              {picked.length === 0 ? (
                <p className="text-xs text-ink-secondary">
                  Pick at least one active key result. The AI plans only around what you choose.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {picked.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-start gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-body-sm"
                    >
                      <Target className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-ink-primary">{p.title}</div>
                        <div className="truncate text-xs text-ink-secondary">{p.objectiveTitle}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${p.title}`}
                        onClick={() => setPicked((current) => current.filter((c) => c.id !== p.id))}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
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
}: {
  icon: typeof Sparkles
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'cursor-pointer rounded-card border p-3 text-left transition-colors duration-[180ms] ease-apple',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
      )}
    >
      <Icon className="size-4 text-primary" />
      <div className="mt-2 text-body-sm font-semibold text-ink-primary">{title}</div>
      <div className="mt-1 text-xs leading-snug text-ink-secondary">{subtitle}</div>
    </button>
  )
}
