'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Layout, Calendar, X } from 'lucide-react'

interface SprintRow {
  id: string
  name: string
  description: string | null
  ownerName: string
  ownerAvatar: string | null
  startDate: string | null
  endDate: string | null
  activitiesCount: number
  columnsCount: number
  isOwn: boolean
}

export default function SprintsListClient({ sprints }: { sprints: SprintRow[] }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function createSprint() {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Sprint created')
      setName('')
      setCreating(false)
      router.refresh()
      router.push(`/dashboard/sprints/${data.data.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create sprint')
    } finally {
      setSubmitting(false)
    }
  }

  const totalCards = sprints.reduce((s, x) => s + x.activitiesCount, 0)
  const totalCols = sprints.reduce((s, x) => s + x.columnsCount, 0)

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div
        className="rounded-[14px] border bg-card overflow-hidden"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-[24px] font-semibold leading-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              Sprints
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
              Trello-style boards for marketing &amp; business teams. Each board has dynamic columns for status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] h-8 px-3 text-[12px] font-semibold text-white"
            style={{ background: 'var(--ap-accent)' }}
          >
            <Plus className="h-3.5 w-3.5" /> New sprint
          </button>
        </div>
        <div
          className="grid grid-cols-3 border-t"
          style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
        >
          <StatCell label="Active sprints" value={String(sprints.length)} />
          <StatCell label="Total cards" value={String(totalCards)} divider accent="blue" />
          <StatCell label="Total columns" value={String(totalCols)} divider />
        </div>
      </div>

      {creating && (
        <div
          className="rounded-[14px] border bg-card p-3"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createSprint()
              if (e.key === 'Escape') {
                setCreating(false)
                setName('')
              }
            }}
            className="input rounded-[10px]"
            placeholder="Sprint name (e.g. Marketing Q2 W14)"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={createSprint}
              disabled={!name.trim() || submitting}
              className="inline-flex items-center gap-1 rounded-[10px] h-8 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--ap-accent)' }}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setName('')
              }}
              className="inline-flex items-center justify-center size-8 rounded-[10px] hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {sprints.length === 0 ? (
        <div
          className="rounded-[14px] border bg-card p-10 text-center"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <Layout className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            No sprints yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sprints.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/sprints/${s.id}`}
              className="group block rounded-[14px] border bg-card p-4 transition-all hover:shadow-md"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
                  >
                    Sprint
                  </span>
                  {s.isOwn && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
                    >
                      Owner
                    </span>
                  )}
                </div>
                <Layout className="h-4 w-4 text-muted-foreground" />
              </div>

              <h3 className="text-[15px] font-semibold leading-tight truncate" style={{ letterSpacing: '-0.01em' }}>
                {s.name}
              </h3>
              {s.description && (
                <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">
                  {s.description}
                </p>
              )}

              <div
                className="mt-3 flex items-center gap-3 text-[11px] tabular-nums"
                style={{ color: 'var(--ap-fg-muted)' }}
              >
                <span className="font-semibold">
                  {s.activitiesCount} <span className="font-normal text-muted-foreground">cards</span>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold">
                  {s.columnsCount} <span className="font-normal text-muted-foreground">cols</span>
                </span>
                {s.startDate && s.endDate && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(s.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {' → '}
                      {new Date(s.endDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground">
                Owner · <span style={{ color: 'var(--ap-fg-muted)' }}>{s.ownerName}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCell({
  label,
  value,
  divider,
  accent,
}: {
  label: string
  value: string
  divider?: boolean
  accent?: 'blue' | 'green'
}) {
  const color =
    accent === 'blue' ? 'var(--ap-accent)' : accent === 'green' ? 'var(--ap-green)' : 'var(--ap-fg)'
  return (
    <div
      className="flex flex-col justify-center gap-1 px-4 py-4"
      style={{ borderLeft: divider ? '1px solid var(--ap-border)' : undefined }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="text-[22px] font-semibold tabular-nums leading-none"
        style={{ letterSpacing: '-0.02em', color }}
      >
        {value}
      </p>
    </div>
  )
}
