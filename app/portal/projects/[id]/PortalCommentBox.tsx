'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import type { ClientActivityComment } from '@/features/projects/services/portal-serializer'

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

interface PortalCommentBoxProps {
  projectId: string
  activityId: string
}

export default function PortalCommentBox({ projectId, activityId }: PortalCommentBoxProps) {
  const [comments, setComments] = useState<ClientActivityComment[]>([])
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endpoint = useMemo(
    () => `/api/portal/projects/${projectId}/activities/${activityId}/comments`,
    [projectId, activityId],
  )

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    fetch(endpoint)
      .then((res) => res.json() as Promise<ApiEnvelope<ClientActivityComment[]>>)
      .then((body) => {
        if (!alive) return
        if (body.success && body.data) {
          setComments(body.data)
          setError(null)
        } else {
          setError(body.error ?? 'Could not load comments.')
        }
      })
      .catch(() => {
        if (alive) setError('Could not load comments.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [endpoint])

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = content.trim()
    if (!text || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      const body = await res.json() as ApiEnvelope<ClientActivityComment[]>
      if (!res.ok || !body.success || !body.data) {
        setError(body.error ?? 'Could not post comment.')
        return
      }
      setComments(body.data)
      setContent('')
    } catch {
      setError('Could not post comment.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-card border border-black/[0.08] bg-white p-3">
      <div className="text-body-sm font-semibold text-ink-primary">Comments</div>
      <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
        {isLoading && <div className="text-body-xs text-ink-tertiary">Loading comments...</div>}
        {!isLoading && comments.length === 0 && <div className="text-body-xs text-ink-tertiary">No comments yet.</div>}
        {comments.map((comment) => (
          <CommentNode key={comment.id} comment={comment} />
        ))}
      </div>
      {error && <div className="mt-2 text-body-xs text-danger-600">{error}</div>}
      <form onSubmit={submitComment} className="mt-3 flex gap-2">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={2}
          maxLength={20000}
          className="min-h-12 flex-1 resize-y rounded-md border border-black/[0.12] bg-white px-3 py-2 text-body-sm text-ink-primary outline-none focus:border-primary-500"
          placeholder="Add a comment"
        />
        <button
          type="submit"
          disabled={isSaving || !content.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-600 text-white disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Post comment"
          title="Post comment"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}

function CommentNode({ comment }: { comment: ClientActivityComment }) {
  return (
    <div className="rounded-md bg-surface-muted px-3 py-2">
      <div className="text-body-xs font-semibold text-ink-secondary">{comment.author.name}</div>
      <div className="mt-1 whitespace-pre-wrap text-body-sm text-ink-primary">{stripHtml(comment.content)}</div>
      {comment.replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l border-black/[0.08] pl-3">
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} comment={reply} />
          ))}
        </div>
      )}
    </div>
  )
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
