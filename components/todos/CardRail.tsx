'use client'

/**
 * Card modal right rail ("Add to card" + "Actions") and the watch / more /
 * close cluster that sits at its top. On a closed sprint the rail is hidden
 * and TodoCardModal renders the cluster inline instead. Split out of
 * TodoCardModal.tsx; behaviour unchanged.
 */

import { useRef } from 'react'
import type { ReactNode } from 'react'
import {
  X, Check, Trash2, Paperclip, Tag, Users, Calendar, MoreHorizontal, CheckSquare,
  Image as ImageIcon, Link2, Target, Eye, EyeOff, Copy, Archive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CARD_PALETTE, swatchStyle } from '@/lib/card-visuals'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ActionsMenu } from '@/components/ui/ActionsMenu'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { CardPanel, CardPatch, TodoCardData } from './cardModalTypes'

export interface CardActionClusterProps {
  todo: TodoCardData
  sprintClosed: boolean
  isWatching: boolean
  watchPending: boolean
  toggleWatch: () => void
  copyCardLink: () => void
  duplicateCard: () => void
  setConfirmDelete: (v: boolean) => void
  onClose: () => void
}

/** Watch · more · close. */
export function CardActionCluster({
  todo, sprintClosed, isWatching, watchPending, toggleWatch, copyCardLink, duplicateCard, setConfirmDelete, onClose,
}: CardActionClusterProps) {
  return (
    <>
      <button
        onClick={toggleWatch}
        disabled={watchPending}
        aria-label={isWatching ? 'Stop watching this card' : 'Watch this card'}
        aria-pressed={isWatching}
        title={isWatching ? 'Watching — click to stop' : 'Watch this card'}
        className={cn(
          'inline-flex h-[30px] items-center gap-1.5 rounded-[var(--ap-radius-sm)] px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60',
          isWatching
            ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)] hover:bg-[var(--ap-accent-soft)]'
            : 'text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]',
        )}
      >
        {isWatching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{isWatching ? 'Watching' : 'Watch'}</span>
      </button>
      <ActionsMenu
        label="More card actions"
        align="right"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--ap-radius-sm)] text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
        trigger={<MoreHorizontal className="h-4 w-4" />}
        items={[
          {
            key: 'copy-link',
            label: 'Copy card link',
            icon: Link2,
            hidden: !todo.sprintId,
            onSelect: () => copyCardLink(),
          },
          {
            key: 'duplicate',
            label: 'Duplicate card',
            icon: Copy,
            hidden: sprintClosed,
            onSelect: () => duplicateCard(),
          },
          {
            key: 'delete',
            label: 'Delete card',
            icon: Trash2,
            destructive: true,
            hidden: sprintClosed,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--ap-radius-sm)] text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
      >
        <X className="h-4 w-4" />
      </button>
    </>
  )
}

export interface CardRailProps {
  todo: TodoCardData
  sprintClosed: boolean
  patch: CardPatch
  cardActionCluster: ReactNode
  activePanel: CardPanel
  setActivePanel: (panel: CardPanel) => void
  panelAnchor: 'grid' | 'rail'
  togglePanel: (panel: CardPanel, anchor: 'grid' | 'rail') => (open: boolean) => void
  membersPicker: ReactNode
  labelsPanel: ReactNode
  datesPanel: ReactNode
  newChecklistTitle: string
  setNewChecklistTitle: (v: string) => void
  addChecklist: () => void
  uploadAttachment: (file: File) => void
  colorBlind: boolean
  setColorBlindMode: (v: boolean) => void
  copyCardLink: () => void
  setConfirmDelete: (v: boolean) => void
}

export function CardRail({
  todo, sprintClosed, patch, cardActionCluster, activePanel, setActivePanel, panelAnchor, togglePanel,
  membersPicker, labelsPanel, datesPanel, newChecklistTitle, setNewChecklistTitle, addChecklist,
  uploadAttachment, colorBlind, setColorBlindMode, copyCardLink, setConfirmDelete,
}: CardRailProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <div className={cn(
      'w-full border-t border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] px-5 pb-7 pt-5 md:w-[232px] md:max-h-[calc(100vh-140px)] md:overflow-y-auto md:border-l md:border-t-0',
      sprintClosed && 'hidden',
    )}>
      <div className="mb-[18px] flex items-center justify-end gap-0.5">
        {cardActionCluster}
      </div>

      <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Add to card</Eyebrow>
      <div className="flex flex-col gap-0.5">
        {/* Members, Labels and Dates each render a SECOND popover here,
            anchored to the rail row rather than to the attribute grid.
            Same content, same `activePanel` slot — `panelAnchor` decides
            which of the two opens, so a panel always appears at the
            control you pressed. `side="left"` keeps it over the card
            body instead of off the right edge of the modal. */}
        <Popover
          open={activePanel === 'members' && panelAnchor === 'rail'}
          onOpenChange={togglePanel('members', 'rail')}
        >
          <PopoverTrigger asChild>
            <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
              <Users className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Members
            </button>
          </PopoverTrigger>
          <PopoverContent label="Card members" heading="Card members" width={272} align="start" side="left">
            {membersPicker}
          </PopoverContent>
        </Popover>

        <Popover
          open={activePanel === 'labels' && panelAnchor === 'rail'}
          onOpenChange={togglePanel('labels', 'rail')}
        >
          <PopoverTrigger asChild>
            <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
              <Tag className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Labels
            </button>
          </PopoverTrigger>
          <PopoverContent label="Labels" heading="Labels" width={276} align="start" side="left">
            <div className="max-h-[420px] overflow-y-auto">{labelsPanel}</div>
          </PopoverContent>
        </Popover>

        {/* Checklist — popover stays inside the rail, so it is sized to fit
            the 232px track: the rail scrolls, and a scroll container clips
            horizontally whatever its children stick out by. */}
        <div className="relative">
          <Popover
            open={activePanel === 'checklist'}
            onOpenChange={(o) => setActivePanel(o ? 'checklist' : null)}
          >
            <PopoverTrigger asChild>
              <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                <CheckSquare className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Checklist
              </button>
            </PopoverTrigger>
            <PopoverContent label="New checklist" heading="New checklist" width={232} align="end" side="left">
              <>
                <input
                  autoFocus
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Checklist title…"
                  className="ap-input h-8 w-full py-0 text-body-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') addChecklist() }}
                />
                <button
                  onClick={addChecklist}
                  className="mt-2 h-8 w-full rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] text-body-sm font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)]"
                >
                  Add checklist
                </button>
              </>
            </PopoverContent>
          </Popover>
        </div>

        <Popover
          open={activePanel === 'dates' && panelAnchor === 'rail'}
          onOpenChange={togglePanel('dates', 'rail')}
        >
          <PopoverTrigger asChild>
            <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
              <Calendar className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Dates
            </button>
          </PopoverTrigger>
          <PopoverContent label="Dates" heading="Dates" width={340} align="start" side="left">
            {datesPanel}
          </PopoverContent>
        </Popover>

        <button onClick={() => fileInputRef.current?.click()} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
          <Paperclip className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Attachment
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach(uploadAttachment)
            e.target.value = ''
          }}
        />

        {/* Cover — popover also sized to the rail track. */}
        <div className="relative">
          <Popover
            open={activePanel === 'cover'}
            onOpenChange={(o) => setActivePanel(o ? 'cover' : null)}
          >
            <PopoverTrigger asChild>
              <button className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
                <ImageIcon className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Cover
              </button>
            </PopoverTrigger>
            <PopoverContent label="Cover" heading="Cover" width={244} align="end" side="left">
              <>
                {/* Size (CVR-1) */}
                <Eyebrow size="md" mono className="mb-1.5 text-[var(--ap-fg-subtle)]">Size</Eyebrow>
                <div className="mb-3 grid grid-cols-2 gap-1.5">
                  {([
                    { key: 'BAND', label: 'Band' },
                    { key: 'FULL', label: 'Full bleed' },
                  ] as const).map((opt) => {
                    const active = (todo.coverSize ?? 'BAND') === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        aria-pressed={active}
                        disabled={!todo.coverColor}
                        onClick={() => patch({ coverSize: opt.key })}
                        className={cn(
                          'rounded-[var(--ap-radius-xs)] border px-2 py-1.5 text-caption font-semibold transition-colors disabled:opacity-40',
                          active
                            ? 'border-[var(--ap-accent)] bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
                            : 'border-[var(--ap-border-strong)] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]',
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Colours */}
                <Eyebrow size="md" mono className="mb-1.5 text-[var(--ap-fg-subtle)]">Colors</Eyebrow>
                <div className="grid grid-cols-5 gap-1.5">
                  {CARD_PALETTE.map((sw) => {
                    const active = todo.coverColor?.toLowerCase() === sw.hex.toLowerCase()
                    return (
                      <button
                        key={sw.key}
                        type="button"
                        aria-label={sw.label}
                        aria-pressed={active}
                        onClick={() => patch({ coverColor: sw.hex, coverSize: todo.coverSize ?? 'BAND' })}
                        className={cn(
                          'h-7 w-full rounded-[var(--ap-radius-xs)] border-2 transition-transform hover:scale-110',
                          active ? 'border-[var(--ap-fg)]' : 'border-transparent',
                        )}
                        style={swatchStyle(sw.hex, { colorBlind, pattern: sw.pattern, ink: 'rgba(255,255,255,0.5)' })}
                        title={sw.label}
                      />
                    )
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setColorBlindMode(!colorBlind)}
                  aria-pressed={colorBlind}
                  className="mt-3 w-full rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] px-2 py-1.5 text-caption font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)]"
                >
                  {colorBlind ? 'Disable' : 'Enable'} colorblind friendly mode
                </button>

                {todo.coverColor && (
                  <button
                    type="button"
                    onClick={() => { patch({ coverColor: null, coverSize: null }); setActivePanel(null) }}
                    className="mt-1.5 w-full rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-caption font-semibold text-[var(--ap-danger-fg)] transition-colors hover:bg-[var(--ap-danger-bg)]"
                  >
                    Remove cover
                  </button>
                )}
              </>
            </PopoverContent>
          </Popover>
        </div>

        <button onClick={() => setActivePanel(activePanel === 'link' ? null : 'link')} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
          <Target className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Link OKR
        </button>
      </div>

      <div className="my-4 h-px bg-[var(--ap-border)]" />

      <Eyebrow size="md" mono className="mb-2 text-[var(--ap-fg-subtle)]">Actions</Eyebrow>
      <div className="flex flex-col gap-0.5">
        <button onClick={() => { patch({ status: 'COMPLETED' }) }} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
          <Check className="h-[15px] w-[15px] text-[var(--ap-ok)]" /> Mark done
        </button>
        {todo.sprintId && (
          <button onClick={copyCardLink} className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]">
            <Link2 className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" /> Copy link
          </button>
        )}
        <button
          onClick={() => patch({ archived: !todo.archivedAt })}
          className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-fg)] transition-colors hover:bg-[var(--ap-bg-hover)]"
        >
          <Archive className="h-[15px] w-[15px] text-[var(--ap-fg-subtle)]" />
          {todo.archivedAt ? 'Restore from archive' : 'Archive'}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex h-[34px] w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 text-left text-body-sm font-medium text-[var(--ap-danger-fg)] transition-colors hover:bg-[var(--ap-danger-bg)]"
        >
          <Trash2 className="h-[15px] w-[15px]" /> Delete card
        </button>
      </div>
    </div>
  )
}
