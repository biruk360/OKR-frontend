'use client'

import { useState } from 'react'
import { ArrowRight, History } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import CheckInTimeline from '@/components/key-result-detail/CheckInTimeline'
import EntityLink from './EntityLink'
import TimeframeBadge from './TimeframeBadge'

interface LineageEntity {
  id: string
  title: string
  finalGrade?: number | null
  finalProgress?: number | null
  finalConfidence?: string | null
  closureNote?: string | null
  unit?: string | null
  timeframe?: { name: string; type?: string | null } | null
  retrospective?: {
    whatWasAchieved?: string | null
    whatWeLearned?: string | null
    recommendedAction?: string | null
  } | null
  checkIns?: any[]
}

interface RolledFromBannerProps {
  entityType: 'objective' | 'key-result'
  previous?: LineageEntity | null
  next?: LineageEntity | null
  lineageDepth?: number
}

function RichText({ html }: { html?: string | null }) {
  if (!html) return <span className="text-muted-foreground">Not recorded</span>
  return <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function RolledFromBanner({ entityType, previous, next, lineageDepth = 0 }: RolledFromBannerProps) {
  const [performanceOpen, setPerformanceOpen] = useState(false)
  if (!previous && !next) return null

  return (
    <>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2 text-sm">
            {previous && (
              <div className="flex flex-wrap items-center gap-2">
                <History className="size-4 text-primary" />
                <span className="text-muted-foreground">Rolled from previous period</span>
                {previous.timeframe && <TimeframeBadge type={previous.timeframe.type} />}
                <EntityLink type={entityType} id={previous.id} label={previous.timeframe?.name || previous.title} />
                <span className="text-muted-foreground">— reached {Math.round(previous.finalProgress ?? 0)}%</span>
              </div>
            )}
            {next && (
              <div className="flex flex-wrap items-center gap-2">
                <ArrowRight className="size-4 text-primary" />
                <span className="text-muted-foreground">Rolled forward to</span>
                {next.timeframe && <TimeframeBadge type={next.timeframe.type} />}
                <EntityLink type={entityType} id={next.id} label={next.timeframe?.name || next.title} />
              </div>
            )}
            {lineageDepth > 1 && <p className="text-xs text-muted-foreground">Period {lineageDepth + 1} in this OKR lineage.</p>}
          </div>
          {previous && (
            <Button type="button" variant="outline" size="sm" onClick={() => setPerformanceOpen(true)}>
              View previous performance
            </Button>
          )}
        </div>
      </div>

      {previous && (
        <Modal open={performanceOpen} onClose={() => setPerformanceOpen(false)} title="Previous Period Performance" icon={History} iconClassName="text-primary" size="lg">
          <div className="space-y-5">
            <div>
              <EntityLink type={entityType} id={previous.id} label={previous.title} />
              <p className="mt-1 text-sm text-muted-foreground">{previous.timeframe?.name}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Final grade</p><p className="mt-1 text-lg font-semibold">{previous.finalGrade == null ? '—' : previous.finalGrade.toFixed(2)}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Progress</p><p className="mt-1 text-lg font-semibold">{Math.round(previous.finalProgress ?? 0)}%</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Confidence</p><p className="mt-1 text-sm font-semibold">{previous.finalConfidence?.replace(/_/g, ' ') || '—'}</p></div>
            </div>
            {previous.closureNote && <div><h4 className="text-sm font-medium">Closure note</h4><p className="mt-1 text-sm text-muted-foreground">{previous.closureNote}</p></div>}
            {previous.checkIns && previous.checkIns.length > 0 && <CheckInTimeline checkIns={previous.checkIns} unit={previous.unit || ''} />}
            <div><h4 className="text-sm font-medium">What was achieved</h4><div className="mt-2"><RichText html={previous.retrospective?.whatWasAchieved} /></div></div>
            <div><h4 className="text-sm font-medium">What we learned</h4><div className="mt-2"><RichText html={previous.retrospective?.whatWeLearned} /></div></div>
          </div>
        </Modal>
      )}
    </>
  )
}
