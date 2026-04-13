import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Link2,
  Pencil,
  Plus,
  Target,
  Users,
} from 'lucide-react'

const keyResults = [
  {
    title: 'Complete user authentication module',
    status: 'At Risk',
    owner: 'Alex Rodriguez',
    due: 'Apr 30',
    delta: '+4% this week',
    target: '100%',
    current: '15%',
    confidence: 'Medium',
    initiativesDone: '3/5',
    progress: 15,
    initiatives: [
      { title: 'Set up authentication routes', owner: 'AR', due: 'Apr 08', done: false },
      { title: 'Implement JWT token system', owner: 'AR', due: 'Apr 10', done: true },
      { title: 'Add password hashing + session guard', owner: 'AR', due: 'Apr 11', done: true },
      { title: 'Create login audit logs', owner: 'TM', due: 'Apr 15', done: false },
      { title: 'Write unit tests for auth services', owner: 'AR', due: 'Apr 18', done: false },
    ],
  },
  {
    title: 'Implement role-based access control',
    status: 'At Risk',
    owner: 'Alex Rodriguez',
    due: 'May 15',
    delta: '+1% this week',
    target: '100%',
    current: '3%',
    confidence: 'Low',
    initiativesDone: '1/2',
    progress: 3,
    initiatives: [
      { title: 'Define permission matrix', owner: 'AR', due: 'May 02', done: true },
      { title: 'Apply policy checks in API', owner: 'AR', due: 'May 08', done: false },
    ],
  },
]

const collaborators = ['AR', 'SJ', 'MJ', 'TM']

const contributingOkrs = [
  { name: 'Team Goal 1: Security Playbooks', progress: 12 },
  { name: 'Team Goal 2: Performance Hardening', progress: 12 },
  { name: 'Team Goal 3: REST API Resilience', progress: 12 },
]

const recentActivity = [
  {
    title: 'Alex R. updated an initiative',
    detail: 'Status: PENDING → COMPLETED',
    time: 'yesterday',
  },
  {
    title: 'Alex R. checked in',
    detail: 'Confidence updated to AT RISK',
    time: '2 days ago',
  },
]

export default function ObjectiveDesignPage() {
  return (
    <div className="atlas-surface -m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="atlas-card p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <span className="badge-secondary">Individual Objective</span>
                <h1 className="text-2xl font-semibold text-[color:var(--atlas-n800)]">
                  Implement Authentication System
                </h1>
                <p className="text-body text-[color:var(--atlas-n200)] max-w-xl">
                  Build a secure, scalable authentication system for the new product features to
                  ensure user data protection and seamless access.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="atlas-btn atlas-btn-sm">
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </button>
                  <button className="atlas-btn atlas-btn-primary atlas-btn-sm">
                    <Plus className="mr-2 h-3.5 w-3.5" /> Add Key Result
                  </button>
                </div>
              </div>
              <div className="atlas-card w-full max-w-sm border-[color:var(--atlas-n30)] p-4 shadow-none">
                <div className="flex items-center gap-4">
                  <div className="relative h-14 w-14">
                    <svg viewBox="0 0 36 36" className="h-14 w-14">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--atlas-n20)"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--atlas-warning)"
                        strokeWidth="4"
                        strokeDasharray="9, 100"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[color:var(--atlas-n800)]">
                      9%
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--atlas-n800)]">Overall Progress</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="badge-warning">At Risk</span>
                      <span className="text-xs text-[color:var(--atlas-n100)]">Last updated: 10:27 AM</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[color:var(--atlas-n100)]">Total KRs</p>
                    <p className="text-lg font-semibold text-[color:var(--atlas-n800)]">2 Active</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[color:var(--atlas-n100)]">Avg Progress</p>
                    <p className="text-lg font-semibold text-[color:var(--atlas-n800)]">9%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-[color:var(--atlas-n30)] pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--atlas-n100)]">
                  Progress Timeline
                </p>
                <div className="flex items-center gap-4 text-xs text-[color:var(--atlas-n100)]">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-4 rounded-full bg-[color:var(--atlas-n30)]" /> Expected
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-4 rounded-full bg-[color:var(--atlas-primary)]" /> Actual
                  </span>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-[color:var(--atlas-n20)] bg-[color:var(--atlas-n0)] p-3">
                <svg viewBox="0 0 320 120" className="h-28 w-full">
                  <polyline
                    points="10,90 90,80 170,60 250,40 310,20"
                    fill="none"
                    stroke="var(--atlas-n30)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <polyline
                    points="10,96 90,94 170,93 250,92 310,91"
                    fill="none"
                    stroke="var(--atlas-primary)"
                    strokeWidth="2"
                  />
                  <circle cx="250" cy="92" r="5" fill="var(--atlas-primary)" />
                  <rect x="220" y="60" width="70" height="20" rx="10" fill="var(--atlas-primary)" />
                  <text x="255" y="74" textAnchor="middle" fontSize="10" fill="white">9% (Current)</text>
                </svg>
                <div className="flex justify-between text-[10px] text-[color:var(--atlas-n100)]">
                  <span>Jan 1</span>
                  <span>Feb 1</span>
                  <span>Mar 1</span>
                  <span>Mar 31</span>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--atlas-n800)]">Key Results</h2>
              <p className="text-body-sm text-[color:var(--atlas-n100)]">{keyResults.length} total</p>
            </div>
            <button className="atlas-btn atlas-btn-primary atlas-btn-sm">
              <Plus className="mr-2 h-3.5 w-3.5" /> Add KR
            </button>
          </section>

          <div className="space-y-4">
            {keyResults.map((kr) => (
              <article key={kr.title} className="atlas-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--atlas-primary-bg)]">
                      <Target className="h-5 w-5 text-[color:var(--atlas-primary)]" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-[color:var(--atlas-n800)]">{kr.title}</h3>
                        <span className="badge-warning">{kr.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[color:var(--atlas-n200)]">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" /> {kr.owner}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" /> Due {kr.due}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="h-4 w-4" /> {kr.delta}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="atlas-btn atlas-btn-sm">
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </button>
                    <button className="atlas-btn atlas-btn-primary atlas-btn-sm">Check-in</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-[color:var(--atlas-n20)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Target</p>
                    <p className="mt-1 text-lg font-semibold text-[color:var(--atlas-n800)]">{kr.target}</p>
                  </div>
                  <div className="rounded-lg border border-[color:var(--atlas-n20)] p-3 bg-[color:var(--atlas-primary-bg)]/40">
                    <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Current</p>
                    <p className="mt-1 text-lg font-semibold text-[color:var(--atlas-primary)]">{kr.current}</p>
                  </div>
                  <div className="rounded-lg border border-[color:var(--atlas-n20)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Confidence</p>
                    <p className="mt-1 text-lg font-semibold text-[color:var(--atlas-n800)]">{kr.confidence}</p>
                  </div>
                  <div className="rounded-lg border border-[color:var(--atlas-n20)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Initiatives</p>
                    <p className="mt-1 text-lg font-semibold text-[color:var(--atlas-n800)]">{kr.initiativesDone}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[color:var(--atlas-n200)]">Progress</span>
                    <span className="font-semibold text-[color:var(--atlas-n800)]">{kr.progress}%</span>
                  </div>
                  <div className="progress-bar mt-2">
                    <div className="progress-fill" style={{ width: `${kr.progress}%` }} />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <button className="atlas-btn atlas-btn-sm">
                      <ChevronDown className="mr-2 h-3.5 w-3.5" /> Initiatives ({kr.initiatives.length})
                    </button>
                    <button className="atlas-btn atlas-btn-sm">
                      <Plus className="mr-2 h-3.5 w-3.5" /> Add initiative
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {kr.initiatives.map((item) => (
                      <div
                        key={item.title}
                        className="flex items-center justify-between rounded-lg border border-[color:var(--atlas-n20)] bg-[color:var(--atlas-n0)] p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${
                              item.done
                                ? 'border-[color:var(--atlas-primary)] bg-[color:var(--atlas-primary)]/20'
                                : 'border-[color:var(--atlas-primary)]'
                            }`}
                          />
                          <div>
                            <p className={`text-sm font-medium ${item.done ? 'line-through text-[color:var(--atlas-n100)]' : 'text-[color:var(--atlas-n800)]'}`}>
                              {item.title}
                            </p>
                            <p className="text-xs text-[color:var(--atlas-n100)]">
                              Owner {item.owner} · Due {item.due}
                            </p>
                          </div>
                        </div>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--atlas-n20)] text-xs font-semibold text-[color:var(--atlas-n700)]">
                          {item.owner}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="atlas-card p-5">
            <h3 className="text-sm font-semibold text-[color:var(--atlas-n800)]">Objective Details</h3>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Owner</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--atlas-primary-bg)] text-xs font-semibold text-[color:var(--atlas-primary)]">
                    AR
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--atlas-n800)]">Alex Rodriguez</p>
                    <p className="text-xs text-[color:var(--atlas-n100)]">engineer1@company.com</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Timeframe</p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-[color:var(--atlas-n20)] px-3 py-2">
                  <Clock className="h-4 w-4 text-[color:var(--atlas-n100)]" />
                  <span className="font-medium text-[color:var(--atlas-n800)]">Q1 2026</span>
                  <span className="text-xs text-[color:var(--atlas-n100)]">Quarterly</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Primary Alignment</p>
                <div className="mt-2 rounded-lg border border-[color:var(--atlas-n20)] px-3 py-2">
                  <div className="flex items-center gap-2 text-[color:var(--atlas-primary)]">
                    <Link2 className="h-4 w-4" />
                    <p className="text-sm font-semibold">Launch New Product Features</p>
                  </div>
                  <p className="text-xs text-[color:var(--atlas-n100)]">Company Objective</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-[color:var(--atlas-n100)]">Department</p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-[color:var(--atlas-n20)] px-3 py-2">
                  <Users className="h-4 w-4 text-[color:var(--atlas-n100)]" />
                  <div>
                    <p className="text-sm font-medium text-[color:var(--atlas-n800)]">Engineering</p>
                    <p className="text-xs text-[color:var(--atlas-n100)]">Product & Engineering Div.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="atlas-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--atlas-n800)]">Collaborators</h3>
              <span className="text-xs text-[color:var(--atlas-n100)]">{collaborators.length} total</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {collaborators.map((c) => (
                <span
                  key={c}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--atlas-n20)] text-xs font-semibold text-[color:var(--atlas-n700)]"
                >
                  {c}
                </span>
              ))}
              <button className="atlas-icon-btn">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section className="atlas-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--atlas-n800)]">Contributing OKRs</h3>
              <span className="text-xs text-[color:var(--atlas-n100)]">{contributingOkrs.length} total</span>
            </div>
            <div className="mt-4 space-y-3">
              {contributingOkrs.map((okr) => (
                <div key={okr.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[color:var(--atlas-n700)]">{okr.name}</span>
                    <span className="text-[color:var(--atlas-n100)]">{okr.progress}%</span>
                  </div>
                  <div className="progress-bar mt-2">
                    <div className="progress-fill" style={{ width: `${okr.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="atlas-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--atlas-n800)]">Recent Activity</h3>
              <button className="text-xs font-medium text-[color:var(--atlas-primary)]">View all</button>
            </div>
            <div className="mt-4 space-y-4">
              {recentActivity.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--atlas-primary-bg)]">
                    <CheckCircle2 className="h-4 w-4 text-[color:var(--atlas-primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[color:var(--atlas-n800)]">{item.title}</p>
                    <p className="text-xs text-[color:var(--atlas-n100)]">{item.detail}</p>
                    <p className="text-xs text-[color:var(--atlas-n100)]">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
