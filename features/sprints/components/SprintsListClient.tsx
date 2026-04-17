'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Layout, Calendar } from 'lucide-react'

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

  return (
    <div className=" min-h-screen">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sprints</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Trello-style boards for marketing &amp; business teams. Each board has dynamic columns for status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-outline btn-primary"
          >
            <Plus className="h-3.5 w-3.5" /> New sprint
          </button>
        </div>

        {creating && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSprint()
                if (e.key === 'Escape') { setCreating(false); setName('') }
              }}
              className="input"
              placeholder="Sprint name (e.g. Marketing Q2 W14)"
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={createSprint} disabled={!name.trim() || submitting} className="btn-outline btn-primary">
                {submitting ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => { setCreating(false); setName('') }} className="btn-outline">
                Cancel
              </button>
            </div>
          </div>
        )}

        {sprints.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Layout className="mx-auto h-8 w-8 text-[color:var(--text-xs text-muted-foreground)]" />
            <p className="mt-2 text-sm text-muted-foreground">No sprints yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sprints.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/sprints/${s.id}`}
                className="rounded-lg border border-border bg-card group block p-4 transition hover:border-[color:#d1d5db]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-[color:var(--text-sm)] truncate">{s.name}</h3>
                    {s.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  <Layout className="h-4 w-4 text-[color:var(--text-xs text-muted-foreground)] group-hover:text-[color:var(--text-sm)]" />
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-[color:var(--text-xs text-muted-foreground)]">
                  <span>{s.activitiesCount} activities</span>
                  <span>·</span>
                  <span>{s.columnsCount} columns</span>
                  {s.startDate && s.endDate && (
                    <>
                      <span>·</span>
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(s.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' → '}
                        {new Date(s.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Owner · {s.ownerName}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
