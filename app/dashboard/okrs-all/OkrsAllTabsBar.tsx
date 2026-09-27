'use client'

/** OKR Explorer — tab strip (All / Watched / My OKRs / At risk) + role-aware Create menu. */

import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CREATE_OPTIONS, type CreateLevel, type CreatePermissions, type Tab } from './okrs-all-utils'

function TabButton({
  label, active, count, onClick,
}: { label: string; active: boolean; count?: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // text-[13px] stays arbitrary: cn/twMerge would read `text-body-sm` as a colour and drop the colour class below.
        'inline-flex items-center gap-1.5 px-3 h-9 rounded-[var(--ap-radius-sm)] text-[13px] font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
      style={{ background: active ? 'var(--ap-bg-sunken)' : 'transparent' }}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-micro font-semibold tabular-nums"
          style={{
            background: active ? 'var(--ap-accent-soft)' : 'var(--ap-bg-sunken)',
            color: active ? 'var(--ap-accent)' : 'var(--ap-fg-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function OkrsAllTabsBar({
  tab, onTabChange, watchedCount, atRiskCount,
  createOpen, onCreateOpenChange, createPermissions, onPickCreateLevel,
}: {
  tab: Tab
  onTabChange: (tab: Tab) => void
  watchedCount: number | null
  atRiskCount: number | null
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  createPermissions: CreatePermissions
  onPickCreateLevel: (level: CreateLevel) => void
}) {
  const createOptions = CREATE_OPTIONS.filter((o) => createPermissions[o.level])

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <TabButton label="All" active={tab === 'all'} onClick={() => onTabChange('all')} />
        <TabButton label="Watched" active={tab === 'watched'} onClick={() => onTabChange('watched')} count={watchedCount} />
        <TabButton label="My OKRs" active={tab === 'mine'} onClick={() => onTabChange('mine')} />
        <TabButton label="At risk" active={tab === 'atRisk'} onClick={() => onTabChange('atRisk')} count={atRiskCount} />
      </div>

      {/* modal={false}: the picked item opens CreateObjectiveModal; a modal menu would fight its focus trap. */}
      <DropdownMenu open={createOpen} onOpenChange={onCreateOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-[var(--ap-radius-sm)] text-[13px] gap-1"
          >
            <Plus className="h-4 w-4" /> Create
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 rounded-[var(--ap-radius-md)] border bg-card p-1 shadow-lg"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          {createOptions.map((o) => (
            <DropdownMenuItem
              key={o.level}
              onSelect={() => { onCreateOpenChange(false); onPickCreateLevel(o.level) }}
              className="flex w-full items-center gap-2 rounded-[var(--ap-radius-sm)] px-2.5 py-2 text-left text-[13px] hover:bg-muted"
            >
              <o.icon className="h-4 w-4 text-muted-foreground" />
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
