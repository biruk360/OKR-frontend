'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { UserForSelection } from '@/hooks/useUsersForSelection'
import {
  Bold, Italic, List, ListOrdered, Code, Undo2, Redo2,
} from 'lucide-react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  users?: UserForSelection[]
  onSubmit?: () => void
  minHeight?: number
  autoFocus?: boolean
  className?: string
}

interface SuggestionItem {
  id: string
  label: string
}

function MentionList({
  items,
  command,
  anchorRect,
}: {
  items: SuggestionItem[]
  command: (item: SuggestionItem) => void
  anchorRect: DOMRect | null
}) {
  if (!anchorRect || items.length === 0) return null
  return createPortal(
    <div
      className="fixed z-[200] w-56 overflow-hidden rounded-xl border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)]"
      style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); command(item) }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ap-accent-soft)] text-[10px] font-semibold text-[var(--ap-accent)]">
            {item.label.slice(0, 2).toUpperCase()}
          </span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}

export function MentionEditor({ value, onChange, placeholder, users = [], onSubmit, minHeight = 80, autoFocus, className }: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const commandRef = useRef<((item: SuggestionItem) => void) | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write something…' }),
      Mention.configure({
        HTMLAttributes: { class: 'mention', 'data-mention-id': '' },
        renderLabel: ({ node }) => `@${node.attrs.label}`,
        suggestion: {
          items: ({ query }) => {
            return users
              .filter((u) => (u.name ?? '').toLowerCase().includes(query.toLowerCase()))
              .slice(0, 8)
              .map((u) => ({ id: u.id, label: u.name }))
          },
          render: () => {
            return {
              onStart: (props) => {
                setSuggestions(props.items as SuggestionItem[])
                commandRef.current = props.command
                const { from } = props.editor.state.selection
                const coords = props.editor.view.coordsAtPos(from)
                setAnchorRect(new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top))
              },
              onUpdate: (props) => {
                setSuggestions(props.items as SuggestionItem[])
                commandRef.current = props.command
                const { from } = props.editor.state.selection
                const coords = props.editor.view.coordsAtPos(from)
                setAnchorRect(new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top))
              },
              onExit: () => { setSuggestions([]); setAnchorRect(null) },
              onKeyDown: ({ event }) => event.key === 'Escape',
            }
          },
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    autofocus: autoFocus ?? false,
  })

  // Sync external value changes (e.g. reset after submit)
  useEffect(() => {
    if (editor && value === '') editor.commands.clearContent()
  }, [value, editor])

  if (!editor) return null

  return (
    <div className={cn('flex flex-col rounded-[10px] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-[var(--ap-border)] px-2 py-1">
        {[
          { cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), icon: <Bold className="h-3.5 w-3.5" />, label: 'Bold' },
          { cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), icon: <Italic className="h-3.5 w-3.5" />, label: 'Italic' },
          { cmd: () => editor.chain().focus().toggleCode().run(), active: editor.isActive('code'), icon: <Code className="h-3.5 w-3.5" />, label: 'Code' },
          { cmd: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), icon: <List className="h-3.5 w-3.5" />, label: 'Bullet list' },
          { cmd: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), icon: <ListOrdered className="h-3.5 w-3.5" />, label: 'Ordered list' },
        ].map(({ cmd, active, icon, label }) => (
          <button
            key={label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cmd}
            title={label}
            className={cn('rounded p-1 text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-sunken)] hover:text-[var(--ap-fg)] transition-colors', active && 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg)]')}
          >
            {icon}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-[var(--ap-border)]" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()} title="Undo" className="rounded p-1 text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-sunken)] disabled:opacity-30" disabled={!editor.can().undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()} title="Redo" className="rounded p-1 text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-sunken)] disabled:opacity-30" disabled={!editor.can().redo()}>
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 text-[13px] text-[var(--ap-fg)] focus-within:outline-none [&_.mention]:text-[var(--ap-accent)] [&_.mention]:font-medium"
        style={{ minHeight }}
        onKeyDown={(e) => {
          if (onSubmit && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />

      {suggestions.length > 0 && commandRef.current && (
        <MentionList
          items={suggestions}
          command={(item) => {
            commandRef.current?.({ id: item.id, label: item.label } as unknown as SuggestionItem)
            setSuggestions([])
            setAnchorRect(null)
          }}
          anchorRect={anchorRect}
        />
      )}
    </div>
  )
}
