import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

export function PerformanceStatusBadge({ status }: { status: string }) {
  const tone = status === 'FINALIZED' || status === 'PUBLISHED' || status === 'CLOSED'
    ? 'border-success-200 bg-success-50 text-success-700'
    : status === 'CALIBRATION' || status === 'DRAFT_SHARED'
      ? 'border-warning-200 bg-warning-50 text-warning-700'
      : status === 'ARCHIVED' || status === 'EXCUSED'
        ? 'border-border bg-muted text-muted-foreground'
        : 'border-primary-200 bg-primary-50 text-primary-700'
  return <Badge variant="outline" className={cn('text-[10px]', tone)}>{status.replace(/_/g, ' ')}</Badge>
}
