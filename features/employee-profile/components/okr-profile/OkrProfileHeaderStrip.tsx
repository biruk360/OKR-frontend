'use client'

/**
 * PRF-8 header strip: objectives, KRs, average progress, committed vs
 * aspirational split, next checkpoint and last check-in date.
 */
import { CalendarClock, Gauge, History, Layers, Target, TrendingUp } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { formatDay, formatRelativeDay } from './OkrProfileParts'
import type { OkrProfileHeader } from './types'

export interface OkrProfileHeaderStripProps {
  header: OkrProfileHeader
  /** First name (or "their") for helper text. */
  subjectName: string
}

export function OkrProfileHeaderStrip({ header, subjectName }: OkrProfileHeaderStripProps) {
  const contributed = header.objectives - header.ownedObjectives
  const { committed, aspirational, mixed, unset } = header.commitment
  const splitHelper = [mixed > 0 ? `C/A ${mixed}` : null, unset > 0 ? `${unset} not set` : null].filter(Boolean).join(' · ')
  const next = header.nextCheckpoint

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="OKR summary">
      <StatCard
        label="Objectives"
        value={header.objectives}
        icon={Target}
        tone="blue"
        helperText={contributed > 0 ? `${header.ownedObjectives} owned · ${contributed} contributed` : `${header.ownedObjectives} owned`}
      />
      <StatCard label="Key results" value={header.keyResults} icon={Layers} tone="indigo" helperText={`Owned by ${subjectName}`} />
      <StatCard
        label="Average progress"
        value={header.averageProgress === null ? '—' : `${header.averageProgress}%`}
        icon={TrendingUp}
        tone={header.averageProgress === null ? 'gray' : header.averageProgress >= 70 ? 'green' : header.averageProgress >= 40 ? 'yellow' : 'red'}
        helperText={header.keyResults > 0 ? 'Across own key results' : 'Across objectives'}
      />
      <StatCard
        label="Committed · Aspirational"
        value={
          <span className="font-mono tabular-nums">
            C {committed} · A {aspirational}
          </span>
        }
        icon={Gauge}
        tone="purple"
        helperText={splitHelper || 'Aspirational: 70% = success'}
      />
      <StatCard
        label="Next checkpoint"
        value={next ? `${next.label} · ${formatDay(next.dueDate)}` : '—'}
        icon={CalendarClock}
        tone={next ? 'yellow' : 'gray'}
        helperText={next ? next.keyResultLabel : 'No pending checkpoints'}
      />
      <StatCard
        label="Last check-in"
        value={formatRelativeDay(header.lastCheckInAt) ?? '—'}
        icon={History}
        tone="gray"
        helperText={header.lastCheckInAt ? formatDay(header.lastCheckInAt, { year: true }) ?? undefined : 'No check-ins yet'}
      />
    </div>
  )
}
