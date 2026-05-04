'use client'

/**
 * SprintFloatingBar — bottom-floating pill bar with Inbox / Planner / Board /
 * Switch boards tabs. Mounted only inside the sprint board route.
 */

import { Inbox, Calendar, Columns, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SprintBoardView = 'board' | 'planner' | 'inbox'

interface Props {
  view: SprintBoardView
  onViewChange: (next: SprintBoardView) => void
  onSwitchBoards: () => void
  inboxCount?: number
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

export default function SprintFloatingBar({ view, onViewChange, onSwitchBoards, inboxCount }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full border bg-white/85 px-1.5 py-1 shadow-popover backdrop-blur-md"
        style={{ borderColor: 'var(--ap-border)' }}
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
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
                active
                  ? 'bg-primary-500 text-white shadow'
                  : 'text-foreground hover:bg-muted',
              )}
              aria-pressed={active}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              {key === 'inbox' && (inboxCount ?? 0) > 0 && (
                <span
                  className={cn(
                    'ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                    active ? 'bg-white/25 text-white' : 'bg-danger-500 text-white',
                  )}
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
