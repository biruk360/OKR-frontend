'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
// StarterKit 3.22+ already includes Link and Underline — registering them
// separately would trigger Tiptap's "duplicate extension names" warning and
// can clobber the configured options. We configure them via StarterKit instead.
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Link as LinkIcon,
  Table as TableIcon,
  Trash2,
  Plus,
  Minus,
  Undo2,
  Redo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LetterLang } from '../i18n'

interface Props {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  lang?: LetterLang
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-600 transition-colors',
        'hover:bg-gray-100 hover:text-gray-900',
        active && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-gray-200" aria-hidden />
}

export default function LetterBodyEditor({ value, onChange, disabled, lang = 'en' }: Props) {
  const editor = useEditor({
    editable: !disabled,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: 'text-blue-600 underline underline-offset-2 hover:text-blue-700',
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          },
        },
      }),
      Placeholder.configure({
        placeholder:
          lang === 'am'
            ? 'የደብዳቤውን ይዘት እዚህ ይጻፉ… ለቦታ ያዢዎች {{customer_name}}፣ {{date}}፣ {{reference_number}} ይጠቀሙ።'
            : 'Write the letter body here… Use {{customer_name}}, {{date}}, {{reference_number}} for placeholders.',
      }),
      Table.configure({ resizable: true, HTMLAttributes: { class: 'letter-table' } }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        // The min-height + padding gives the editor the "page" feeling the user
        // asked for. Real multi-page rendering is server-side in the PDF; this
        // is just the writing surface.
        class: cn(
          'letter-editor-surface prose prose-sm max-w-none focus:outline-none',
          'min-h-[600px] px-12 py-10 bg-white',
          lang === 'am' && 'font-amharic'
        ),
        dir: lang === 'am' ? 'ltr' : 'ltr',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? '' : editor.getHTML())
    },
  })

  if (!editor) return null

  const insertTable = () =>
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()

  const isTable = editor.isActive('table')

  return (
    <div className="rounded-md border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50/60 p-1.5">
        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive('underline')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive('strike')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          title="Bulleted list"
          active={editor.isActive('bulletList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive('blockquote')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          title="Insert link"
          active={editor.isActive('link')}
          disabled={disabled}
          onClick={() => {
            const url = window.prompt('URL', editor.getAttributes('link').href || 'https://')
            if (url === null) return
            if (url === '') {
              editor.chain().focus().unsetLink().run()
            } else {
              editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
            }
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Insert table" disabled={disabled} onClick={insertTable}>
          <TableIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        {isTable && (
          <>
            <ToolbarButton
              title="Add row below"
              disabled={disabled}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Plus className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Delete row"
              disabled={disabled}
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <Minus className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Delete table"
              disabled={disabled}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        )}
        <Divider />
        <ToolbarButton
          title="Undo"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <div className="letter-editor-canvas bg-gray-100/40 p-6">
        {/* A4-ish page frame for visual feedback. Real pagination is in the PDF. */}
        <div className="mx-auto max-w-[820px] rounded-sm bg-white shadow-md ring-1 ring-gray-200">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
