'use client'

import { List, Rss, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
  available: boolean
}

interface GoalsTabBarProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tab: string) => void
  viewMode: 'list' | 'feed' | 'user'
  onViewModeChange: (mode: 'list' | 'feed' | 'user') => void
  showUserView?: boolean
}

export default function GoalsTabBar({
  tabs,
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  showUserView = false,
}: GoalsTabBarProps) {
  return (
    <div
      className="border-b"
      style={{
        background: 'var(--ap-bg, #fff)',
        borderColor: 'var(--ap-border, hsl(var(--border)))',
      }}
    >
      <div className="flex flex-col gap-2 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="inline-flex h-8 items-center gap-0.5 rounded-[10px] p-0.5"
          style={{ background: 'rgba(120,120,128,0.08)' }}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'h-7 px-3 text-[12px] font-medium rounded-[8px] transition-all',
                  active ? 'shadow-sm' : 'hover:bg-white/50'
                )}
                style={{
                  background: active ? 'var(--ap-bg, #fff)' : 'transparent',
                  color: active
                    ? 'var(--ap-fg, hsl(var(--foreground)))'
                    : 'var(--ap-fg-muted, hsl(var(--muted-foreground)))',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          className="inline-flex h-8 items-center gap-0.5 rounded-[10px] p-0.5 shrink-0"
          style={{ background: 'rgba(120,120,128,0.08)' }}
        >
          {showUserView && (
            <ViewModeButton
              active={viewMode === 'user'}
              onClick={() => onViewModeChange('user')}
              icon={<Users className="h-3.5 w-3.5" />}
              label="User"
            />
          )}
          <ViewModeButton
            active={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            icon={<List className="h-3.5 w-3.5" />}
            label="List"
          />
          <ViewModeButton
            active={viewMode === 'feed'}
            onClick={() => onViewModeChange('feed')}
            icon={<Rss className="h-3.5 w-3.5" />}
            label="Feed"
          />
        </div>
      </div>
    </div>
  )
}

function ViewModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 text-[12px] font-medium rounded-[8px] transition-all flex items-center gap-1.5',
        active ? 'shadow-sm' : 'hover:bg-white/50'
      )}
      style={{
        background: active ? 'var(--ap-accent, #007aff)' : 'transparent',
        color: active ? '#fff' : 'var(--ap-fg-muted, hsl(var(--muted-foreground)))',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
