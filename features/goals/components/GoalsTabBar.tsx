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
  showUserView = false
}: GoalsTabBarProps) {
  return (
    <div className="bg-card border-b border-border">
      <div className="flex flex-col gap-2 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1 shrink-0 rounded-md border border-border p-0.5 bg-background">
          {showUserView && (
            <button
              onClick={() => onViewModeChange('user')}
              className={cn(
                'h-7 px-2 text-xs font-medium rounded transition-colors flex items-center gap-1',
                viewMode === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              <span>User</span>
            </button>
          )}
          <button
            onClick={() => onViewModeChange('list')}
            className={cn(
              'h-7 px-2 text-xs font-medium rounded transition-colors flex items-center gap-1',
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <List className="h-3.5 w-3.5" />
            <span>List</span>
          </button>
          <button
            onClick={() => onViewModeChange('feed')}
            className={cn(
              'h-7 px-2 text-xs font-medium rounded transition-colors flex items-center gap-1',
              viewMode === 'feed'
                ? 'bg-blue-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <Rss className="h-3.5 w-3.5" />
            <span>Feed</span>
          </button>
        </div>
      </div>
    </div>
  )
}

