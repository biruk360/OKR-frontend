'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Network, Building2, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MapMode } from '../types'

const MODES: { id: MapMode; label: string; icon: any; hint: string }[] = [
  { id: 'strategy', label: 'Strategy',  icon: GitBranch, hint: 'Objective parent/child alignment' },
  { id: 'org',      label: 'Org',       icon: Network,   hint: 'Company → departments → people → OKRs' },
  { id: 'combined', label: 'Combined',  icon: Building2, hint: 'Org tree with strategic alignment overlay' },
]

export function ModeToggle({ value }: { value: MapMode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setMode(m: MapMode) {
    const next = new URLSearchParams(params.toString())
    if (m === 'strategy') next.delete('mode')
    else next.set('mode', m)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
      style={{ borderColor: 'var(--ap-border-strong, #e5e7eb)', background: '#fff' }}
    >
      {MODES.map((m) => {
        const Icon = m.icon
        const active = value === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            title={m.hint}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
              active ? 'text-white' : 'text-muted-foreground hover:bg-black/5'
            )}
            style={active ? { background: 'var(--ap-accent, #2563eb)' } : undefined}
          >
            <Icon className="size-3" />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
