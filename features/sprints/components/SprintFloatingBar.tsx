'use client'

/**
 * SprintFloatingBar — bottom-floating pill dock with Inbox / Planner / Board /
 * Switch boards tabs. Mounted only inside the sprint board route.
 *
 * Geometry from design-import/"Modal design optimization with Trello"/Sprint
 * Board.dc.html: 5px padding, 3px gap, 99px radius, 34px tabs at 0 14px,
 * 13px/600, backdrop blur, --ap-shadow-dock.
 *
 * Stays inline rather than becoming a shared `FloatingDock` — §4 of
 * docs/design_refresh_IMPLEMENTATION_STRATEGY.md, one consumer.
 *
 * The `dark` fork is the contrast-critical one: on the graphite board ground a
 * near-white dock is the only element that cannot borrow the ground's darkness,
 * so it flips to a dark fill with light ink (~10:1) instead of muted ink on
 * white (~2:1 against what sits behind it).
 */

import { Inbox, Calendar, Columns, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SprintBoardView = 'board' | 'planner' | 'inbox'

interface Props {
  view: SprintBoardView
  onViewChange: (next: SprintBoardView) => void
  onSwitchBoards: () => void
  inboxCount?: number
  /** True only for the `graphite` background preset (isDarkBackground). */
  dark?: boolean
}

interface TabDef {
  key: SprintBoardView | 'switch'
  label: string
  Icon: typeof Inbox
}

const TABS: TabDef[] = [
  { key: 'inbox',   label: 'Inbox',         Icon: Inbox },
  { key: 'planner', label: 'Planner',       Icon: Calendar },
  { key: 'board',   label: 'Board',         Icon: Columns },
  { key: 'switch',  label: 'Switch boards', Icon: LayoutGrid },
]

export default function SprintFloatingBar({ view, onViewChange, onSwitchBoards, inboxCount, dark }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[18px] z-40 flex justify-center px-4">
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-[3px] rounded-[var(--ap-radius-pill)] border p-[5px] backdrop-blur-lg',
          dark && 'text-white',
        )}
        style={{
          background: dark ? 'oklch(0.24 0.02 262 / 0.94)' : 'oklch(0.99 0.002 262 / 0.94)',
          borderColor: dark ? 'oklch(1 0 0 / 0.16)' : 'var(--ap-border)',
          // The dark dock sits on a dark fill, so it needs the deeper ramp.
          boxShadow: dark
            ? '0 14px 34px -10px oklch(0.2 0.04 260 / 0.5)'
            : 'var(--ap-shadow-dock)',
        }}
      >
        {TABS.map(({ key, label, Icon }) => {
          const active = key === view
          const isSwitch = key === 'switch'
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (isSwitch) onSwitchBoards()
                else onViewChange(key as SprintBoardView)
              }}
              className={cn(
                'inline-flex h-[34px] items-center gap-[7px] rounded-[var(--ap-radius-pill)] px-[14px] text-[13px] font-semibold transition-colors',
                !active && (dark ? 'hover:bg-white/10' : 'hover:bg-[var(--ap-bg-hover)]'),
              )}
              style={{
                background: active ? 'var(--ap-accent)' : 'transparent',
                color: active
                  ? 'var(--ap-accent-fg)'
                  : dark
                    ? 'oklch(0.96 0.004 262)'
                    : 'var(--ap-fg-secondary)',
              }}
              aria-pressed={active}
            >
              <Icon className="h-[15px] w-[15px]" />
              <span>{label}</span>
              {key === 'inbox' && (inboxCount ?? 0) > 0 && (
                <span
                  className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-[var(--ap-radius-pill)] px-1 text-[10px] font-bold"
                  style={{
                    background: active ? 'oklch(1 0 0 / 0.25)' : 'var(--ap-danger)',
                    color: 'oklch(1 0 0)',
                  }}
                >
                  {inboxCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
