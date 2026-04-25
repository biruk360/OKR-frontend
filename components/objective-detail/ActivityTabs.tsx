'use client'

import Link from 'next/link'
import { Calendar, User as UserIcon, Users as UsersIcon, Target, Database, Building2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import OkrComments from '@/components/shared/OkrComments'

interface UserLite { id: string; name: string; avatar?: string | null; email?: string | null }

interface DetailsContext {
  owner: UserLite
  timeframe: { name: string; type: string; startDate: Date | string; endDate: Date | string }
  department?: { name: string } | null
  parentObjective?: { id: string; title: string } | null
  childObjectives?: Array<{ id: string; title: string }>
  collaborators: UserLite[]
  measurementCount: number
}

interface Props {
  objectiveId: string
  activityElementId: string
  users: Array<{ id: string; name: string | null; email: string }>
  details?: DetailsContext
}

function initialsOf(name: string): string {
  return (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function timeframeTypeLabel(type: string): string {
  switch (type) {
    case 'QUARTERLY': return 'Quarterly'
    case 'SIX_MONTH': return 'Bi-annual'
    case 'YEARLY': return 'Yearly'
    case 'MONTHLY': return 'Monthly'
    default: return type
  }
}

export default function ActivityTabs({ objectiveId, activityElementId, users, details }: Props) {
  return (
    <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <Tabs defaultValue="details">
        <TabsList
          className="h-9 w-full justify-start gap-0 p-0 rounded-none border-b bg-transparent"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          {(['details', 'activity', 'risks', 'viewers'] as const).map(v => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground data-[state=active]:border-[var(--ap-accent)] data-[state=active]:text-[var(--ap-fg)] data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              {v === 'details' ? 'Details' : v === 'activity' ? 'Activity' : v === 'risks' ? 'Risks' : 'Viewers'}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Details */}
        <TabsContent value="details" className="m-0 p-0">
          {details ? (
            <div className="px-4 py-4 space-y-4 max-h-[460px] overflow-auto">
              {/* Owner */}
              <Field icon={<UserIcon className="size-3" />} label="Owner">
                <div className="flex items-center gap-2.5">
                  {details.owner.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={details.owner.avatar} alt={details.owner.name} className="size-8 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: 'var(--ap-accent)' }}>
                      {initialsOf(details.owner.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{details.owner.name}</p>
                    {details.owner.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{details.owner.email}</p>
                    )}
                  </div>
                </div>
              </Field>

              {/* Timeframe */}
              <Field icon={<Calendar className="size-3" />} label="Timeframe">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium">{details.timeframe.name}</span>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
                  >
                    {timeframeTypeLabel(details.timeframe.type)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  {new Date(details.timeframe.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  {' → '}
                  {new Date(details.timeframe.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </Field>

              {/* Aligned to */}
              {(details.parentObjective || (details.childObjectives && details.childObjectives.length > 0)) && (
                <Field icon={<Target className="size-3" />} label="Aligned to">
                  <div className="space-y-1.5">
                    {details.parentObjective && (
                      <Link
                        href={`/dashboard/objectives/${details.parentObjective.id}`}
                        className="block rounded-[10px] border px-2.5 py-1.5 text-[12px] hover:bg-[var(--ap-bg-hover)]"
                        style={{ borderColor: 'var(--ap-border)' }}
                      >
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1.5">Parent</span>
                        <span className="font-medium">{details.parentObjective.title}</span>
                      </Link>
                    )}
                    {details.childObjectives?.slice(0, 4).map(c => (
                      <Link
                        key={c.id}
                        href={`/dashboard/objectives/${c.id}`}
                        className="block rounded-[10px] border px-2.5 py-1.5 text-[12px] hover:bg-[var(--ap-bg-hover)]"
                        style={{ borderColor: 'var(--ap-border)' }}
                      >
                        {c.title}
                      </Link>
                    ))}
                  </div>
                </Field>
              )}

              {/* Measurement */}
              <Field icon={<Target className="size-3" />} label="Measurement">
                <p className="text-[12px]">
                  <span className="font-semibold tabular-nums">{details.measurementCount}</span>{' '}
                  <span className="text-muted-foreground">key result{details.measurementCount === 1 ? '' : 's'} tracked</span>
                </p>
              </Field>

              {/* Collaborators */}
              <Field icon={<UsersIcon className="size-3" />} label="Collaborators">
                {details.collaborators.length === 0 ? (
                  <p className="text-[12px] italic text-muted-foreground">None — add via Edit Objective</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {details.collaborators.slice(0, 12).map(c => (
                      c.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={c.id} src={c.avatar} alt={c.name} title={c.name}
                          className="size-7 rounded-full object-cover ring-2"
                          style={{ ['--tw-ring-color' as any]: 'var(--ap-bg-raised)' } as any} />
                      ) : (
                        <span key={c.id} title={c.name}
                          className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2"
                          style={{
                            background: 'var(--ap-bg-sunken)',
                            color: 'var(--ap-fg-muted)',
                            ['--tw-ring-color' as any]: 'var(--ap-bg-raised)',
                          } as any}>
                          {initialsOf(c.name)}
                        </span>
                      )
                    ))}
                  </div>
                )}
              </Field>

              {/* Department */}
              {details.department && (
                <Field icon={<Building2 className="size-3" />} label="Department">
                  <p className="text-[12px]">{details.department.name}</p>
                </Field>
              )}

              {/* Data source (placeholder) */}
              <Field icon={<Database className="size-3" />} label="Data source">
                <button
                  type="button"
                  className="text-[12px] rounded-[10px] border-dashed border px-2.5 py-1.5 w-full text-left text-muted-foreground hover:bg-[var(--ap-bg-hover)]"
                  style={{ borderColor: 'var(--ap-border-strong)' }}
                  title="Coming soon"
                  disabled
                >
                  Connect a data source
                </button>
              </Field>
            </div>
          ) : (
            <div className="px-4 py-6 text-[12px] text-muted-foreground">No details available.</div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="m-0 p-0">
          <div id={activityElementId} className="px-3 py-3 max-h-[460px] overflow-auto">
            <ActivityLogPanel entityType="objective" entityId={objectiveId} embedded />
          </div>
        </TabsContent>

        <TabsContent value="risks" className="m-0 p-0">
          <div className="px-4 py-6 text-[12px] text-muted-foreground">No risks logged.</div>
        </TabsContent>

        <TabsContent value="viewers" className="m-0 p-0">
          <div className="px-4 py-3 max-h-[460px] overflow-auto">
            <OkrComments endpoint="objectives" entityId={objectiveId} users={users} />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-1.5">
        {icon} {label}
      </p>
      {children}
    </div>
  )
}
