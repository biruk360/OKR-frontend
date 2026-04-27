'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import {
  LayoutDashboard,
  Target,
  Key,
  CheckSquare,
  Kanban,
  Network,
  Layout,
  BarChart3,
  FileText,
  User,
  Settings,
  Plus,
  CheckCircle2,
  Search,
  ListTodo,
  Loader2,
} from 'lucide-react'
import { useCmdkStore } from '@/lib/stores/cmdk-store'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

interface SearchObjective {
  id: string
  title: string
  level: string
  goalStatus: string
  progress: number
}
interface SearchKeyResult {
  id: string
  title: string
  progress: number
  confidence: string
  objective: { id: string; title: string } | null
}
interface SearchTodo {
  id: string
  title: string
  status: string
  priority: string
}
interface SearchData {
  objectives: SearchObjective[]
  keyResults: SearchKeyResult[]
  todos: SearchTodo[]
}

const PAGE_ITEMS: { label: string; href: string; icon: typeof Target; hint?: string }[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, hint: 'G then D' },
  { label: 'Objectives', href: '/dashboard/objectives', icon: Target, hint: 'G then O' },
  { label: 'Key Results', href: '/dashboard/key-results', icon: Key, hint: 'G then K' },
  { label: 'To-dos', href: '/dashboard/todos', icon: CheckSquare, hint: 'G then T' },
  { label: 'Work Board', href: '/dashboard/work', icon: Kanban },
  { label: 'OKR Hierarchy', href: '/dashboard/okr-hierarchy', icon: Network },
  { label: 'Sprints', href: '/dashboard/sprints', icon: Layout },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Reports', href: '/dashboard/reports', icon: FileText },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

const QUICK_ACTIONS: { label: string; action: string; icon: typeof Plus; hint?: string }[] = [
  { label: 'Create objective', action: 'create-objective', icon: Plus, hint: 'C then O' },
  { label: 'Create to-do', action: 'create-todo', icon: ListTodo, hint: 'C then T' },
  { label: 'Create sprint', action: 'create-sprint', icon: Layout },
  { label: 'Check in', action: 'check-in', icon: CheckCircle2 },
]

async function fetchSearch(q: string): Promise<SearchData> {
  if (!q) return { objectives: [], keyResults: [], todos: [] }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Search failed')
  return json.data
}

export function CommandPalette() {
  const open = useCmdkStore((s) => s.open)
  const setOpen = useCmdkStore((s) => s.setOpen)
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [mounted, setMounted] = useState(false)
  const debouncedQuery = useDebounce(query, 200)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useCmdkStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const { data, isFetching } = useQuery({
    queryKey: ['cmdk-search', debouncedQuery],
    queryFn: () => fetchSearch(debouncedQuery),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 30_000,
  })

  if (!mounted || !open) return null

  const handleNavigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const handleAction = (action: string) => {
    setOpen(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cmdk:action', { detail: { action } }))
    }
  }

  const showQuickGroups = !debouncedQuery
  const showResults = !!debouncedQuery

  const palette = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ap-modal-enter w-[600px] max-w-[92vw] overflow-hidden rounded-[14px] bg-white"
        style={{
          background: 'var(--ap-bg-raised)',
          color: 'var(--ap-fg)',
          boxShadow: 'var(--ap-shadow-lg)',
          border: '0.5px solid var(--ap-border)',
        }}
      >
        <Command label="Command palette" loop>
          <div
            className="flex items-center gap-2 px-4"
            style={{ borderBottom: '1px solid var(--ap-border)' }}
          >
            <Search className="size-4" style={{ color: 'var(--ap-fg-subtle)' }} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search or jump to…"
              className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--ap-fg-subtle)]"
            />
            {isFetching && (
              <Loader2 className="size-4 animate-spin" style={{ color: 'var(--ap-fg-subtle)' }} />
            )}
          </div>

          <Command.List
            className="max-h-[420px] overflow-y-auto p-2"
          >
            <Command.Empty
              className="px-4 py-8 text-center text-[13px]"
              style={{ color: 'var(--ap-fg-subtle)' }}
            >
              No results.
            </Command.Empty>

            {showQuickGroups && (
              <>
                <CmdkGroup heading="Pages">
                  {PAGE_ITEMS.map((item) => (
                    <CmdkItem
                      key={item.href}
                      icon={<item.icon className="size-4" />}
                      label={item.label}
                      hint={item.hint}
                      onSelect={() => handleNavigate(item.href)}
                      value={`page-${item.label}`}
                    />
                  ))}
                </CmdkGroup>
                <CmdkGroup heading="Quick actions">
                  {QUICK_ACTIONS.map((item) => (
                    <CmdkItem
                      key={item.action}
                      icon={<item.icon className="size-4" />}
                      label={item.label}
                      hint={item.hint}
                      onSelect={() => handleAction(item.action)}
                      value={`action-${item.action}`}
                    />
                  ))}
                </CmdkGroup>
              </>
            )}

            {showResults && data && (
              <>
                {data.objectives.length > 0 && (
                  <CmdkGroup heading="Objectives">
                    {data.objectives.map((o) => (
                      <CmdkItem
                        key={`obj-${o.id}`}
                        icon={<Target className="size-4" />}
                        label={o.title}
                        hint={`${o.level} · ${Math.round(o.progress)}%`}
                        onSelect={() => handleNavigate(`/dashboard/objectives/${o.id}`)}
                        value={`obj-${o.id}-${o.title}`}
                      />
                    ))}
                  </CmdkGroup>
                )}
                {data.keyResults.length > 0 && (
                  <CmdkGroup heading="Key Results">
                    {data.keyResults.map((kr) => (
                      <CmdkItem
                        key={`kr-${kr.id}`}
                        icon={<Key className="size-4" />}
                        label={kr.title}
                        hint={kr.objective?.title ?? `${Math.round(kr.progress)}%`}
                        onSelect={() =>
                          handleNavigate(
                            kr.objective
                              ? `/dashboard/objectives/${kr.objective.id}/key-results/${kr.id}`
                              : `/dashboard/key-results/${kr.id}`,
                          )
                        }
                        value={`kr-${kr.id}-${kr.title}`}
                      />
                    ))}
                  </CmdkGroup>
                )}
                {data.todos.length > 0 && (
                  <CmdkGroup heading="To-dos">
                    {data.todos.map((t) => (
                      <CmdkItem
                        key={`todo-${t.id}`}
                        icon={<CheckSquare className="size-4" />}
                        label={t.title}
                        hint={t.status.toLowerCase()}
                        onSelect={() => handleNavigate(`/dashboard/todos?id=${t.id}`)}
                        value={`todo-${t.id}-${t.title}`}
                      />
                    ))}
                  </CmdkGroup>
                )}
              </>
            )}
          </Command.List>

          <div
            className="flex h-10 items-center justify-between px-4 text-[11px]"
            style={{
              borderTop: '1px solid var(--ap-border)',
              background: 'var(--ap-bg-sunken)',
              color: 'var(--ap-fg-subtle)',
            }}
          >
            <span>↑↓ navigate · ↵ select · esc close</span>
            <span className="font-mono">⌘K</span>
          </div>
        </Command>
      </div>
    </div>
  )

  return createPortal(palette, document.body)
}

function CmdkGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ap-fg-subtle)]"
    >
      {children}
    </Command.Group>
  )
}

function CmdkItem({
  icon,
  label,
  hint,
  onSelect,
  value,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onSelect: () => void
  value: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex h-9 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] outline-none',
        'data-[selected=true]:bg-[var(--ap-accent)] data-[selected=true]:text-white',
        'data-[selected=true]:[&_svg]:text-white',
      )}
    >
      <span className="flex size-5 items-center justify-center text-[var(--ap-fg-subtle)]">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="font-mono text-[11px] opacity-70">{hint}</span>
      )}
    </Command.Item>
  )
}
