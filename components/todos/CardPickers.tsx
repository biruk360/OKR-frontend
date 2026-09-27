'use client'

/**
 * Popover bodies shared by the card modal's attribute grid and its right rail:
 * the member picker and the labels panel. Each is rendered at two anchors (the
 * grid control and the rail row), so they live here once instead of twice.
 * Split out of TodoCardModal.tsx; behaviour unchanged.
 */

import { Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CARD_PALETTE, swatchStyle, readableInk } from '@/lib/card-visuals'
import type { UserForSelection } from '@/hooks/useUsersForSelection'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PersonTooltip } from '@/components/shared/UserAvatar'
import { Avatar } from './CardModalBits'
import type { LabelDef, TodoCardData } from './cardModalTypes'

export function CardMemberPicker({
  users, todo, toggleMember,
}: {
  users: UserForSelection[]
  todo: TodoCardData
  toggleMember: (userId: string) => void
}) {
  return (
    <div className="max-h-[300px] space-y-px overflow-y-auto">
      {users.map((u) => {
        const isMember = todo.members.some((m) => m.user.id === u.id)
        return (
          <button
            key={u.id}
            onClick={() => toggleMember(u.id)}
            className={cn('flex w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2 py-1.5 text-left text-body-sm transition-colors', isMember ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]' : 'text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)]')}
          >
            <Avatar id={u.id} name={u.name ?? u.email} size={26} />
            <PersonTooltip person={u} whenTruncated side="left"><span className="flex-1 truncate">{u.name ?? u.email}</span></PersonTooltip>
            {isMember && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

export interface CardLabelsPanelProps {
  todo: TodoCardData
  labelDefs: LabelDef[]
  labelSearch: string
  setLabelSearch: (v: string) => void
  toggleLabel: (labelDefId: string) => void
  colorBlind: boolean
  /** DELETE /api/todo-labels/[id] is ADMIN-only; the trash button follows the session role. */
  sessionRole: string | undefined
  setConfirmLabel: (label: LabelDef) => void
  newLabelName: string
  setNewLabelName: (v: string) => void
  createLabel: () => void
  newLabelColor: string
  setNewLabelColor: (hex: string) => void
}

export function CardLabelsPanel({
  todo, labelDefs, labelSearch, setLabelSearch, toggleLabel, colorBlind, sessionRole,
  setConfirmLabel, newLabelName, setNewLabelName, createLabel, newLabelColor, setNewLabelColor,
}: CardLabelsPanelProps) {
  return (
    <>
      <input
        value={labelSearch}
        onChange={(e) => setLabelSearch(e.target.value)}
        placeholder="Search labels…"
        className="ap-input mb-2 h-8 w-full py-0 text-body-sm"
      />
      <div className="space-y-1">
        {labelDefs
          .filter((ld) => !labelSearch.trim() || ld.name.toLowerCase().includes(labelSearch.toLowerCase()))
          .map((ld) => {
            const active = todo.labels.some((l) => l.labelDef.id === ld.id)
            return (
              <div key={ld.id} className="group flex items-center gap-1.5">
                <button
                  onClick={() => toggleLabel(ld.id)}
                  className="flex flex-1 items-center gap-2 rounded-[var(--ap-radius-sm)] px-1.5 py-1 transition-colors hover:bg-[var(--ap-bg-hover)]"
                >
                  <span
                    className="h-[26px] min-w-0 flex-1 truncate rounded-[var(--ap-radius-xs)] px-2.5 pt-[5px] text-left text-xs font-semibold"
                    style={{
                      ...swatchStyle(ld.color, { colorBlind, ink: 'rgba(255,255,255,0.5)' }),
                      color: readableInk(ld.color),
                    }}
                  >
                    {ld.name}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--ap-accent)]" />}
                </button>
                {/* DELETE /api/todo-labels/[id] is ADMIN-only; don't offer it to anyone else. */}
                {sessionRole === 'ADMIN' && (
                <button
                  onClick={() => setConfirmLabel(ld)}
                  title="Delete label"
                  aria-label={`Delete label ${ld.name}`}
                  className="p-1 text-[var(--ap-fg-subtle)] opacity-0 transition-opacity hover:text-[var(--ap-danger)] group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                )}
              </div>
            )
          })}
        {labelDefs.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--ap-fg-subtle)]">No labels yet — create one below.</p>
        )}
      </div>

      <div className="mt-3 border-t border-[var(--ap-border)] pt-3">
        <Eyebrow size="md" mono className="mb-1.5 text-[var(--ap-fg-subtle)]">Create label</Eyebrow>
        <input
          value={newLabelName}
          onChange={(e) => setNewLabelName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createLabel() }}
          placeholder="Label name…"
          className="ap-input h-8 w-full py-0 text-body-sm"
        />
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {CARD_PALETTE.map((sw) => (
            <button
              key={sw.key}
              onClick={() => setNewLabelColor(sw.hex)}
              aria-label={sw.label}
              aria-pressed={newLabelColor === sw.hex}
              className={cn('h-6 rounded-[var(--ap-radius-xs)] border-2 transition-transform hover:scale-105', newLabelColor === sw.hex ? 'border-[var(--ap-fg)]' : 'border-transparent')}
              style={swatchStyle(sw.hex, { colorBlind, pattern: sw.pattern, ink: 'rgba(255,255,255,0.5)' })}
              title={sw.label}
            />
          ))}
        </div>
        <button
          onClick={createLabel}
          disabled={!newLabelName.trim()}
          className="mt-2 h-8 w-full rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] text-body-sm font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </>
  )
}
