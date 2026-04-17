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
    <div className=" -m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <span className="badge-secondary">Individual Objective</span>
                <h1 className="text-2xl font-semibold text-foreground">
                  Implement Authentication System
                </h1>
                <p className="text-body text-muted-foreground max-w-xl">
                  Build a secure, scalable authentication system for the new product features to
                  ensure user data protection and seamless access.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn-outline btn-sm">
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </button>
                  <button className="btn-outline btn-primary btn-sm">
                    <Plus className="mr-2 h-3.5 w-3.5" /> Add Key Result
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card w-full max-w-sm border-border p-4 shadow-none">
                <div className="flex items-center gap-4">
                  <div className="relative h-14 w-14">
                    <svg viewBox="0 0 36 36" className="h-14 w-14">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#ebecf0"
                        strokeWidth="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#d97706"
                        strokeWidth="4"
                        strokeDasharray="9, 100"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
                      9%
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Overall Progress</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="badge-warning">At Risk</span>
                      <span className="text-xs text-muted-foreground">Last updated: 10:27 AM</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total KRs</p>
                    <p className="text-lg font-semibold text-foreground">2 Active</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg Progress</p>
                    <p className="text-lg font-semibold text-foreground">9%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Progress Timeline
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-4 rounded-full bg-[color:hsl(var(--border))]" /> Expected
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-4 rounded-full bg-[color:#2563eb]" /> Actual
                  </span>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-border bg-card p-3">
                <svg viewBox="0 0 320 120" className="h-28 w-full">
                  <polyline
                    points="10,90 90,80 170,60 250,40 310,20"
                    fill="none"
                    stroke="#dfe1e6"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <polyline
                    points="10,96 90,94 170,93 250,92 310,91"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                  />
                  <circle cx="250" cy="92" r="5" fill="#2563eb" />
                  <rect x="220" y="60" width="70" height="20" rx="10" fill="#2563eb" />
                  <text x="255" y="74" textAnchor="middle" fontSize="10" fill="white">9% (Current)</text>
                </svg>
                <div className="flex justify-between text-[10px] text-muted-foreground">
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
              <h2 className="text-lg font-semibold text-foreground">Key Results</h2>
              <p className="text-body-sm text-muted-foreground">{keyResults.length} total</p>
            </div>
            <button className="btn-outline btn-primary btn-sm">
              <Plus className="mr-2 h-3.5 w-3.5" /> Add KR
            </button>
          </section>

          <div className="space-y-4">
            {keyResults.map((kr) => (
              <article key={kr.title} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-[color:#dbeafe]">
                      <Target className="h-5 w-5 text-primary-500" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{kr.title}</h3>
                        <span className="badge-warning">{kr.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
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
                    <button className="btn-outline btn-sm">
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </button>
                    <button className="btn-outline btn-primary btn-sm">Check-in</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Target</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{kr.target}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 bg-[color:#dbeafe]/40">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Current</p>
                    <p className="mt-1 text-lg font-semibold text-primary-500">{kr.current}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{kr.confidence}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Initiatives</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{kr.initiativesDone}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-foreground">{kr.progress}%</span>
                  </div>
                  <div className="progress-bar mt-2">
                    <div className="progress-fill" style={{ width: `${kr.progress}%` }} />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <button className="btn-outline btn-sm">
                      <ChevronDown className="mr-2 h-3.5 w-3.5" /> Initiatives ({kr.initiatives.length})
                    </button>
                    <button className="btn-outline btn-sm">
                      <Plus className="mr-2 h-3.5 w-3.5" /> Add initiative
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {kr.initiatives.map((item) => (
                      <div
                        key={item.title}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${
                              item.done
                                ? 'border-[color:#2563eb] bg-[color:#2563eb]/20'
                                : 'border-[color:#2563eb]'
                            }`}
                          />
                          <div>
                            <p className={`text-sm font-medium ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {item.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Owner {item.owner} · Due {item.due}
                            </p>
                          </div>
                        </div>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:#ebecf0] text-xs font-semibold text-foreground">
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
          <section className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Objective Details</h3>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:#dbeafe] text-xs font-semibold text-primary-500">
                    AR
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Alex Rodriguez</p>
                    <p className="text-xs text-muted-foreground">engineer1@company.com</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Timeframe</p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">Q1 2026</span>
                  <span className="text-xs text-muted-foreground">Quarterly</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Primary Alignment</p>
                <div className="mt-2 rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2 text-primary-500">
                    <Link2 className="h-4 w-4" />
                    <p className="text-sm font-semibold">Launch New Product Features</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Company Objective</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Department</p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Engineering</p>
                    <p className="text-xs text-muted-foreground">Product & Engineering Div.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Collaborators</h3>
              <span className="text-xs text-muted-foreground">{collaborators.length} total</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {collaborators.map((c) => (
                <span
                  key={c}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:#ebecf0] text-xs font-semibold text-foreground"
                >
                  {c}
                </span>
              ))}
              <button className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Contributing OKRs</h3>
              <span className="text-xs text-muted-foreground">{contributingOkrs.length} total</span>
            </div>
            <div className="mt-4 space-y-3">
              {contributingOkrs.map((okr) => (
                <div key={okr.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{okr.name}</span>
                    <span className="text-muted-foreground">{okr.progress}%</span>
                  </div>
                  <div className="progress-bar mt-2">
                    <div className="progress-fill" style={{ width: `${okr.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
              <button className="text-xs font-medium text-primary-500">View all</button>
            </div>
            <div className="mt-4 space-y-4">
              {recentActivity.map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:#dbeafe]">
                    <CheckCircle2 className="h-4 w-4 text-primary-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                    <p className="text-xs text-muted-foreground">{item.time}</p>
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
