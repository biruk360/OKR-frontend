'use client'

/**
 * Trello-style card modal (the to-do "card"). This file owns the card's state,
 * data fetching and every API call; the presentational sections live beside it:
 *
 *   CardHeader       breadcrumb, complete toggle, title, metadata line
 *   CardAttributes   members / labels / due date / priority grid
 *   CardLinkedOkr    linked objective / key result + picker
 *   CardDescription  Tiptap description editor
 *   CardChecklists   checklists and their items
 *   CardAttachments  attachment grid (through the shared viewer)
 *   CardComments     composer, thread, replies, activity log
 *   CardRail         "Add to card" / "Actions" rail + watch/more/close cluster
 *   CardDatesPanel   start/due/recurrence/reminder panel
 *   CardPickers      member picker + labels panel (shared by grid and rail)
 *   CardModalBits    avatar, due badge, status/priority pills, progress bar
 *
 * Public API is unchanged: `TodoCardModal` and the `TodoCardData` type.
 * For pages that may never open a card, prefer `LazyTodoCardModal`.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AlertCircle, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { todoStatusMeta } from '@/lib/todo-status'
import { CARD_PALETTE, swatchStyle } from '@/lib/card-visuals'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import RichTextContent from '@/components/shared/RichTextContent'
import { LinkPreviewList } from '@/components/shared/LinkPreview'
import { useAttachmentViewer } from '@/components/shared/CommentAttachments'
import type { CommentAttachmentDto } from '@/components/shared/CommentAttachments'
import { copyToClipboard } from '@/components/shared/CopyLinkButton'
import { announce } from '@/components/shared/LiveAnnouncer'
import { CardHeader } from './CardHeader'
import { CardAttributes } from './CardAttributes'
import { LinkedOkrCard } from './CardLinkedOkr'
import { CardDescription } from './CardDescription'
import { CardChecklists } from './CardChecklists'
import { CardAttachments } from './CardAttachments'
import { CardComments } from './CardComments'
import { cardCommentAttachmentSrc, discardStagedCardCommentFiles, stageCardCommentFiles } from './CardCommentUploads'
import { CardActionCluster, CardRail } from './CardRail'
import { CardMemberPicker, CardLabelsPanel } from './CardPickers'
import { DatesPanel } from './CardDatesPanel'
import type {
  ActivityLogData, AttachmentData, CardLane, CardPanel, CommentData, LabelDef, OkrLinkResults, TodoCardData,
} from './cardModalTypes'

export type { TodoCardData } from './cardModalTypes'

/**
 * SEC-6 — comment bodies are user-authored HTML from TipTap and reach every
 * viewer of the card. They were once injected raw; RichTextContent runs the
 * DOMPurify allowlist (which keeps span+class, so mentions still style) and
 * handles legacy plaintext comments. This is the only renderer CardComments
 * is given, so every comment and reply body goes through it.
 */
function renderCommentBody(html: string, kind: 'comment' | 'reply') {
  return kind === 'comment' ? (
    <>
      <RichTextContent
        html={html}
        className="mt-1.5 rounded-[var(--ap-radius-md)] bg-[var(--ap-bg-sunken)] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[var(--ap-fg-muted)] [&_.mention]:font-medium [&_.mention]:text-[var(--ap-accent)]"
      />
      <LinkPreviewList html={html} className="mt-2" />
    </>
  ) : (
    <>
      <RichTextContent
        html={html}
        className="mt-0.5 text-xs text-[var(--ap-fg)] [&_.mention]:text-[var(--ap-accent)] [&_.mention]:font-medium"
      />
      <LinkPreviewList html={html} className="mt-2" />
    </>
  )
}

interface Props {
  todoId: string | null
  currentUserId: string
  onClose: () => void
  onUpdated?: () => void
  /**
   * @deprecated Vestigial. Drawer mode had no call sites and was deleted in the
   * design refresh (§6.4) — the card is always a centred modal. The prop is
   * kept, narrowed to its only legal value, purely so the one call site that
   * still passes `mode="modal"` keeps type-checking. Drop it there and this
   * can go too.
   */
  mode?: 'modal'
}

export function TodoCardModal({ todoId, currentUserId, onClose, onUpdated }: Props) {
  const [todo, setTodo] = useState<TodoCardData | null>(null)
  const [loading, setLoading] = useState(false)
  // The card read rule answers 404 for a card that is missing OR that the viewer
  // may not open (invite-only sprints) — a shared ?card= / ?open= link then shows
  // a friendly state instead of an empty modal.
  const [unavailable, setUnavailable] = useState(false)
  const [comments, setComments] = useState<CommentData[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLogData[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [labelDefs, setLabelDefs] = useState<LabelDef[]>([])
  const [activePanel, setActivePanel] = useState<CardPanel>(null)
  /**
   * Which trigger opened the panel. Members, Labels and Dates each have two —
   * the attribute-grid control and the rail row — and a popover must open at
   * the control you actually pressed. Sharing one anchor meant pressing
   * "Labels" in the rail on the right opened the panel against the grid on the
   * far left, which reads as a misplaced popover. */
  const [panelAnchor, setPanelAnchor] = useState<'grid' | 'rail'>('grid')
  /** Open `panel` anchored at `anchor`, or close it if that pair is already open. */
  const togglePanel = useCallback((panel: CardPanel, anchor: 'grid' | 'rail') => (open: boolean) => {
    setPanelAnchor(anchor)
    setActivePanel(open ? panel : null)
  }, [])
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<OkrLinkResults>({ objectives: [], keyResults: [] })
  const [linkLoading, setLinkLoading] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(CARD_PALETTE[0].hex)
  const [labelSearch, setLabelSearch] = useState('')
  const [newItemTitles, setNewItemTitles] = useState<Record<string, string>>({})
  const { users } = useUsersForSelection()
  const { data: session } = useSession()
  const sessionRole = session?.user?.role
  const colorBlind = useUserPrefsStore((st) => st.colorBlindMode)
  const setColorBlindMode = useUserPrefsStore((st) => st.setColorBlindMode)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch ──
  const fetchTodo = useCallback(async () => {
    if (!todoId) return
    setLoading(true)
    setUnavailable(false)
    try {
      const [todoRes, commentsRes, labelsRes, activityRes] = await Promise.all([
        fetch(`/api/todos/${todoId}`),
        fetch(`/api/todos/${todoId}/comments`),
        fetch('/api/todo-labels'),
        fetch(`/api/todos/${todoId}/activity`),
      ])
      const [t, c, l, a] = await Promise.all([todoRes.json(), commentsRes.json(), labelsRes.json(), activityRes.json()])
      if (t.success) { setTodo(t.data); setTitleDraft(t.data.title); setDescDraft(t.data.description ?? '') }
      else { setTodo(null); setUnavailable(true) }
      if (c.success) setComments(c.data)
      if (l.success) setLabelDefs(l.data)
      if (a.success) setActivityLogs(a.data)
    } finally {
      setLoading(false)
    }
  }, [todoId])

  useEffect(() => { fetchTodo() }, [fetchTodo])

  // Escape is Radix's job: the shared Modal dismisses only the topmost layer,
  // so a popover, dropdown or inline rename swallows its own Escape without
  // taking the card down with it. The hand-rolled window listener that used to
  // live here was guarded by `mode !== 'drawer'` and therefore never ran.

  // ── PATCH helper ──
  const patch = useCallback(async (body: Record<string, unknown>) => {
    if (!todo) return
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.success) { setTodo(json.data); onUpdated?.() }
    else toast.error(json.error ?? 'Update failed')
  }, [todo, onUpdated])

  // ── Title ──
  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === todo?.title) { setEditingTitle(false); return }
    await patch({ title: titleDraft.trim() })
    setEditingTitle(false)
  }

  // ── Description ──
  const saveDescription = async () => {
    await patch({ description: descDraft })
    setActivePanel(null)
  }

  // ── Comment ──
  // Optimistic (CPF-1…6): the comment appears and the composer clears in the
  // same frame, then the saved row replaces it. The author used to wait on
  // sequential uploads plus the whole notification fan-out before seeing it.
  const selfAuthor = (): CommentData['author'] => ({
    id: currentUserId,
    name: session?.user?.name ?? users.find((u) => u.id === currentUserId)?.name ?? 'You',
    avatar: session?.user?.avatar ?? null,
  })
  const tempCommentId = () => `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const hasCommentText = (html: string) => !!html.replace(/<[^>]+>/g, '').trim()

  const postComment = async () => {
    if (!todo) return
    const content = commentDraft
    const files = pendingFiles
    const hasText = hasCommentText(content)
    if (!hasText && files.length === 0) return

    const tempId = tempCommentId()
    setComments((c) => [...c, {
      id: tempId,
      content: hasText ? content : '<p></p>',
      parentId: null,
      author: selfAuthor(),
      createdAt: new Date().toISOString(),
      replies: [],
      attachments: [],
      pending: true,
      uploadingFiles: files.map((f) => f.name),
    }])
    setCommentDraft('')
    setPendingFiles([])

    let newAttachments: AttachmentData[] = []
    try {
      // ATT-4 — staged on the shared comment-attachment path (CommentAttachment,
      // same as OKR comments) and claimed by the comment POST; no longer card
      // attachments. Concurrently (CPF-5).
      newAttachments = await stageCardCommentFiles(todo.id, files, selfAuthor())
      if (!hasText && newAttachments.length === 0) throw new Error('Nothing was uploaded')
      const res = await fetch(`/api/todos/${todo.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: hasText ? content : '<p></p>',
          attachmentIds: newAttachments.map((a) => a.id),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to post comment')
      setComments((c) => c.map((x) => (x.id === tempId ? json.data : x)))
    } catch (err) {
      // CPF-3 — nothing is lost: the text and files go back into the composer,
      // unless the author has already started writing something else.
      setComments((c) => c.filter((x) => x.id !== tempId))
      // The files go back to the composer, so drop what was staged (CMP-3).
      void discardStagedCardCommentFiles(newAttachments.map((a) => a.id))
      setCommentDraft((d) => (hasCommentText(d) ? d : content))
      setPendingFiles((p) => (p.length > 0 ? p : files))
      toast.error(err instanceof Error && err.message !== 'Nothing was uploaded' ? err.message : 'Failed to post comment')
    }
  }

  // ── Checklist ──
  const addChecklist = async () => {
    if (!newChecklistTitle.trim() && !todo) return
    const res = await fetch(`/api/todos/${todo!.id}/checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newChecklistTitle || 'Checklist' }),
    })
    const json = await res.json()
    if (json.success) { setTodo((t) => t ? { ...t, checklists: [...t.checklists, json.data] } : t); setNewChecklistTitle(''); setActivePanel(null) }
    else toast.error(json.error || 'Could not add the checklist')
  }

  // ── Comments + activity rail (CDM-5 / CDM-6) ──────────────────────────────
  const HIDE_DETAILS_KEY = 'card-hide-activity-details-v1'
  const [hideDetails, setHideDetails] = useState(false)
  const [editingComment, setEditingComment] = useState<{ id: string; content: string } | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  // Per-viewer preference, so the rail opens the way they left it.
  useEffect(() => {
    try { setHideDetails(window.localStorage.getItem(HIDE_DETAILS_KEY) === '1') } catch { /* private mode */ }
  }, [])
  const toggleHideDetails = () => {
    setHideDetails((prev) => {
      const next = !prev
      try { window.localStorage.setItem(HIDE_DETAILS_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  /** Author, ADMIN and EXECUTIVE may moderate — mirrors the server check so the
   *  UI never offers an action the API will refuse. */
  const canModerate = (authorId: string) =>
    authorId === currentUserId || sessionRole === 'ADMIN' || sessionRole === 'EXECUTIVE'

  const postReply = async (parentId: string) => {
    if (!todo) return
    const content = replyDraft.trim()
    if (!hasCommentText(content)) return
    // CPF-6 — optimistic, nested under its parent straight away.
    const tempId = tempCommentId()
    const withReplies = (fn: (replies: CommentData[]) => CommentData[]) =>
      setComments((list) => list.map((c) => (c.id === parentId ? { ...c, replies: fn(c.replies ?? []) } : c)))
    withReplies((r) => [...r, {
      id: tempId, content, parentId, author: selfAuthor(),
      createdAt: new Date().toISOString(), replies: [], pending: true,
    }])
    setReplyingTo(null)
    setReplyDraft('')

    const res = await fetch(`/api/todos/${todo.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parentId }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !json.success) {
      withReplies((r) => r.filter((x) => x.id !== tempId))
      setReplyingTo(parentId)
      setReplyDraft((d) => (hasCommentText(d) ? d : content))
      toast.error(json.error || 'Could not post the reply')
      return
    }
    withReplies((r) => r.map((x) => (x.id === tempId ? json.data : x)))
    announce('Reply posted')
  }

  // Card attachments are read through the API rather than their stored
  // /uploads/... path: that path is served statically with no session check,
  // and was also where the broken thumbnails came from. Derived from the id,
  // so rows written before this change work without a data migration.
  const attachmentUrl = (attachmentId: string) =>
    todo ? `/api/todos/${todo.id}/attachments/${attachmentId}` : ''

  // Legacy TodoAttachment rows carry no width/height, so thumbnails here cannot
  // reserve their box; everything else matches the shared viewer's shape.
  // Comment attachments on CommentAttachment (ATT-4) carry their own
  // authenticated URL; card and legacy comment attachments use the card route.
  const toViewerDto = (a: { id: string; filename: string; mimeType: string; size: number; url?: string }) => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    url: cardCommentAttachmentSrc(a, attachmentUrl),
  })
  // Declared here, above the `if (!todoId) return null` below: a hook after an
  // early return is a conditional hook call and React will throw.
  const cardAttachmentViewer = useAttachmentViewer((todo?.attachments ?? []).map(toViewerDto))

  // One viewer for the whole thread rather than one per comment, so ←/→ pages
  // through every image in the conversation. Built in the order the rail
  // renders them (newest comment first, replies under their parent) so the
  // lightbox counter matches what the reader just clicked.
  const commentAttachmentDtos = useMemo(() => {
    const out: CommentAttachmentDto[] = []
    const walk = (list: CommentData[]) => {
      for (const c of list) {
        for (const a of c.attachments ?? []) out.push(toViewerDto(a))
        if (c.replies?.length) walk(c.replies)
      }
    }
    walk([...comments].reverse())
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, todo?.id])
  const commentAttachmentViewer = useAttachmentViewer(commentAttachmentDtos)

  const saveCommentEdit = async () => {
    if (!editingComment || !todo) return
    const { id } = editingComment
    const content = editingComment.content.trim()
    if (!hasCommentText(content)) return
    // CPF-6 — apply locally and close the editor now; revert on failure.
    const previous = comments.find((c) => c.id === id)?.content
    setComments((list) => list.map((c) => (c.id === id ? { ...c, content } : c)))
    setEditingComment(null)

    const res = await fetch(`/api/todos/${todo.id}/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok || !json.success) {
      if (previous !== undefined) setComments((list) => list.map((c) => (c.id === id ? { ...c, content: previous } : c)))
      setEditingComment({ id, content })
      toast.error(json.error || 'Could not save the comment')
      return
    }
    // The PATCH response carries no attachments and un-hydrated replies; keep
    // what the thread already has.
    setComments((list) => list.map((c) => (c.id === id ? { ...c, ...json.data, replies: c.replies, attachments: c.attachments } : c)))
    announce('Comment updated')
  }

  const deleteComment = async (commentId: string) => {
    if (!todo) return
    const prev = comments
    setComments((list) => list.filter((c) => c.id !== commentId))   // optimistic
    const res = await fetch(`/api/todos/${todo.id}/comments/${commentId}`, { method: 'DELETE' })
    if (!res.ok) {
      setComments(prev)
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Could not delete the comment')
      return
    }
    announce('Comment deleted')
  }

  // ── Share + delete ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmLabel, setConfirmLabel] = useState<LabelDef | null>(null)

  /**
   * SHR-1 — copies an ordinary in-app deep link. No token is minted and no new
   * access path is created: the recipient must sign in and independently pass
   * the sprint's existing permission check.
   */
  const copyCardLink = async () => {
    if (!todo) return
    try {
      const res = await fetch(`/api/todos/${todo.id}/share`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not share this card')
      const ok = await copyToClipboard(`${window.location.origin}${json.data.path}`)
      // navigator.clipboard is undefined outside a secure context, so a silent
      // failure here used to still report success.
      if (!ok) throw new Error('Could not copy the link')
      toast.success('Card link copied')
      announce('Card link copied to clipboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not copy the link')
    }
  }

  const duplicateCard = async () => {
    if (!todo) return
    const res = await fetch(`/api/todos/${todo.id}/duplicate`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok || !json.success) { toast.error(json.error || 'Could not duplicate the card'); return }
    toast.success('Card duplicated')
    announce('Card duplicated')
    onUpdated?.()
    onClose()
  }

  // ── Board lane (CDM-2) ────────────────────────────────────────────────────
  // The list chip is the only way to move a card between lists without dragging,
  // which is also the mobile path (HTML5 drag does not work on touch).
  const [lanes, setLanes] = useState<CardLane[]>([])
  const [lanesLoaded, setLanesLoaded] = useState(false)

  useEffect(() => {
    const sprintId = todo?.sprintId
    if (!sprintId) { setLanes([]); setLanesLoaded(true); return }
    setLanesLoaded(false)
    let cancelled = false
    fetch(`/api/sprints/${sprintId}/columns`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json?.success) setLanes(json.data ?? []) })
      .catch(() => { /* non-fatal: the chip just stays hidden */ })
      .finally(() => { if (!cancelled) setLanesLoaded(true) })
    return () => { cancelled = true }
  }, [todo?.sprintId])

  const currentLane = lanes.find((l) => l.id === todo?.columnId) ?? null

  // CDM-11 — a closed sprint is read-only. The API already returns 409
  // SPRINT_CLOSED, but offering controls that always fail is worse than not
  // offering them, so the card renders as a record rather than an editor.
  const sprintClosed =
    todo?.sprint?.state === 'COMPLETED' || todo?.sprint?.state === 'CANCELLED'

  const sprintWindow = todo?.sprint
    ? {
        name: todo.sprint.name,
        startDate: todo.sprint.startDate ?? null,
        endDate: todo.sprint.endDate ?? null,
      }
    : null

  const moveToLane = async (columnId: string) => {
    const lane = lanes.find((l) => l.id === columnId)
    if (!lane) return
    // Server derives status from the lane, so we only send columnId.
    await patch({ columnId })
    announce(`Card moved to ${lane.name}`)
  }

  // ── Watch / subscribe ──
  // Backed by the generic polymorphic `Watcher` table via /api/watchers, which
  // has always supported entityType='TODO' but was never wired to any todo UI.
  // Without a way to opt in, the board's watcher badge could never light up.
  const [editingItem, setEditingItem] = useState<{ checklistId: string; itemId: string; title: string } | null>(null)
  // Per-checklist "Hide checked" (design §Review steps). View-only and local:
  // it filters what is rendered, never what is stored.
  const [hideChecked, setHideChecked] = useState<Record<string, boolean>>({})
  const [isWatching, setIsWatching] = useState(false)
  const [watchPending, setWatchPending] = useState(false)

  useEffect(() => {
    if (!todoId) { setIsWatching(false); return }
    let cancelled = false
    fetch(`/api/watchers?entityType=TODO&entityId=${todoId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return
        const rows: { userId: string }[] = json.data ?? []
        setIsWatching(rows.some((w) => w.userId === currentUserId))
      })
      .catch(() => { /* non-fatal: the toggle just starts in the unwatched state */ })
    return () => { cancelled = true }
  }, [todoId, currentUserId])

  const toggleWatch = async () => {
    if (!todoId || watchPending) return
    const next = !isWatching
    setIsWatching(next)          // optimistic
    setWatchPending(true)
    try {
      const res = next
        ? await fetch('/api/watchers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: 'TODO', entityId: todoId }),
          })
        : await fetch(`/api/watchers?entityType=TODO&entityId=${todoId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      announce(next ? 'Watching this card' : 'Stopped watching this card')
      onUpdated?.()
    } catch {
      setIsWatching(!next)       // roll back
      toast.error(next ? 'Could not watch this card' : 'Could not unwatch this card')
    } finally {
      setWatchPending(false)
    }
  }

  const addChecklistItem = async (checklistId: string) => {
    const title = newItemTitles[checklistId]?.trim()
    if (!title) return
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    const json = await res.json()
    if (json.success) {
      setTodo((t) => t ? { ...t, checklists: t.checklists.map((cl) => cl.id === checklistId ? { ...cl, items: [...cl.items, json.data] } : cl) } : t)
      setNewItemTitles((prev) => ({ ...prev, [checklistId]: '' }))
    } else {
      toast.error(json.error || 'Could not add the item')
    }
  }

  /**
   * Generic checklist-item PATCH. The route already accepts title, completed,
   * assigneeId and dueDate; only `completed` was ever sent from the UI, which
   * is why the per-item due-date and assign buttons sat inert.
   */
  const patchChecklistItem = async (
    checklistId: string,
    itemId: string,
    data: { title?: string; completed?: boolean; assigneeId?: string | null; dueDate?: string | null },
  ) => {
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Could not update the item')
      return false
    }
    setTodo((t) => t ? {
      ...t,
      checklists: t.checklists.map((cl) => cl.id === checklistId
        ? { ...cl, items: cl.items.map((i) => i.id === itemId ? { ...i, ...json.data } : i) }
        : cl),
    } : t)
    return true
  }

  const toggleChecklistItem = (checklistId: string, itemId: string, completed: boolean) =>
    patchChecklistItem(checklistId, itemId, { completed })

  const deleteChecklistItem = async (checklistId: string, itemId: string) => {
    const prev = todo
    // Optimistic — the row disappears immediately, restored if the call fails.
    setTodo((t) => t ? {
      ...t,
      checklists: t.checklists.map((cl) => cl.id === checklistId
        ? { ...cl, items: cl.items.filter((i) => i.id !== itemId) }
        : cl),
    } : t)
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}/items/${itemId}`, { method: 'DELETE' })
    if (!res.ok) {
      setTodo(prev)
      toast.error('Could not delete the item')
      return
    }
    announce('Checklist item deleted')
  }

  const deleteChecklist = async (checklistId: string) => {
    const res = await fetch(`/api/todos/${todo!.id}/checklists/${checklistId}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.error || 'Could not delete the checklist')
      return
    }
    setTodo((t) => t ? { ...t, checklists: t.checklists.filter((cl) => cl.id !== checklistId) } : t)
  }

  // ── Members ──
  // Optimistic — UI updates instantly; the PATCH (and its server-side
  // notification fan-out) runs in the background. On failure we roll back
  // and surface a toast. Without this the popover felt sluggish because
  // the response time included emit() writing per-recipient rows.
  const toggleMember = (userId: string) => {
    if (!todo) return
    const u = users.find((x: { id: string }) => x.id === userId)
    const currentIds = todo.members.map((m) => m.user.id)
    const willAdd = !currentIds.includes(userId)
    const newIds = willAdd ? [...currentIds, userId] : currentIds.filter((id) => id !== userId)
    const prevMembers = todo.members
    const optimisticMembers = willAdd && u
      ? [...prevMembers, { user: { id: u.id, name: u.name ?? u.email ?? '', avatar: (u as { avatar?: string | null }).avatar ?? null } }]
      : prevMembers.filter((m) => m.user.id !== userId)
    setTodo((t) => t ? { ...t, members: optimisticMembers } : t)
    void (async () => {
      try {
        const res = await fetch(`/api/todos/${todo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberIds: newIds }),
        })
        const json = await res.json()
        if (json.success) { setTodo(json.data); onUpdated?.() }
        else { setTodo((t) => t ? { ...t, members: prevMembers } : t); toast.error(json.error ?? 'Update failed') }
      } catch {
        setTodo((t) => t ? { ...t, members: prevMembers } : t)
        toast.error('Update failed')
      }
    })()
  }

  // ── Labels ──
  const toggleLabel = (labelDefId: string) => {
    if (!todo) return
    const def = labelDefs.find((d) => d.id === labelDefId)
    const currentIds = todo.labels.map((l) => l.labelDef.id)
    const willAdd = !currentIds.includes(labelDefId)
    const newIds = willAdd ? [...currentIds, labelDefId] : currentIds.filter((id) => id !== labelDefId)
    const prevLabels = todo.labels
    const optimisticLabels = willAdd && def
      ? [...prevLabels, { labelDef: { id: def.id, name: def.name, color: def.color } }]
      : prevLabels.filter((l) => l.labelDef.id !== labelDefId)
    setTodo((t) => t ? { ...t, labels: optimisticLabels } : t)
    void (async () => {
      try {
        const res = await fetch(`/api/todos/${todo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labelIds: newIds }),
        })
        const json = await res.json()
        if (json.success) { setTodo(json.data); onUpdated?.() }
        else { setTodo((t) => t ? { ...t, labels: prevLabels } : t); toast.error(json.error ?? 'Update failed') }
      } catch {
        setTodo((t) => t ? { ...t, labels: prevLabels } : t)
        toast.error('Update failed')
      }
    })()
  }
  const createLabel = async () => {
    const name = newLabelName.trim()
    if (!name) return
    const res = await fetch('/api/todo-labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, color: newLabelColor }),
    })
    const json = await res.json()
    if (!json.success) { toast.error(json.error ?? 'Failed to create label'); return }
    setLabelDefs((d) => [...d, json.data])
    setNewLabelName('')
    if (todo) await toggleLabel(json.data.id)
  }
  // Workspace-wide destructive action — routed through ConfirmDialog (the project
  // standard) rather than window.confirm, which states nothing about the blast
  // radius and cannot be styled or tested.
  const deleteLabel = async (id: string) => {
    const res = await fetch(`/api/todo-labels/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.success) { toast.error(json.error ?? 'Failed to delete label'); return }
    setLabelDefs((d) => d.filter((l) => l.id !== id))
    setTodo((t) => t ? { ...t, labels: t.labels.filter((l) => l.labelDef.id !== id) } : t)
    announce('Label deleted')
  }

  // ── Attachment ──
  const uploadAttachment = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/todos/${todo!.id}/attachments`, { method: 'POST', body: fd })
    const json = await res.json()
    if (json.success) setTodo((t) => t ? { ...t, attachments: [...t.attachments, json.data] } : t)
    else toast.error(json.error ?? 'Upload failed')
  }

  const deleteAttachment = async (attachmentId: string) => {
    await fetch(`/api/todos/${todo!.id}/attachments/${attachmentId}`, { method: 'DELETE' })
    setTodo((t) => t ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) } : t)
  }

  // ── OKR link search (debounced) ──
  useEffect(() => {
    if (activePanel !== 'link') return
    const q = linkQuery.trim()
    if (!q) {
      setLinkResults({ objectives: [], keyResults: [] })
      return
    }
    const t = setTimeout(async () => {
      setLinkLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        if (json.success) {
          setLinkResults({
            objectives: json.data.objectives ?? [],
            keyResults: json.data.keyResults ?? [],
          })
        }
      } finally {
        setLinkLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [linkQuery, activePanel])

  const linkToKeyResult = async (krId: string) => {
    await patch({ keyResultId: krId, objectiveId: null })
    setActivePanel(null); setLinkQuery('')
    toast.success('Linked to key result')
  }
  const linkToObjective = async (objId: string) => {
    await patch({ objectiveId: objId, keyResultId: null })
    setActivePanel(null); setLinkQuery('')
    toast.success('Linked to objective')
  }
  const unlink = async () => {
    await patch({ keyResultId: null, objectiveId: null })
    toast.success('Unlinked')
  }

  /**
   * Members, Labels and Dates each have two triggers but a single panel, anchored
   * in the attribute grid. Opening one from the rail therefore has to bring the
   * grid back into view, or the click looks like it did nothing on a long card.
   */
  if (!todoId) return null
  /**
   * Watch · more · close. The design parks these at the top of the right rail,
   * which is removed wholesale on a closed sprint — so the same cluster is also
   * rendered inline at the top of the left column in that one case, rather than
   * losing the only close button with the rail.
   */
  const cardActionCluster = todo ? (
    <CardActionCluster
      todo={todo}
      sprintClosed={sprintClosed}
      isWatching={isWatching}
      watchPending={watchPending}
      toggleWatch={toggleWatch}
      copyCardLink={copyCardLink}
      duplicateCard={duplicateCard}
      setConfirmDelete={setConfirmDelete}
      onClose={onClose}
    />
  ) : null

  /**
   * Members, Labels and Dates each have two triggers — the attribute-grid
   * control and the rail row — and each trigger opens its own popover with the
   * same content (`panelAnchor` decides which one is open).
   */
  const membersPicker = todo ? (
    <CardMemberPicker users={users} todo={todo} toggleMember={toggleMember} />
  ) : null

  const labelsPanel = todo ? (
    <CardLabelsPanel
      todo={todo}
      labelDefs={labelDefs}
      labelSearch={labelSearch}
      setLabelSearch={setLabelSearch}
      toggleLabel={toggleLabel}
      colorBlind={colorBlind}
      sessionRole={sessionRole}
      setConfirmLabel={setConfirmLabel}
      newLabelName={newLabelName}
      setNewLabelName={setNewLabelName}
      createLabel={createLabel}
      newLabelColor={newLabelColor}
      setNewLabelColor={setNewLabelColor}
    />
  ) : null

  const datesPanel = todo ? (
    <DatesPanel
      startDate={todo.startDate}
      dueDate={todo.dueDate}
      startTime={todo.startTime}
      endTime={todo.endTime}
      dueReminder={todo.dueReminder ?? null}
      recurrenceRule={todo.recurrenceRule ?? null}
      recurrenceEndsAt={todo.recurrenceEndsAt ?? null}
      sprintWindow={sprintWindow}
      onSave={(v) => { patch(v); setActivePanel(null) }}
      // DTE-8 — Remove clears both dates, both times and the reminder in one
      // request; a reminder with no due date would never fire.
      onRemove={() => patch({
        startDate: null, dueDate: null,
        startTime: null, endTime: null,
        dueReminder: null,
        // Recurrence is anchored to the due date, so clearing dates must
        // clear it too rather than leaving a series that can never advance.
        recurrenceRule: null, recurrenceEndsAt: null,
      })}
      onClose={() => setActivePanel(null)}
    />
  ) : null

  // CDM-1 — the card body used to sit in a hand-rolled portal with no focus
  // trap, no focus restore and no scroll lock. It renders inside the shared
  // Modal (Radix), which supplies all three.
  const body = (
      <div className="relative w-full">
        {/* ── Cover strip (taller, gradient feel) ── */}
        {todo?.coverColor && (
          <div
            className={todo.coverSize === 'FULL' ? 'h-28 w-full' : 'h-14 w-full'}
            style={swatchStyle(todo.coverColor, { colorBlind, ink: 'rgba(255,255,255,0.28)' })}
          />
        )}

        {loading && !todo ? (
          <div className="space-y-4 px-5 pb-7 pt-5 md:px-7" role="status" aria-label="Loading card">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <div className="grid grid-cols-2 gap-4 pt-2 md:grid-cols-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        ) : todo ? (
          <>
          {sprintClosed && (
            <div
              className="mx-5 mt-5 flex items-center gap-2 rounded-[var(--ap-radius-sm)] px-3 py-2 text-xs md:mx-7"
              style={{
                background: 'var(--ap-bg-sunken)',
                border: '1px solid var(--ap-border)',
                color: 'var(--ap-fg-muted)',
              }}
              role="status"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                “{todo.sprint?.name}” is {todo.sprint?.state === 'COMPLETED' ? 'completed' : 'cancelled'} —
                this card is read-only.
              </span>
            </div>
          )}
          {/* Two columns, each scrolling on its own — the shell never scrolls as a
              whole, so the rail stays reachable however long the comment thread is.
              With the rail removed (closed sprint) the 232px track goes with it. */}
          <div className={cn(
            'grid grid-cols-1 items-stretch',
            !sprintClosed && 'md:grid-cols-[minmax(0,1fr)_232px]',
          )}>
            {/* ══ LEFT column ══ */}
            {/* Asymmetric right padding is deliberate: the column owns the
                scrollbar, so the gutter sits under it rather than beside it. */}
            <div className="min-w-0 space-y-6 px-5 pb-7 pt-5 md:max-h-[calc(100vh-140px)] md:overflow-y-auto md:pl-7 md:pr-2">

              {/* The rail carries watch/more/close, and the rail is gone on a
                  closed sprint — so render the same cluster here in that case. */}
              {sprintClosed && (
                <div className="flex items-center justify-end gap-0.5 md:pr-5">
                  {cardActionCluster}
                </div>
              )}

              <CardHeader
                todo={todo}
                sprintClosed={sprintClosed}
                patch={patch}
                editingTitle={editingTitle}
                setEditingTitle={setEditingTitle}
                titleDraft={titleDraft}
                setTitleDraft={setTitleDraft}
                saveTitle={saveTitle}
                titleRef={titleRef}
                lanes={lanes}
                lanesLoaded={lanesLoaded}
                currentLane={currentLane}
                moveToLane={moveToLane}
              />

              <CardAttributes
                todo={todo}
                patch={patch}
                colorBlind={colorBlind}
                activePanel={activePanel}
                panelAnchor={panelAnchor}
                togglePanel={togglePanel}
                membersPicker={membersPicker}
                labelsPanel={labelsPanel}
                datesPanel={datesPanel}
              />

              {/* ── Linked OKR card (always visible — surfaces the link or invites it) ── */}
              <LinkedOkrCard
                todo={todo}
                isOpen={activePanel === 'link'}
                onToggle={() => setActivePanel(activePanel === 'link' ? null : 'link')}
                onUnlink={unlink}
                query={linkQuery}
                onQueryChange={setLinkQuery}
                results={linkResults}
                loading={linkLoading}
                onPickKr={linkToKeyResult}
                onPickObjective={linkToObjective}
              />

              <CardDescription
                todo={todo}
                sprintClosed={sprintClosed}
                users={users}
                activePanel={activePanel}
                setActivePanel={setActivePanel}
                descDraft={descDraft}
                setDescDraft={setDescDraft}
                saveDescription={saveDescription}
              />

              <CardChecklists
                todo={todo}
                users={users}
                hideChecked={hideChecked}
                setHideChecked={setHideChecked}
                editingItem={editingItem}
                setEditingItem={setEditingItem}
                newItemTitles={newItemTitles}
                setNewItemTitles={setNewItemTitles}
                deleteChecklist={deleteChecklist}
                toggleChecklistItem={toggleChecklistItem}
                patchChecklistItem={patchChecklistItem}
                deleteChecklistItem={deleteChecklistItem}
                addChecklistItem={addChecklistItem}
              />

              <CardAttachments
                todo={todo}
                cardAttachmentViewer={cardAttachmentViewer}
                attachmentUrl={attachmentUrl}
                toViewerDto={toViewerDto}
                deleteAttachment={deleteAttachment}
              />

              {/* ── Comments + activity ──
                   Deliberately still stacked. The design tabs them; §6.4 defers that
                   as an IA change with no functional gain, so this is a restyle of
                   the existing stack and nothing more. */}
              <CardComments
                sprintClosed={sprintClosed}
                users={users}
                hideDetails={hideDetails}
                toggleHideDetails={toggleHideDetails}
                commentDraft={commentDraft}
                setCommentDraft={setCommentDraft}
                postComment={postComment}
                pendingFiles={pendingFiles}
                setPendingFiles={setPendingFiles}
                comments={comments}
                editingComment={editingComment}
                setEditingComment={setEditingComment}
                saveCommentEdit={saveCommentEdit}
                deleteComment={deleteComment}
                canModerate={canModerate}
                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                replyDraft={replyDraft}
                setReplyDraft={setReplyDraft}
                postReply={postReply}
                commentAttachmentViewer={commentAttachmentViewer}
                attachmentUrl={attachmentUrl}
                toViewerDto={toViewerDto}
                activityLogs={activityLogs}
                labelDefs={labelDefs}
                renderBody={renderCommentBody}
              />
            </div>

            {/* ══ RIGHT rail (232px) ══ — every control below the action row
                 mutates, so the whole rail is removed rather than disabled on a
                 closed sprint. Watch / more / close move inline in that case. */}
            <CardRail
              todo={todo}
              sprintClosed={sprintClosed}
              patch={patch}
              cardActionCluster={cardActionCluster}
              activePanel={activePanel}
              setActivePanel={setActivePanel}
              panelAnchor={panelAnchor}
              togglePanel={togglePanel}
              membersPicker={membersPicker}
              labelsPanel={labelsPanel}
              datesPanel={datesPanel}
              newChecklistTitle={newChecklistTitle}
              setNewChecklistTitle={setNewChecklistTitle}
              addChecklist={addChecklist}
              uploadAttachment={uploadAttachment}
              colorBlind={colorBlind}
              setColorBlindMode={setColorBlindMode}
              copyCardLink={copyCardLink}
              setConfirmDelete={setConfirmDelete}
            />
          </div>
          </>
        ) : unavailable ? (
          <EmptyState
            bare
            className="py-12"
            icon={Lock}
            title="You don't have access to this card"
            description="It may have been deleted, or it's on a board you haven't been invited to. Ask the board's owner to add you."
            action={{ label: 'Close', onClick: onClose }}
          />
        ) : null}

        {/* Replaces window.confirm — the project standard for destructive
            actions, and the only version that states what is lost. */}
        <ConfirmDialog
          open={!!confirmLabel}
          onClose={() => setConfirmLabel(null)}
          title="Delete label"
          message={confirmLabel ? `Delete “${confirmLabel.name}”?` : 'Delete this label?'}
          description="Labels are shared across the workspace."
          variant="danger"
          confirmLabel="Delete label"
          bullets={[
            'The label is removed from every card that carries it',
            'Nothing else about those cards changes',
          ]}
          onConfirm={async () => {
            if (!confirmLabel) return
            await deleteLabel(confirmLabel.id)
            setConfirmLabel(null)
          }}
        />

        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete card"
          message={todo ? `Delete “${todo.title}”?` : 'Delete this card?'}
          description="This cannot be undone."
          variant="danger"
          confirmLabel="Delete card"
          isLoading={deleting}
          bullets={[
            'The card and its checklists, comments and attachments are removed',
            'Any linked key result keeps its current value',
          ]}
          onConfirm={async () => {
            if (!todo) return
            setDeleting(true)
            try {
              const res = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
              if (!res.ok) throw new Error('Delete failed')
              toast.success('Card deleted')
              announce('Card deleted')
              setConfirmDelete(false)
              onUpdated?.()
              onClose()
            } catch {
              toast.error('Could not delete the card')
            } finally {
              setDeleting(false)
            }
          }}
        />

        {/* Both lightboxes live inside `body`. They portal to document.body and
            stack above this dialog as their own Radix layer, so Escape closes
            the preview first and the card stays open. */}
        {cardAttachmentViewer.viewer}
        {commentAttachmentViewer.viewer}
      </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      // Accessible name only — the visible title is the editable hero below.
      title={todo?.title ?? 'Card'}
      hideHeader
      // The card provides its own close button in the right rail.
      showCloseButton={false}
      // Otherwise focus lands in the title textarea and the caret starts editing
      // the moment the card opens.
      preventInitialFocus
      size="940"
      // §6.4's 6px strip. Bound to the card's own status so it reads as state
      // rather than decoration; every value is an `--ap-*` token via TODO_STATUS_META.
      accentColor={todoStatusMeta(todo?.status ?? 'PENDING').dot}
      // `!p-0 !pt-[6px]`: the shell is full-bleed, but the accent strip is
      // absolutely positioned at top-0, so the body still has to clear its 6px.
      // Top-aligned, not centred — the two columns cap at calc(100vh - 140px)
      // and scroll on their own, so the shell never needs to be vertically
      // centred and never grows past the viewport.
      className="!p-0 !pt-[6px] top-[28px] translate-y-0 max-h-[calc(100vh-88px)] max-w-[calc(100%-40px)] overflow-hidden overflow-y-auto rounded-[var(--ap-radius-lg)] border-0 bg-[var(--ap-bg-raised)] shadow-[shadow:var(--ap-shadow-lg)] ring-0"
    >
      {body}
    </Modal>
  )
}
