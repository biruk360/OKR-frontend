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
    <div className="bg-white border-b border-gray-200">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* View Toggles */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showUserView && (
            <button
              onClick={() => onViewModeChange('user')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center space-x-1',
                viewMode === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <Users className="h-4 w-4" />
              <span>User View</span>
            </button>
          )}
          <button
            onClick={() => onViewModeChange('list')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center space-x-1',
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <List className="h-4 w-4" />
            <span>List View</span>
          </button>
          <button
            onClick={() => onViewModeChange('feed')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center space-x-1',
              viewMode === 'feed'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <Rss className="h-4 w-4" />
            <span>Feed View</span>
          </button>
        </div>
      </div>
    </div>
  )
}

