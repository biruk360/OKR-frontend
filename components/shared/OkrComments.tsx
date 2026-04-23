'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { formatRelativeTime } from '@/lib/utils'
import RichTextEditor from './RichTextEditor'
import RichTextContent from './RichTextContent'

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
}

/**
 * Discussion thread backed by a Tiptap rich-text editor. Content is stored
 * and transmitted as sanitized HTML; legacy plaintext comments still render
 * via RichTextContent's plain-text fallback.
 */
export default function OkrComments({ endpoint, entityId }: Props) {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/${endpoint}/${entityId}/comments`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (res.success) setComments(res.data)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [endpoint, entityId])

  const submit = async () => {
    const content = value.trim()
    if (!content) return
    setSaving(true)
    try {
      const res = await fetch(`/api/${endpoint}/${entityId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to comment')
      setComments((prev) => [...prev, data.data])
      setValue('')
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
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {(c.author.name ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm text-foreground">{c.author.name ?? c.author.email}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(new Date(c.createdAt))}</span>
                </div>
                <RichTextContent html={c.content} className="text-sm text-foreground" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <RichTextEditor
          value={value}
          onChange={setValue}
          placeholder="Write a comment — Cmd/Ctrl+Enter to post."
          onSubmit={submit}
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            disabled={saving || !value.trim()}
            onClick={submit}
            className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </div>
    </section>
  )
}
