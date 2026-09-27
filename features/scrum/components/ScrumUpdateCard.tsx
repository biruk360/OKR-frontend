'use client'

import { forwardRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, Flame, PartyPopper, MessageSquare, AlertTriangle, UserRound } from 'lucide-react'
import { Button, MiniBadge, Textarea, type MiniBadgeTone } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import RichTextContent from '@/components/shared/RichTextContent'
import { AttachmentList, AttachmentPicker, type CommentAttachmentDto } from '@/components/shared/CommentAttachments'
import { cn } from '@/lib/utils'
import { useAddScrumComment, useCelebrateScrumWin, useScrumComments } from '../hooks/queries'
import { escapeScrumHtml } from '../services/html'
import { ScrumEscalateBlockerDialog, ScrumResolveBlockerDialog } from './ScrumBlockerDialogs'

export type ScrumMemberMap = Map<string, { name: string; avatar?: string; email?: string }>

export interface ScrumUpdateCardProps {
  update: any
  tone: 'danger' | 'warning' | 'neutral'
  memberMap?: ScrumMemberMap
  currentUserId?: string
  highlighted?: boolean
  /** Only one rendering of an update carries the DOM anchor (the same update can appear in several sections). */
  anchor?: boolean
}

const BLOCKER_TONE: Record<string, MiniBadgeTone> = {
  OPEN: 'warn',
  RECURRING: 'warn',
  ESCALATED: 'danger',
  RESOLVED: 'ok',
}

export const ScrumUpdateCard = forwardRef<HTMLDivElement, ScrumUpdateCardProps>(function ScrumUpdateCard(
  { update, tone, memberMap, currentUserId, highlighted = false, anchor = true },
  ref,
) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [dialog, setDialog] = useState<'resolve' | 'escalate' | null>(null)
  const celebrate = useCelebrateScrumWin()
  const member = memberMap?.get(update.userId)
  const name = member?.name || member?.email || 'Team member'
  const avatar = member?.avatar
  const isOwn = !!currentUserId && update.userId === currentUserId
  const blockerOpen = update.hasBlocker && update.blockerStatus && update.blockerStatus !== 'RESOLVED'
  const canActOnBlocker = blockerOpen && update.viewerCanActOnBlocker === true
  const daysOpen = Number(update.blockerDaysOpen ?? 0)

  return (
    <div
      ref={ref}
      id={anchor ? `scrum-update-${update.id}` : undefined}
      className={cn(
        'scroll-mt-24 rounded-md border p-3 transition-shadow ease-apple',
        tone === 'danger' && 'border-danger-500/40 bg-danger-50',
        tone === 'warning' && 'border-warning-500/40 bg-warning-50',
        highlighted && 'ring-2 ring-primary-500 ring-offset-2',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-body-sm font-medium">
          {avatar ? <img src={avatar} alt="" className="size-5 rounded-full" /> : <UserRound className="size-4" aria-hidden="true" />}
          {name}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-ink-secondary">
          {update.isProxyEntry && <MiniBadge tone="warn">Proxy</MiniBadge>}
          {update.isLate && <MiniBadge>Late</MiniBadge>}
          {update.mood && <span>{label(update.mood)}</span>}
        </div>
      </div>

      {update.hasBlocker && update.blockerStatus && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm">
          <MiniBadge tone={BLOCKER_TONE[update.blockerStatus] ?? 'neutral'}>{label(update.blockerStatus)}</MiniBadge>
          {update.blockerCategory && <span className="text-ink-secondary">{label(update.blockerCategory)}</span>}
          {blockerOpen && daysOpen > 0 && (
            <span className={cn('inline-flex items-center gap-1', daysOpen >= 3 ? 'text-danger-700' : 'text-ink-secondary')}>
              {daysOpen >= 3 && <Flame className="size-3.5" aria-hidden="true" />}
              {daysOpen} {daysOpen === 1 ? 'day' : 'days'} open
            </span>
          )}
        </div>
      )}

      {/* Stored HTML is sanitized server-side AND rendered via DOMPurify — never raw innerHTML. */}
      {update.yesterdayDone && <RichTextContent html={update.yesterdayDone} className="mt-2 text-body-sm text-ink-secondary [&_p]:my-0" />}
      {update.blockers && <RichTextContent html={update.blockers} className="mt-2 text-body-sm text-danger-700 [&_p]:my-0" />}
      {update.todayPlan && <RichTextContent html={update.todayPlan} className="mt-2 text-body-sm [&_p]:my-0" />}
      {update.wins && <RichTextContent html={update.wins} className="mt-2 text-body-sm text-success-700 [&_p]:my-0" />}
      {update.remarks && <RichTextContent html={update.remarks} className="mt-2 text-body-sm text-ink-secondary [&_p]:my-0" />}
      {update.blockerStatus === 'RESOLVED' && update.blockerResolutionNote && (
        <p className="mt-2 text-body-sm text-success-700">Resolved: {update.blockerResolutionNote}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {update.hasWin && (
          <Button
            type="button"
            variant={update.celebratedByMe ? 'secondary' : 'outline'}
            size="sm"
            disabled={isOwn || update.celebratedByMe || celebrate.isPending}
            onClick={() => celebrate.mutate(update.id)}
            aria-label={isOwn ? 'Celebrations on your win' : update.celebratedByMe ? 'You celebrated this win' : `Celebrate ${name}'s win`}
          >
            <PartyPopper className="mr-1.5 size-4" aria-hidden="true" />
            {update.celebratedByMe ? 'Celebrated' : 'Celebrate'}
            {update.celebrationCount > 0 && <span className="ml-1 tabular-nums">{update.celebrationCount}</span>}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((open) => !open)}
        >
          <MessageSquare className="mr-1.5 size-4" aria-hidden="true" />
          Comment{update.commentCount > 0 ? ` (${update.commentCount})` : ''}
        </Button>
        {canActOnBlocker && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog('resolve')}>
              <CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" />Mark resolved
            </Button>
            {update.blockerStatus !== 'ESCALATED' && (
              <Button type="button" variant="destructive" size="sm" onClick={() => setDialog('escalate')}>
                <AlertTriangle className="mr-1.5 size-4" aria-hidden="true" />Escalate
              </Button>
            )}
          </>
        )}
      </div>

      {commentsOpen && <ScrumCommentThread updateId={update.id} />}

      {canActOnBlocker && (
        <>
          <ScrumResolveBlockerDialog updateId={update.id} open={dialog === 'resolve'} onClose={() => setDialog(null)} />
          <ScrumEscalateBlockerDialog updateId={update.id} open={dialog === 'escalate'} onClose={() => setDialog(null)} />
        </>
      )}
    </div>
  )
})

function ScrumCommentThread({ updateId }: { updateId: string }) {
  const comments = useScrumComments(updateId)
  const add = useAddScrumComment(updateId)
  const { register, handleSubmit, reset, watch } = useForm<{ body: string }>({ defaultValues: { body: '' } })
  const body = watch('body')
  // Files upload as they are picked (staged on this update) and are claimed by the post.
  const [staged, setStaged] = useState<CommentAttachmentDto[]>([])

  function submit(values: { body: string }) {
    const text = values.body.trim()
    if (!text) return
    // Plain text → escaped paragraphs; the route sanitizes again before storing.
    const html = text.split(/\n+/).map((line) => `<p>${escapeScrumHtml(line)}</p>`).join('')
    const payload = { body: html, attachmentIds: staged.map((a) => a.id) }
    add.mutate(payload, {
      onSuccess: () => {
        reset({ body: '' })
        setStaged([])
      },
    })
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {comments.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
      ) : comments.error ? (
        <p className="text-body-sm text-ink-secondary">Comments are not available for this update.</p>
      ) : (comments.data ?? []).length === 0 ? (
        <p className="text-body-sm text-ink-secondary">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {(comments.data ?? []).map((comment: any) => (
            <li key={comment.id} className="rounded-md bg-surface-card px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-body-sm">
                <span className="font-medium">{comment.author?.name ?? 'Team member'}</span>
                <span className="text-ink-secondary">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
              </div>
              <RichTextContent html={comment.body} className="text-body-sm [&_p]:my-0" />
              <AttachmentList attachments={(comment.attachments ?? []) as CommentAttachmentDto[]} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit(submit)} className="space-y-2">
        <Textarea rows={2} placeholder="Add a comment" aria-label="Add a comment" {...register('body')} />
        <AttachmentPicker
          scope="SCRUM"
          entityId={updateId}
          staged={staged}
          onStagedChange={setStaged}
          disabled={add.isPending}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={add.isPending || !body?.trim()}>Post comment</Button>
        </div>
      </form>
    </div>
  )
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
