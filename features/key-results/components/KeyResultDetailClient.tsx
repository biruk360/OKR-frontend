'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flag,
  Link2,
  MoreHorizontal,
  Plug,
  Share2,
  Sparkles,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { getProgressColor } from '@/lib/utils'
import { formatAxisValue } from '@/lib/keyResultChart'
import KeyResultProgressChart from './KeyResultProgressChart'
import CreateCheckInModal from './CreateCheckInModal'
import { ToDoList } from '@/features/todos'
import EditKeyResultButton from './EditKeyResultButton'
import { useDashboardTitleContext } from '@/components/layout/DashboardTitleContext'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'

function safePct(p: unknown): number {
  const n = typeof p === 'number' ? p : Number(p)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), 100)
}

type TimeframeLike = {
  startDate: string | Date
  endDate: string | Date
  name?: string
} | null

export interface KeyResultDetailClientProps {
  keyResult: any
  objective: {
    id: string
    title: string
    timeframe?: TimeframeLike
    department?: { id: string; name: string } | null
    owner?: { id: string; name: string; avatar?: string | null }
  }
  checkIns: any[]
  siblingNav: {
    index: number
    total: number
    prevId: string | null
    nextId: string | null
  }
  canEdit: boolean
  users: any[]
  isRedacted: boolean
  todoCount: number
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-0 border-t border-gray-100 text-sm text-gray-600">{children}</div>}
    </div>
  )
}

export default function KeyResultDetailClient({
  keyResult: kr,
  objective,
  checkIns,
  siblingNav,
  canEdit,
  users,
  isRedacted,
  todoCount,
}: KeyResultDetailClientProps) {
  const router = useRouter()
  const { setOverrideTitle } = useDashboardTitleContext()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setOverrideTitle(kr.title)
    return () => setOverrideTitle(null)
  }, [kr.title, setOverrideTitle])

  const timeframe = objective.timeframe ?? null
  const deadline =
    timeframe?.endDate != null
      ? format(new Date(timeframe.endDate), 'MMM d, yyyy')
      : null
  const unit = kr.unit || ''

  const pct = safePct(
    kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : kr.progress
  )

  const chartCheckIns = isRedacted
    ? []
    : checkIns.map((c) => ({ asOfDate: c.asOfDate, value: c.value }))

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const afterMutation = () => {
    router.refresh()
  }

  const showCheckIn = canEdit && kr.status === 'ACTIVE' && !isRedacted

  return (
    <div className="space-y-6">
      {/* Action bar (was a sticky page header). Lives inside the dashboard shell so the sidebar stays visible. */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href={`/dashboard/objectives/${objective.id}`}
            className="shrink-0 text-gray-500 hover:text-gray-800 p-1 rounded-md hover:bg-gray-100"
            title="Back to objective"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <p className="text-sm text-gray-600 truncate hidden sm:block max-w-md lg:max-w-xl">
            {objective.title}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showCheckIn ? (
            <button
              type="button"
              onClick={() => setCheckInOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
            >
              Create check-in
            </button>
          ) : null}
          <button
            type="button"
            onClick={copyShare}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((m) => !m)}
              className="p-2 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border border-gray-200 bg-white shadow-lg py-1 text-sm">
                  <Link
                    href={`/dashboard/objectives/${objective.id}`}
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    View objective
                  </Link>
                </div>
              </>
            ) : null}
          </div>
          <Link
            href={`/dashboard/objectives/${objective.id}`}
            className="p-2 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            title="Close"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8">
          <main className="space-y-6 min-w-0">
            <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
              <Flag className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="line-clamp-2">
                <span className="font-medium">{objective.title}</span>
                {deadline ? <span className="text-amber-800/90"> · Target {deadline}</span> : null}
              </span>
            </div>

            {siblingNav.total > 1 ? (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  {siblingNav.prevId ? (
                    <Link
                      href={`/dashboard/key-results/${siblingNav.prevId}`}
                      className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="p-2 text-gray-300">
                      <ChevronLeft className="h-4 w-4" />
                    </span>
                  )}
                  <span className="px-2 tabular-nums">
                    {siblingNav.index + 1} of {siblingNav.total}
                  </span>
                  {siblingNav.nextId ? (
                    <Link
                      href={`/dashboard/key-results/${siblingNav.nextId}`}
                      className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="p-2 text-gray-300">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            <p className="text-lg font-semibold leading-snug text-gray-900 sm:text-xl">{kr.title}</p>

            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
              <KeyResultProgressChart
                keyResult={kr}
                checkIns={chartCheckIns}
                timeframe={timeframe}
                height={320}
                showTodayMarker={!isRedacted}
              />
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-gray-700">Goal</span>
                  <span className={`font-semibold ${getProgressColor(safePct(pct))}`}>{Math.round(safePct(pct))}%</span>
                </div>
                <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      getProgressColor(safePct(pct)).split(' ')[0].replace('text-', 'bg-')
                    }`}
                    style={{ width: `${safePct(pct)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {isRedacted ? (
                    'Progress details are hidden for this private key result.'
                  ) : (
                    <>
                      Starting {unit} {formatAxisValue(Number(kr.startValue) || 0)} → target {unit}{' '}
                      {formatAxisValue(Number(kr.targetValue) || 0)}
                    </>
                  )}
                </p>
              </div>
            </div>

            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Timeline</h2>
              {!isRedacted && checkIns.length === 0 ? (
                <div className="text-center py-10 px-4 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-600 mb-4">
                    <Bot className="h-8 w-8" />
                  </div>
                  <p className="text-gray-700 font-medium mb-1">Waiting for the first check-in</p>
                  <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                    Record progress to see trends and history on this key result.
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {showCheckIn ? (
                      <button
                        type="button"
                        onClick={() => setCheckInOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                      >
                        Create the first check-in
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-400 cursor-not-allowed"
                      title="Coming soon"
                    >
                      <Plug className="h-4 w-4" />
                      Connect a data source
                    </button>
                  </div>
                  {canEdit && !isRedacted ? (
                    <div className="mt-6 flex items-center justify-center gap-2">
                      <EditKeyResultButton
                        keyResult={kr}
                        users={users}
                        canEdit={canEdit}
                        onUpdated={afterMutation}
                      />
                      <span className="text-sm text-gray-500">Edit details</span>
                    </div>
                  ) : null}
                </div>
              ) : !isRedacted ? (
                <ul className="space-y-4">
                  {[...checkIns].reverse().map((c) => (
                    <li
                      key={c.id}
                      className="border-l-2 border-blue-500 pl-4 py-1"
                    >
                      <div className="flex flex-wrap items-baseline gap-2 text-sm">
                        <time className="font-medium text-gray-900">
                          {format(new Date(c.asOfDate), 'PP')}
                        </time>
                        <span className="text-gray-600">
                          {unit} {formatAxisValue(c.value)}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.confidence === 'ON_TRACK'
                              ? 'bg-green-100 text-green-800'
                              : c.confidence === 'AT_RISK'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {String(c.confidence).replace(/_/g, ' ')}
                        </span>
                      </div>
                      {c.analysis ? (
                        <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{c.analysis}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-gray-400">by {c.createdBy?.name ?? 'Unknown'}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Check-in history is not shown for private key results.</p>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Initiatives ({todoCount})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-gray-400 px-2 py-1 rounded border border-dashed border-gray-200">
                    Import
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white opacity-60 cursor-not-allowed"
                    title="Coming soon"
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate via AI
                  </span>
                </div>
              </div>
              <div className="p-4">
                {!isRedacted ? (
                  <ToDoList keyResultId={kr.id} keyResult={kr} users={users} variant="embedded" />
                ) : (
                  <p className="text-sm text-gray-500">Initiatives are managed from the objective page.</p>
                )}
              </div>
            </section>
          </main>

          <aside className="space-y-4 lg:sticky lg:top-24 self-start">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Data connector</h3>
              <button
                type="button"
                disabled
                className="w-full text-left text-sm text-gray-400 py-2 px-3 rounded-md border border-dashed border-gray-200 cursor-not-allowed"
              >
                Connect a data source
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/80 p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-10 w-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-violet-600">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Assistant</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Draft a check-in from your latest progress (coming soon).
                  </p>
                  <button
                    type="button"
                    disabled
                    className="mt-3 w-full text-sm font-medium py-2 px-3 rounded-md bg-violet-600 text-white opacity-50 cursor-not-allowed"
                  >
                    Generate check-in
                  </button>
                </div>
              </div>
            </div>

            <Collapsible title="Relationships" defaultOpen={false}>
              <p className="text-gray-500 py-2">No dependencies linked yet.</p>
            </Collapsible>

            <Collapsible title="Details" defaultOpen>
              <div className="space-y-3 pt-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Owner</p>
                  <div className="flex items-center gap-2">
                    {kr.owner?.avatar ? (
                      <img src={kr.owner.avatar} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                        {(kr.owner?.name || '?').slice(0, 1)}
                      </div>
                    )}
                    <span className="text-gray-900">{kr.owner?.name ?? 'Unknown'}</span>
                  </div>
                </div>
                {objective.department ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Team</p>
                    <p className="text-gray-800">{objective.department.name}</p>
                  </div>
                ) : null}
                {objective.owner && objective.owner.id !== kr.ownerId ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Objective owner</p>
                    <p className="text-gray-800">{objective.owner.name}</p>
                  </div>
                ) : null}
                <div className="pt-2 flex flex-wrap gap-2">
                  <EditKeyResultButton
                    keyResult={kr}
                    users={users}
                    canEdit={canEdit && !isRedacted}
                    onUpdated={afterMutation}
                  />
                </div>
              </div>
            </Collapsible>

            <Collapsible title="Notifications" defaultOpen={false}>
              <p className="text-gray-500 py-2 text-xs">
                E-mail reminders use your OKR rules in Settings. Slack and watchers are not configured yet.
              </p>
            </Collapsible>

            <Collapsible title="Links" defaultOpen={false}>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 text-sm text-gray-400 cursor-not-allowed"
              >
                <Link2 className="h-4 w-4" />
                Add link
              </button>
            </Collapsible>
          </aside>
        </div>

        <div className="mt-6">
          <ActivityLogPanel entityType="key-result" entityId={kr.id} />
        </div>
      </div>

      {showCheckIn ? (
        <CreateCheckInModal
          isOpen={checkInOpen}
          onClose={() => setCheckInOpen(false)}
          keyResult={kr}
          objectiveTimeframe={timeframe}
          onSuccess={() => {
            setCheckInOpen(false)
            afterMutation()
          }}
        />
      ) : null}
    </div>
  )
}
