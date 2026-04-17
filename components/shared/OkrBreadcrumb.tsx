import Link from 'next/link'
import { ChevronRight, Building2, Target, Key } from 'lucide-react'

export interface BreadcrumbNode {
  id: string
  title: string
  /** Objective or KR. Controls the icon + badge colour. */
  kind: 'OBJ' | 'KR'
  /** Link target. If omitted the crumb renders as text only. */
  href?: string
  /** Optional short label e.g. "O-4" or "KR-8". */
  code?: string
  /** Short status text (right-most crumb). */
  status?: string
  /** Progress % (right-most crumb). */
  progress?: number
  /** Owner name for the active crumb. */
  ownerName?: string
}

interface Props {
  nodes: BreadcrumbNode[]
  /** Extra adornment rendered at the far right (e.g. Update button). */
  right?: React.ReactNode
  className?: string
}

/**
 * Hierarchical breadcrumb bar used on Objective & KR detail pages so the
 * parent/child relationship is visible without scrolling. Inspired by the
 * Jira for Confluence OKR breadcrumb design.
 */
export default function OkrBreadcrumb({ nodes, right, className }: Props) {
  if (nodes.length === 0) return null
  const last = nodes[nodes.length - 1]

  return (
    <div
      className={
        'flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm ' +
        (className ?? '')
      }
    >
      {nodes.map((n, i) => {
        const isLast = i === nodes.length - 1
        const Icon = n.kind === 'KR' ? Key : n.kind === 'OBJ' ? Target : Building2
        const badgeColour =
          n.kind === 'KR'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-violet-50 text-violet-700'
        const content = (
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${badgeColour}`}>
              <Icon className="h-3 w-3" />
              {n.code ?? n.kind}
            </span>
            <span className={isLast ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}>
              {n.title}
            </span>
          </span>
        )
        return (
          <span key={n.id} className="inline-flex items-center gap-2">
            {n.href && !isLast ? (
              <Link href={n.href} className="inline-flex items-center">{content}</Link>
            ) : (
              content
            )}
            {!isLast && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </span>
        )
      })}

      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        {typeof last.progress === 'number' && (
          <span className="tabular-nums">{Math.round(last.progress)}%</span>
        )}
        {last.status && <span className="uppercase tracking-wide">{last.status}</span>}
        {last.ownerName && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-5 w-5 rounded-full bg-emerald-500 text-[10px] text-white flex items-center justify-center">
              {(last.ownerName[0] ?? '?').toUpperCase()}
            </span>
            {last.ownerName}
          </span>
        )}
        {right}
      </div>
    </div>
  )
}
