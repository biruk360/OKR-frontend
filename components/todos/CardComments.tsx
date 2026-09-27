'use client'

/**
 * Card modal "Comments and activity" section: composer (with file attach),
 * newest-first thread with replies, edit/delete for moderators, comment
 * attachments, and the activity log. All state and API calls stay in
 * TodoCardModal; this renders them.
 *
 * Comment attachments are staged on the shared CommentAttachment path (ATT-4,
 * see CardCommentUploads.ts); a thread renders both those and legacy
 * TodoAttachment ids from comments not yet migrated (NRG-3).
 *
 * Comment HTML is never rendered here directly: `renderBody` is supplied by
 * TodoCardModal, which routes every body through the sanitising
 * RichTextContent component (SEC-6). Split out of TodoCardModal.tsx;
 * behaviour unchanged.
 */

import { useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { X, Paperclip, MessageSquare, Activity, File as FileIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { UserForSelection } from '@/hooks/useUsersForSelection'
import type { CommentAttachmentDto } from '@/components/shared/CommentAttachments'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { MentionEditor } from './MentionEditor'
import { Avatar } from './CardModalBits'
import { ActivityFeed } from './CardActivityFeed'
import { cardCommentAttachmentSrc } from './CardCommentUploads'
import type { CardAttachmentViewer } from './CardAttachments'
import type { ActivityLogData, AttachmentData, CommentData, LabelDef } from './cardModalTypes'

export type EditingComment = { id: string; content: string } | null

export interface CardCommentsProps {
  sprintClosed: boolean
  users: UserForSelection[]
  hideDetails: boolean
  toggleHideDetails: () => void
  commentDraft: string
  setCommentDraft: (v: string) => void
  postComment: () => void
  pendingFiles: File[]
  setPendingFiles: Dispatch<SetStateAction<File[]>>
  comments: CommentData[]
  editingComment: EditingComment
  setEditingComment: (v: EditingComment) => void
  saveCommentEdit: () => void
  deleteComment: (commentId: string) => void
  canModerate: (authorId: string) => boolean
  replyingTo: string | null
  setReplyingTo: (id: string | null) => void
  replyDraft: string
  setReplyDraft: (v: string) => void
  postReply: (parentId: string) => void
  commentAttachmentViewer: CardAttachmentViewer
  attachmentUrl: (attachmentId: string) => string
  toViewerDto: (a: AttachmentData) => CommentAttachmentDto
  activityLogs: ActivityLogData[]
  labelDefs: LabelDef[]
  /** Renders one comment/reply body. Supplied by TodoCardModal (sanitised, SEC-6). */
  renderBody: (html: string, kind: 'comment' | 'reply') => ReactNode
}

export function CardComments({
  sprintClosed, users, hideDetails, toggleHideDetails, commentDraft, setCommentDraft, postComment,
  pendingFiles, setPendingFiles, comments, editingComment, setEditingComment, saveCommentEdit,
  deleteComment, canModerate, replyingTo, setReplyingTo, replyDraft, setReplyDraft, postReply,
  commentAttachmentViewer, attachmentUrl, toViewerDto, activityLogs, labelDefs, renderBody,
}: CardCommentsProps) {
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div className="border-t border-[var(--ap-border)] pt-5">
      <div className="mb-3.5 flex items-center gap-2.5">
        <MessageSquare className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" />
        <h3 className="text-sm font-semibold text-[var(--ap-fg-muted)]">Comments and activity</h3>
        <button
          type="button"
          onClick={toggleHideDetails}
          aria-pressed={hideDetails}
          className="ml-auto h-[26px] rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-sunken)] px-2.5 text-xs font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
        >
          {hideDetails ? 'Show details' : 'Hide details'}
        </button>
      </div>

      <>
          {/* Comment input — hidden on a closed sprint (CDM-11). Files can also
              be dropped onto it or pasted into it (CMP-1); they join the
              pending chips and stage on Save like picked ones. */}
          <div
            className={cn('space-y-2 rounded-[var(--ap-radius-sm)] transition-shadow', sprintClosed && 'hidden', dragging && 'ring-2 ring-[var(--ap-accent)]')}
            onDragOver={(e) => {
              if (sprintClosed || !e.dataTransfer.types.includes('Files')) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
            onDrop={(e) => {
              if (sprintClosed) return
              const files = Array.from(e.dataTransfer.files ?? [])
              setDragging(false)
              if (files.length === 0) return
              e.preventDefault()
              setPendingFiles((prev) => [...prev, ...files])
            }}
            onPaste={(e) => {
              if (sprintClosed) return
              const files = Array.from(e.clipboardData?.files ?? [])
              if (files.length === 0) return
              e.preventDefault()
              setPendingFiles((prev) => [...prev, ...files])
            }}
          >
            <MentionEditor
              value={commentDraft}
              onChange={setCommentDraft}
              placeholder="Write a comment… (@mention to notify someone)"
              users={users}
              onSubmit={postComment}
              minHeight={60}
            />
            {/* Attach file row */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => commentFileInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-2 py-1 text-caption text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
              >
                <Paperclip className="h-3 w-3" /> Attach file
              </button>
              <input
                ref={commentFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) setPendingFiles((prev) => [...prev, ...files])
                  e.target.value = ''
                }}
              />
              {pendingFiles.length > 0 && (
                <span className="text-caption text-[var(--ap-fg-faint)]">{pendingFiles.length} file{pendingFiles.length === 1 ? '' : 's'} pending</span>
              )}
            </div>
            {/* Pending file chips */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((f, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--ap-bg-sunken)] px-2 py-1 text-caption text-[var(--ap-fg)] border border-[var(--ap-border)]"
                  >
                    <FileIcon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <span className="text-[var(--ap-fg-faint)]">{(f.size / 1024).toFixed(0)}KB</span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-[var(--ap-fg-faint)] hover:text-[var(--ap-danger)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={postComment}
                className="ap-btn ap-btn-primary ap-btn-sm"
              >
                Save
              </button>
              {/* The shortcut itself is unchanged — MentionEditor's
                  onSubmit already fires on ⌘↵ / Ctrl+↵. Only the hint is new. */}
              <kbd className="rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-sunken)] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[var(--ap-fg-subtle)]">
                ⌘↵
              </kbd>
            </div>
          </div>
          {/* Comment list */}
          <div className="mt-4 space-y-4">
            {comments.length === 0 && (
              <p className="text-xs text-[var(--ap-fg-subtle)]">No comments yet.</p>
            )}
            {/* Newest first: the useful comment on a long thread is the
                last one, and scrolling to the bottom to find it is the
                wrong default. Reversed here rather than in the query so
                the API stays ascending for replies and attachments. */}
            {[...comments].reverse().map((c) => (
              <div key={c.id} className={cn('flex gap-2.5 transition-opacity', c.pending && 'opacity-70')} aria-busy={c.pending || undefined}>
                <Avatar id={c.author.id} name={c.author.name} avatar={c.author.avatar} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-body-sm font-semibold text-[var(--ap-fg)]">{c.author.name}</span>
                    <span className="text-[11.5px] text-[var(--ap-fg-subtle)]">
                      {c.pending ? 'Sending…' : format(new Date(c.createdAt), 'MMM d, h:mm a')}
                    </span>
                    {/* CPF-4 — no actions on a row the server has not confirmed. */}
                    {!c.pending && editingComment?.id !== c.id && !sprintClosed && (
                      <button
                        type="button"
                        onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyDraft('') }}
                        className="ml-auto text-caption text-[var(--ap-fg-muted)] underline-offset-2 hover:underline"
                      >
                        {replyingTo === c.id ? 'Cancel reply' : 'Reply'}
                      </button>
                    )}
                    {!c.pending && canModerate(c.author.id) && editingComment?.id !== c.id && (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingComment({ id: c.id, content: c.content })}
                          className="text-caption text-[var(--ap-fg-muted)] underline-offset-2 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="text-caption text-[var(--ap-danger-fg)] underline-offset-2 hover:underline"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                  {editingComment?.id === c.id ? (
                    <div className="mt-1.5">
                      <MentionEditor
                        value={editingComment.content}
                        onChange={(html) => setEditingComment({ id: c.id, content: html })}
                        users={users}
                        onSubmit={saveCommentEdit}
                        minHeight={60}
                        autoFocus
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={saveCommentEdit}
                          className="ap-btn ap-btn-primary ap-btn-sm"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingComment(null)}
                          className="ap-btn ap-btn-secondary ap-btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // SEC-6 — comment bodies are user-authored HTML from
                    // TipTap and reach every viewer of the card. They were
                    // injected raw; RichTextContent runs the DOMPurify
                    // allowlist (which keeps span+class, so mentions still
                    // style) and handles legacy plaintext comments.
                    renderBody(c.content, 'comment')
                  )}
                  {/* Replies, then the reply composer (CDM-6). */}
                  {(c.replies ?? []).length > 0 && (
                    <div
                      className="mt-2 space-y-2 border-l pl-3"
                      style={{ borderColor: 'var(--ap-border)' }}
                    >
                      {(c.replies ?? []).map((r) => (
                        <div key={r.id} className={cn('flex gap-2 transition-opacity', r.pending && 'opacity-70')} aria-busy={r.pending || undefined}>
                          <Avatar id={r.author.id} name={r.author.name} avatar={r.author.avatar} size={20} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-caption font-semibold text-[var(--ap-fg)]">{r.author.name}</span>
                              <span className="text-micro text-[var(--ap-fg-faint)]">
                                {r.pending ? 'Sending…' : format(new Date(r.createdAt), 'MMM d, h:mm a')}
                              </span>
                            </div>
                            {renderBody(r.content, 'reply')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {replyingTo === c.id && (
                    <div className="mt-2">
                      <MentionEditor
                        value={replyDraft}
                        onChange={setReplyDraft}
                        users={users}
                        placeholder={`Reply to ${c.author.name}…`}
                        onSubmit={() => postReply(c.id)}
                        minHeight={56}
                        autoFocus
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <button type="button" onClick={() => postReply(c.id)} className="ap-btn ap-btn-primary ap-btn-sm">
                          Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReplyingTo(null); setReplyDraft('') }}
                          className="ap-btn ap-btn-secondary ap-btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {c.pending && (c.uploadingFiles ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.uploadingFiles!.map((name, i) => (
                        <span
                          key={`${name}-${i}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-2.5 py-1 text-caption text-[var(--ap-fg-muted)]"
                        >
                          <FileIcon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
                          <span className="max-w-[160px] truncate">{name}</span>
                          <span className="text-[var(--ap-fg-faint)]">uploading…</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {c.attachments && c.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.attachments.map((att) => {
                        // A thumbnail that 404s is not a preview, so a
                        // broken one falls back to the filename chip
                        // instead of leaving a dead image box.
                        const showImage =
                          att.mimeType?.startsWith('image/') && !commentAttachmentViewer.isBroken(att.id)
                        return showImage ? (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => commentAttachmentViewer.open(toViewerDto(att))}
                            aria-label={`Preview ${att.filename}`}
                            className="block rounded-[var(--ap-radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ap-accent)]"
                          >
                            <img
                              src={cardCommentAttachmentSrc(att, attachmentUrl)}
                              alt={att.filename}
                              onError={() => commentAttachmentViewer.markBroken(att.id)}
                              className="max-h-48 rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] object-cover"
                            />
                          </button>
                        ) : (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => commentAttachmentViewer.open(toViewerDto(att))}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-2.5 py-1 text-caption text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ap-accent)]"
                          >
                            <FileIcon className="h-3 w-3 text-[var(--ap-fg-subtle)]" />
                            <span className="max-w-[160px] truncate">{att.filename}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
      </>

      {/* Activity log inline below comments */}
      {activityLogs.length > 0 && !hideDetails && (
        <div className="mt-6 border-t border-[var(--ap-border)] pt-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[var(--ap-fg-subtle)]" />
            <Eyebrow size="md" mono className="text-[var(--ap-fg-subtle)]">
              Activity ({activityLogs.length})
            </Eyebrow>
          </div>
          <ActivityFeed logs={activityLogs} users={users} labelDefs={labelDefs} />
        </div>
      )}
    </div>
  )
}
