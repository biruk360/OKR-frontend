'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import GoalsTabBar from './GoalsTabBar'
import GoalsListView from './GoalsListView'
import MyTeamView from './MyTeamView'

type GoalTab = 'my-goals' | 'my-team' | 'group-goals' | 'department' | 'company-goals'

interface GoalsPageClientProps {
  user: {
    id: string
    role: string
    name?: string | null
    email?: string | null
  }
}

export default function GoalsPageClient({ user }: GoalsPageClientProps) {
  const [activeTab, setActiveTab] = useState<GoalTab>('my-goals')
  const [viewMode, setViewMode] = useState<'list' | 'feed' | 'user'>('list')

  const tabs: { id: GoalTab; label: string; available: boolean }[] = [
    { id: 'my-goals', label: 'My Goals', available: true },
    { id: 'my-team', label: 'My Team', available: user.role === 'DEPARTMENT_LEAD' || user.role === 'ADMIN' || user.role === 'EXECUTIVE' },
    { id: 'group-goals', label: 'Group Goals', available: true },
    { id: 'department', label: 'Department', available: true },
    { id: 'company-goals', label: 'Company Goals', available: true },
  ]

  const availableTabs = tabs.filter(tab => tab.available)

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <GoalsTabBar
        tabs={availableTabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as GoalTab)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showUserView={activeTab === 'my-team'}
      />

      {/* Content based on active tab */}
      {activeTab === 'my-team' && viewMode === 'user' ? (
        <MyTeamView />
      ) : (
        <GoalsListView
          tab={activeTab}
          viewMode={viewMode === 'user' ? 'list' : viewMode}
        />
      )}
    </div>
  )
}

