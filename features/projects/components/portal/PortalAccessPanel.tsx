'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Copy, Eye, KeyRound, Link2, Mail, UserMinus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  useInvitePortalUser,
  useProjectPortalAccess,
  useResetPortalCredential,
  useRevokePortalAccess,
  useSetPortalEnabled,
  type PortalAccountNode,
  type PortalAccountStatus,
  type PortalCredentialResult,
} from '../../hooks/useProject'
import { TextPromptDialog } from '../dialogs/TextPromptDialog'

/** Mirrors lib/projects/portal-accounts.ts (server re-validates). */
const PASSWORD_MIN = 10
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/

const STATUS_LABEL: Record<PortalAccountStatus, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invite sent',
  INVITE_EXPIRED: 'Invite expired',
  INACTIVE: 'Inactive',
}

const STATUS_TONE: Record<PortalAccountStatus, string> = {
  ACTIVE: 'bg-success-50 text-success-700',
  INVITED: 'bg-primary-50 text-primary-700',
  INVITE_EXPIRED: 'bg-warning-50 text-warning-700',
  INACTIVE: 'bg-surface-muted text-ink-secondary',
}

interface InviteForm {
  email: string
  name: string
  clientName: string
  mode: 'INVITE' | 'PASSWORD'
  sendEmail: boolean
  password: string
}

/** A readable random password with letters and digits (shown once to the PM). */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint32Array(14)
  crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('')
  return `${body.slice(0, 7)}-${body.slice(7)}${bytes[0] % 10}`
}

/**
 * Project settings → Client portal (remediation F5, spec I3).
 * Toggle `portalEnabled`, invite client contacts (invite link or temporary
 * password), re-issue credentials and revoke access. Writes go through
 * /api/projects/[id]/portal-users, which requires project write access and
 * audits every change. The client never sees who issued the invite.
 */
export function PortalAccessPanel({ projectId, projectClientName, canEdit }: { projectId: string; projectClientName: string; canEdit: boolean }) {
  const access = useProjectPortalAccess(projectId, canEdit)
  const setEnabled = useSetPortalEnabled(projectId)
  const invite = useInvitePortalUser(projectId)
  const reset = useResetPortalCredential(projectId)
  const revoke = useRevokePortalAccess(projectId)
  const [issued, setIssued] = useState<{ email: string; link: string | null; password: string | null; note: string } | null>(null)
  const [passwordFor, setPasswordFor] = useState<PortalAccountNode | null>(null)
  // Generated once per dialog open: TextPromptDialog resets its field when initialValue changes.
  const [passwordSeed, setPasswordSeed] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<PortalAccountNode | null>(null)

  const form = useForm<InviteForm>({
    defaultValues: { email: '', name: '', clientName: projectClientName, mode: 'INVITE', sendEmail: true, password: '' },
  })
  const mode = form.watch('mode')

  if (!canEdit) {
    return <p className="rounded-card border border-ink-primary/[0.08] p-4 text-body-sm text-ink-secondary">Only the project manager or an authorized management role can manage client portal access.</p>
  }
  if (access.isLoading) return <Skeleton className="h-40 w-full rounded-card" />
  if (access.isError || !access.data) {
    return <p className="rounded-card border border-danger-500/25 bg-danger-50 p-4 text-body-sm text-danger-700">Client portal settings could not be loaded.</p>
  }

  const { portalEnabled, accounts } = access.data
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const showIssued = (result: PortalCredentialResult, password: string | null) => {
    const link = result.invitePath ? `${origin}${result.invitePath}` : null
    const note = result.credentialChanged === false
      ? 'This email already had a portal account on another project. It now also has access to this project; its password is unchanged.'
      : link
        ? result.emailStatus === 'SENT' ? 'The invite link was emailed. You can also copy it below — it works once and expires in 7 days.' : 'Share this link with the client — it works once and expires in 7 days.'
        : 'Share this temporary password with the client through a separate, secure channel. It is not shown again.'
    setIssued({ email: result.account.email, link, password, note })
  }

  const submitInvite = form.handleSubmit(async (values) => {
    const credential = values.mode === 'PASSWORD'
      ? { mode: 'PASSWORD' as const, password: values.password }
      : { mode: 'INVITE' as const, sendEmail: values.sendEmail }
    try {
      const result = await invite.mutateAsync({ email: values.email, name: values.name, clientName: values.clientName, credential })
      showIssued(result, values.mode === 'PASSWORD' && result.credentialChanged !== false ? values.password : null)
      form.reset({ email: '', name: '', clientName: values.clientName, mode: values.mode, sendEmail: values.sendEmail, password: '' })
    } catch {
      // toast already shown by the mutation
    }
  })

  const copy = (value: string, label: string) => {
    void navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copied`))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-card border border-ink-primary/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-body font-semibold text-ink-primary">Client portal {portalEnabled ? 'on' : 'off'}</div>
          <p className="text-body-sm text-ink-secondary">
            {portalEnabled
              ? 'Invited client contacts can sign in and see this project’s anonymized schedule, published reports and client-visible files.'
              : 'No client can see this project, even with an account. Turn it on when the schedule is ready to share.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/portal/projects/${projectId}`} target="_blank" className="btn btn-outline btn-sm" aria-disabled={!portalEnabled}>
            <Eye className="mr-1 size-3.5" /> Preview as client
          </Link>
          <Button type="button" variant={portalEnabled ? 'outline' : 'default'} size="sm" disabled={setEnabled.isPending} onClick={() => setEnabled.mutate(!portalEnabled)}>
            {setEnabled.isPending ? 'Saving…' : portalEnabled ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
      </div>

      <form onSubmit={submitInvite} className="rounded-card border border-ink-primary/[0.08] bg-surface-muted/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-body-sm font-semibold text-ink-primary"><UserPlus className="size-4" /> Invite a client contact</div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Email</span>
            <input type="email" className={cn('input mt-1 w-full', form.formState.errors.email && 'border-danger-500')} placeholder="name@client.com"
              {...form.register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
            <span className="text-xs text-danger-600">{form.formState.errors.email?.message}</span>
          </label>
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Full name</span>
            <input className={cn('input mt-1 w-full', form.formState.errors.name && 'border-danger-500')} placeholder="Client contact"
              {...form.register('name', { required: 'Name is required', validate: (v) => v.trim().length >= 2 || 'Enter at least 2 characters' })} />
            <span className="text-xs text-danger-600">{form.formState.errors.name?.message}</span>
          </label>
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Company</span>
            <input className={cn('input mt-1 w-full', form.formState.errors.clientName && 'border-danger-500')}
              {...form.register('clientName', { required: 'Company is required', validate: (v) => v.trim().length >= 2 || 'Enter at least 2 characters' })} />
            <span className="text-xs text-danger-600">{form.formState.errors.clientName?.message}</span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-body-sm text-ink-primary">
          <label className="flex items-center gap-1.5"><input type="radio" value="INVITE" {...form.register('mode')} /> Invite link (client sets password)</label>
          <label className="flex items-center gap-1.5"><input type="radio" value="PASSWORD" {...form.register('mode')} /> Temporary password</label>
          {mode === 'INVITE' && (
            <label className="flex items-center gap-1.5 text-ink-secondary"><input type="checkbox" {...form.register('sendEmail')} /> <Mail className="size-3.5" /> Email the link</label>
          )}
        </div>
        {mode === 'PASSWORD' && (
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <label className="block min-w-[260px] flex-1">
              <span className="text-body-sm text-ink-secondary">Temporary password (min {PASSWORD_MIN}, letters and numbers)</span>
              <input className={cn('input mt-1 w-full font-mono', form.formState.errors.password && 'border-danger-500')} autoComplete="new-password"
                {...form.register('password', {
                  validate: (v) => form.getValues('mode') !== 'PASSWORD' || (v.length >= PASSWORD_MIN && PASSWORD_RULE.test(v)) || `At least ${PASSWORD_MIN} characters with letters and numbers`,
                })} />
              <span className="text-xs text-danger-600">{form.formState.errors.password?.message}</span>
            </label>
            <Button type="button" variant="outline" size="sm" className="mt-6" onClick={() => form.setValue('password', generatePassword(), { shouldValidate: true })}>
              <KeyRound className="mr-1 size-3.5" /> Generate
            </Button>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button type="submit" size="sm" disabled={invite.isPending}>{invite.isPending ? 'Granting…' : 'Grant access'}</Button>
        </div>
      </form>

      {issued && (
        <div className="rounded-card border border-primary-500/25 bg-primary-50 p-4 text-body-sm">
          <div className="font-semibold text-primary-800">Access ready for {issued.email}</div>
          <p className="mt-1 text-primary-700">{issued.note}</p>
          {issued.link && (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface-card px-2 py-1 text-xs text-ink-primary">{issued.link}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => copy(issued.link!, 'Invite link')}><Link2 className="mr-1 size-3.5" /> Copy link</Button>
            </div>
          )}
          {issued.password && (
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-surface-card px-2 py-1 font-mono text-xs text-ink-primary">{issued.password}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => copy(issued.password!, 'Password')}><Copy className="mr-1 size-3.5" /> Copy</Button>
            </div>
          )}
          <button type="button" className="mt-2 text-xs text-primary-700 hover:underline" onClick={() => setIssued(null)}>Done</button>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState icon={UserPlus} title="No client accounts yet" description="Invite a client contact above. They will only ever see this project’s anonymized, client-visible data." />
      ) : (
        <div className="overflow-hidden rounded-card border border-ink-primary/[0.08]">
          <div className="hidden grid-cols-[1.4fr_1fr_110px_120px_auto] gap-2 bg-surface-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary md:grid">
            <span>Contact</span><span>Company</span><span>Status</span><span>Last sign-in</span><span className="text-right">Actions</span>
          </div>
          {accounts.map((account) => (
            <div key={account.id} className="grid gap-2 border-t border-ink-primary/[0.05] px-3 py-2 text-body-sm md:grid-cols-[1.4fr_1fr_110px_120px_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-primary">{account.name}</div>
                <div className="truncate text-xs text-ink-tertiary">{account.email}</div>
              </div>
              <span className="truncate text-ink-secondary">{account.clientName}</span>
              <span><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[account.status])}>{STATUS_LABEL[account.status]}</span></span>
              <span className="text-xs text-ink-tertiary">{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleDateString() : 'Never'}</span>
              <div className="flex flex-wrap justify-end gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={reset.isPending}
                  onClick={async () => {
                    try {
                      const result = await reset.mutateAsync({ accountId: account.id, action: 'RESEND_INVITE' })
                      showIssued(result, null)
                    } catch { /* toast shown */ }
                  }}>
                  <Link2 className="mr-1 size-3.5" /> New invite link
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setPasswordSeed(generatePassword()); setPasswordFor(account) }}>
                  <KeyRound className="mr-1 size-3.5" /> Set password
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-danger-600" onClick={() => setRevokeTarget(account)}>
                  <UserMinus className="mr-1 size-3.5" /> Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TextPromptDialog
        open={!!passwordFor}
        onClose={() => setPasswordFor(null)}
        onSubmit={async (password) => {
          if (!passwordFor) return
          if (!PASSWORD_RULE.test(password)) {
            toast.error('Use letters and numbers')
            throw new Error('weak password')
          }
          const result = await reset.mutateAsync({ accountId: passwordFor.id, action: 'SET_PASSWORD', password })
          showIssued({ ...result, credentialChanged: true }, password)
        }}
        title={passwordFor ? `Temporary password for ${passwordFor.name}` : 'Temporary password'}
        message="Their current password and every open portal session stop working immediately. Share the new password through a separate, secure channel."
        label={`New password (min ${PASSWORD_MIN}, letters and numbers)`}
        confirmLabel="Set password"
        icon={KeyRound}
        minLength={PASSWORD_MIN}
        maxLength={200}
        initialValue={passwordSeed}
      />
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={async () => {
          if (!revokeTarget) return
          try {
            await revoke.mutateAsync({ accountId: revokeTarget.id })
            setRevokeTarget(null)
          } catch { /* toast shown */ }
        }}
        title="Revoke portal access"
        message={revokeTarget ? `Remove ${revokeTarget.name}’s access to this project?` : ''}
        description="They lose access on their next page load. If this was their only project, the account is deactivated. You can invite them again later."
        variant="danger"
        confirmLabel="Revoke access"
        isLoading={revoke.isPending}
      />
    </div>
  )
}
