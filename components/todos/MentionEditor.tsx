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
  selectedIndex,
  onHover,
}: {
  items: SuggestionItem[]
  command: (item: SuggestionItem) => void
  anchorRect: DOMRect | null
  selectedIndex: number
  onHover: (index: number) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)

  // Keep the keyboard-selected row visible when the list scrolls.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!anchorRect || items.length === 0) return null

  // Flip above the caret when there is not enough room below, so the list is
  // never cut off at the bottom of the viewport.
  const ESTIMATED_ROW = 40
  const height = Math.min(items.length, 8) * ESTIMATED_ROW
  const openUp = anchorRect.bottom + 4 + height > window.innerHeight
  const top = openUp ? Math.max(8, anchorRect.top - 4 - height) : anchorRect.bottom + 4

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="Mention a person"
      // `pointer-events: auto` is required, not cosmetic: this portals to
      // document.body, and the card modal is a Radix modal Dialog, which sets
      // `pointer-events: none` on the body while open. Without this the list
      // renders but no click ever reaches it.
      className="pointer-events-auto fixed z-[200] max-h-[320px] w-56 overflow-y-auto rounded-xl border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)]"
      style={{ top, left: Math.min(anchorRect.left, window.innerWidth - 240) }}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          data-index={index}
          role="option"
          aria-selected={index === selectedIndex}
          // mousedown, not click: the editor would lose focus first and the
          // suggestion would close before a click ever landed.
          onMouseDown={(e) => { e.preventDefault(); command(item) }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--ap-fg)] transition-colors',
            index === selectedIndex ? 'bg-[var(--ap-bg-hover)]' : 'hover:bg-[var(--ap-bg-hover)]',
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ap-accent-soft)] text-[10px] font-semibold text-[var(--ap-accent)]">
            {item.label.slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}

export function MentionEditor({ value, onChange, placeholder, users = [], onSubmit, minHeight = 80, autoFocus, className }: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const commandRef = useRef<((item: SuggestionItem) => void) | null>(null)
  // TipTap's onKeyDown is registered once and closes over the first render, so
  // it cannot read state directly — these refs give it the live values.
  const suggestionsRef = useRef<SuggestionItem[]>([])
  const selectedIndexRef = useRef(0)

  const applySuggestions = (items: SuggestionItem[]) => {
    suggestionsRef.current = items
    setSuggestions(items)
    // Re-filtering changes what is under the cursor, so selection restarts.
    selectedIndexRef.current = 0
    setSelectedIndex(0)
  }

  const moveSelection = (delta: number) => {
    const count = suggestionsRef.current.length
    if (count === 0) return
    const next = (selectedIndexRef.current + delta + count) % count
    selectedIndexRef.current = next
    setSelectedIndex(next)
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write something…' }),
      Mention.configure({
        // `data-mention-id` used to be a hardcoded empty string here, so every
        // saved mention rendered `data-mention-id=""` and the server-side
        // extractor (which required one-or-more characters) never matched —
        // tagging someone in a to-do comment notified nobody. TipTap keeps the
        // id in node.attrs.id; renderHTML writes it out per node so it survives
        // into the stored HTML.
        HTMLAttributes: { class: 'mention' },
        // v3 hands this { options, node, suggestion } — no HTMLAttributes arg.
        renderHTML: ({ node }) => [
          'span',
          {
            class: 'mention',
            'data-type': 'mention',
            'data-id': String(node.attrs.id ?? ''),
            'data-mention-id': String(node.attrs.id ?? ''),
            'data-label': String(node.attrs.label ?? ''),
          },
          `@${node.attrs.label ?? ''}`,
        ],
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
                applySuggestions(props.items as SuggestionItem[])
                commandRef.current = props.command
                const { from } = props.editor.state.selection
                const coords = props.editor.view.coordsAtPos(from)
                setAnchorRect(new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top))
              },
              onUpdate: (props) => {
                applySuggestions(props.items as SuggestionItem[])
                commandRef.current = props.command
                const { from } = props.editor.state.selection
                const coords = props.editor.view.coordsAtPos(from)
                setAnchorRect(new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top))
              },
              onExit: () => {
                applySuggestions([])
                setAnchorRect(null)
              },
              // Previously this only returned true for Escape, so Arrow keys
              // moved the caret and Enter inserted a newline — the list could
              // be opened but never navigated. Returning true tells TipTap the
              // key was consumed and stops it reaching the editor.
              onKeyDown: ({ event }) => {
                if (event.key === 'Escape') return true
                if (suggestionsRef.current.length === 0) return false
                if (event.key === 'ArrowDown') { moveSelection(1); return true }
                if (event.key === 'ArrowUp') { moveSelection(-1); return true }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const item = suggestionsRef.current[selectedIndexRef.current]
                  if (!item) return false
                  commandRef.current?.(item)
                  return true
                }
                return false
              },
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
    <div className={cn('flex flex-col rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] overflow-hidden', className)}>
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
            applySuggestions([])
            setAnchorRect(null)
          }}
          anchorRect={anchorRect}
          selectedIndex={selectedIndex}
          onHover={(index) => {
            // Keep mouse and keyboard on the same row, so Enter after hovering
            // picks what the user is looking at.
            selectedIndexRef.current = index
            setSelectedIndex(index)
          }}
        />
      )}
    </div>
  )
}
