'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { formatRelativeTime } from '@/lib/utils'

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
 * Discussion thread with @mention autocomplete. Fetches existing comments,
 * lets the viewer post a new one, and shows a popover of matching users when
 * the caret is inside an `@…` token.
 */
export default function OkrComments({ endpoint, entityId, users }: Props) {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  const matches = useMemo(() => {
    if (mentionQuery == null) return []
    const q = mentionQuery.toLowerCase()
    if (!q) return users.slice(0, 6)
    return users
      .filter((u) => {
        const name = (u.name ?? '').toLowerCase()
        const email = u.email.toLowerCase()
        return name.includes(q) || email.startsWith(q)
      })
      .slice(0, 6)
  }, [mentionQuery, users])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setValue(v)
    const caret = e.target.selectionStart
    const upto = v.slice(0, caret)
    const m = upto.match(/(?:^|\s)@([\w.\-]*)$/)
    if (m) {
      setMentionQuery(m[1] ?? '')
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (user: UserOption) => {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart
    const before = value.slice(0, caret)
    const after = value.slice(caret)
    const replaced = before.replace(/@([\w.\-]*)$/, `@${(user.name ?? user.email.split('@')[0]).replace(/\s+/g, '-')} `)
    const next = replaced + after
    setValue(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = replaced.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery != null && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => Math.min(matches.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(matches[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

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
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {renderContentWithMentions(c.content)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment — type @ to mention someone. Cmd/Ctrl+Enter to post."
          rows={3}
          className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {mentionQuery != null && matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-64 bg-card border border-border rounded-md shadow-lg py-1 text-sm">
            {matches.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(u)
                }}
                className={
                  'w-full text-left px-3 py-1.5 flex items-center gap-2 ' +
                  (i === mentionIndex ? 'bg-blue-50 text-blue-700' : 'text-muted-foreground hover:bg-muted')
                }
              >
                <span className="h-6 w-6 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center">
                  {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{u.name ?? u.email}</span>
                <span className="ml-auto text-xs text-muted-foreground truncate">{u.email}</span>
              </button>
            ))}
          </div>
        )}
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

function renderContentWithMentions(content: string) {
  const parts = content.split(/(@[\w.\-]+)/g)
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span key={i} className="text-blue-600 font-medium">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}
