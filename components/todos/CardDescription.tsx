'use client'

/**
 * Card modal description: Tiptap editor with save/cancel and formatting help,
 * link previews of the saved description, or the "add a description" prompt.
 * Split out of TodoCardModal.tsx; behaviour unchanged.
 */

import { AlignLeft } from 'lucide-react'
import type { UserForSelection } from '@/hooks/useUsersForSelection'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LinkPreviewList } from '@/components/shared/LinkPreview'
import { MentionEditor } from './MentionEditor'
import type { CardPanel, TodoCardData } from './cardModalTypes'

export interface CardDescriptionProps {
  todo: TodoCardData
  sprintClosed: boolean
  users: UserForSelection[]
  activePanel: CardPanel
  setActivePanel: (panel: CardPanel) => void
  descDraft: string
  setDescDraft: (v: string) => void
  saveDescription: () => void
}

export function CardDescription({
  todo, sprintClosed, users, activePanel, setActivePanel, descDraft, setDescDraft, saveDescription,
}: CardDescriptionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <AlignLeft className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" />
        <h3 className="text-sm font-semibold text-[var(--ap-fg-muted)]">Description</h3>
      </div>
      {activePanel === 'description' || todo.description ? (
        <div>
          <MentionEditor
            value={descDraft}
            onChange={setDescDraft}
            placeholder="Add a more detailed description…"
            users={users}
            minHeight={80}
          />
          {activePanel === 'description' && (
            <div className="mt-2 flex items-center gap-2">
              <button onClick={saveDescription} className="ap-btn ap-btn-primary ap-btn-sm">Save</button>
              <button onClick={() => { setDescDraft(todo.description ?? ''); setActivePanel(null) }} className="ap-btn ap-btn-secondary ap-btn-sm">Cancel</button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="ml-auto text-caption text-[var(--ap-fg-muted)] underline-offset-2 hover:underline"
                  >
                    Formatting help
                  </button>
                </PopoverTrigger>
                <PopoverContent label="Formatting help" heading="Formatting" align="end" className="w-[260px]">
                  <ul className="space-y-1.5 text-xs text-[var(--ap-fg-muted)]">
                    <li><strong className="text-[var(--ap-fg)]">Bold / italic</strong> — toolbar, or ⌘B / ⌘I</li>
                    <li><strong className="text-[var(--ap-fg)]">Lists</strong> — toolbar, or start a line with <code>-</code> or <code>1.</code></li>
                    <li><strong className="text-[var(--ap-fg)]">Mention</strong> — type <code>@</code> then a name</li>
                    <li><strong className="text-[var(--ap-fg)]">Links</strong> — paste a URL over selected text</li>
                    <li><strong className="text-[var(--ap-fg)]">Save</strong> — ⌘↵ (Ctrl+↵ on Windows)</li>
                  </ul>
                </PopoverContent>
              </Popover>
            </div>
          )}
          {/* LPV-1 — previews follow the SAVED description, not the draft. */}
          {activePanel !== 'description' && todo.description && (
            <LinkPreviewList html={todo.description} className="mt-2" />
          )}
        </div>
      ) : (
        <button
          onClick={() => setActivePanel('description')}
          disabled={sprintClosed}
          className="w-full rounded-[var(--ap-radius-md)] bg-[var(--ap-bg-sunken)] px-3.5 py-3 text-left text-[13.5px] leading-[1.65] text-[var(--ap-fg-subtle)] transition-colors hover:bg-[var(--ap-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sprintClosed ? 'No description' : 'Add a more detailed description…'}
        </button>
      )}
    </div>
  )
}
