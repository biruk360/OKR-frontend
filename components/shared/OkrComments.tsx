'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageSquare } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import RichTextEditor from './RichTextEditor'
import { AttachmentPicker, AttachmentList, type CommentAttachmentDto } from './CommentAttachments'
import RichTextContent from './RichTextContent'
import { LinkPreviewList } from './LinkPreview'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import {
  OKR_REALTIME_EVENTS,
  keyResultRealtimeChannel,
  objectiveRealtimeChannel,
} from '@/lib/okr/realtime'

interface CommentAuthor {
  id: string
  name: string | null
  email: string
  avatar?: string | null
}

interface CommentRecord {
  id: string
  content: string
  createdAt: string
  author: CommentAuthor
  attachments?: CommentAttachmentDto[]
}

interface UserOption {
  id: string
  name: string | null
  email: string
}

interface Props {
  /** Either 'objectives' or 'keyresults' (matches the URL segment). */
  endpoint: 'objectives' | 'keyresults'
  entityId: string
  users: UserOption[]
  /** Viewer id — their own comment-added echoes are skipped (already appended locally). */
  currentUserId?: string | null
}

const COMMENT_EVENTS = [OKR_REALTIME_EVENTS.COMMENT_ADDED] as const

/**
 * Discussion thread backed by a Tiptap rich-text editor. Content is stored
 * and transmitted as sanitized HTML; legacy plaintext comments still render
 * via RichTextContent's plain-text fallback.
 */
export default function OkrComments({ endpoint, entityId, currentUserId }: Props) {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [staged, setStaged] = useState<CommentAttachmentDto[]>([])
  // Bumped by a realtime comment-added signal → silent refetch (no skeleton).
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    setLoading(true)
  }, [endpoint, entityId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${endpoint}/${entityId}/comments`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (res.success) setComments(res.data)
      })
      .catch(() => { /* keep the current thread; the next signal retries */ })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [endpoint, entityId, reloadTick])

  // Live thread: the comment POST routes signal `okr:comment-added` on the
  // entity's private channel (ids only). The payload is a signal — the thread is
  // refetched through the permission-checked comments API. The page-level
  // refresher (ObjectiveRealtimeRefresher / KeyResultDetailClient) subscribes to
  // the same channel with the same lifetime (both mount only for an unredacted
  // view); Pusher shares one channel object between them. A channel the viewer
  // may not see is refused by /api/pusher/auth and the hook drops it quietly.
  const reload = useCallback(() => setReloadTick((n) => n + 1), [])
  useRealtimeRefresh({
    channel: endpoint === 'objectives' ? objectiveRealtimeChannel(entityId) : keyResultRealtimeChannel(entityId),
    events: COMMENT_EVENTS,
    onRefresh: reload,
    ignoreActorId: currentUserId ?? null,
  })

  const submit = async () => {
    const content = value.trim()
    // An attachment on its own is a legitimate comment — a screenshot with no words.
    if (!content && staged.length === 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/${endpoint}/${entityId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachmentIds: staged.map((a) => a.id) }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to comment')
      setComments((prev) => [...prev, data.data])
      setValue('')
      setStaged([])
      toast.success('Comment posted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to post comment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-card shadow rounded-lg p-4 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Comments</h3>
        <span className="text-xs text-muted-foreground">{comments.length} total</span>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading comments">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <SkeletonAvatar size={32} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          bare
          icon={MessageSquare}
          title="No comments yet"
          description="Start the conversation."
        />
      ) : (
        <ul className="space-y-3">
          {/* Newest first — see TodoCardModal for the same reasoning. */}
          {[...comments].reverse().map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-primary-foreground text-xs font-semibold flex items-center justify-center shrink-0">
                {(c.author.name ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm text-foreground">{c.author.name ?? c.author.email}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(new Date(c.createdAt))}</span>
                </div>
                <RichTextContent html={c.content} className="text-sm text-foreground" />
                {/* Same link previews as the card thread (LPV-1..9): up to 3
                    external URLs per body, rendered from API data as text. */}
                <LinkPreviewList html={c.content} className="mt-2" />
                <AttachmentList attachments={c.attachments ?? []} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div data-comment-composer>
        <RichTextEditor
          value={value}
          onChange={setValue}
          placeholder="Write a comment — Cmd/Ctrl+Enter to post."
          onSubmit={submit}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <AttachmentPicker
            scope="OKR"
            entityId={entityId}
            staged={staged}
            onStagedChange={setStaged}
            disabled={saving}
          />
          <button
            type="button"
            disabled={saving || (!value.trim() && staged.length === 0)}
            onClick={submit}
            className="px-4 py-1.5 rounded-md bg-primary-600 text-primary-foreground text-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </div>
    </section>
  )
}
