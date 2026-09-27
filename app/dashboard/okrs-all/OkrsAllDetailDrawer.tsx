'use client'

/** OKR Explorer — side drawer with the selected row's details. */

import Link from 'next/link'
import SideDrawer from '@/components/ui/SideDrawer'
import { Button } from '@/components/ui/button'
import StatusPill from '@/components/shared/StatusPill'
import { Field, KindIcon, ProgressBar } from './OkrsAllPrimitives'
import { formatDate, statusOf, type Row } from './okrs-all-utils'

export function OkrsAllDetailDrawer({ selected, onClose }: { selected: Row | null; onClose: () => void }) {
  return (
    <SideDrawer open={!!selected} onClose={onClose} title={selected?.data.title ?? ''} width="lg">
      {selected && (
        <div className="space-y-4 text-body-sm">
          <div className="flex items-center gap-2">
            <KindIcon row={selected} />
            <span className="text-caption uppercase tracking-wide text-muted-foreground">
              {selected.kind === 'OBJ' ? `${selected.data.level?.toLowerCase()} objective`
                : selected.kind === 'KR' ? 'Key result' : 'Initiative'}
            </span>
            <div className="ml-auto"><StatusPill status={statusOf(selected)} /></div>
          </div>
          <Field label="Path">{selected.path.join(' › ')}</Field>
          {typeof selected.data.progress === 'number' && (
            <Field label="Progress">
              <ProgressBar value={selected.data.progress} status={statusOf(selected)} width={240} />
            </Field>
          )}
          {selected.data.owner && <Field label="Owner">{selected.data.owner.name ?? selected.data.owner.email}</Field>}
          {selected.data.team && <Field label="Team">{selected.data.team.name}</Field>}
          {selected.data.period && <Field label="Period">{selected.data.period.name}</Field>}
          {selected.kind === 'KR' && (
            <>
              <Field label="Start value">{selected.data.startValue} {selected.data.unit}</Field>
              <Field label="Current value">{selected.data.currentValue} {selected.data.unit}</Field>
              <Field label="Target value">{selected.data.targetValue} {selected.data.unit}</Field>
            </>
          )}
          <Field label="Expected start">{formatDate(selected.data.startDate)}</Field>
          <Field label="Expected end">{formatDate(selected.data.endDate ?? selected.data.dueDate)}</Field>
          {selected.data.href && (
            <Link href={selected.data.href} className="inline-block">
              <Button size="sm" className="h-8 rounded-[var(--ap-radius-sm)] text-xs">Open full page</Button>
            </Link>
          )}
        </div>
      )}
    </SideDrawer>
  )
}
