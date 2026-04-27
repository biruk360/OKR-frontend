'use client'

import { useState } from 'react'
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
  const currentLabel = availableTabs.find(t => t.id === activeTab)?.label ?? 'Goals'

  return (
    <div className="space-y-3">
      {/* AP Hero */}
      <header className="px-1">
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Goals</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {currentLabel} · view, filter and track your OKRs.
        </p>
      </header>

      {/* AP Tab Bar Card */}
      <div
        className="rounded-[14px] border bg-card overflow-hidden"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <GoalsTabBar
          tabs={availableTabs}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as GoalTab)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showUserView={activeTab === 'my-team'}
        />
      </div>

      {/* Content */}
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
