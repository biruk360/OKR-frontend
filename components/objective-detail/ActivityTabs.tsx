'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import OkrComments from '@/components/shared/OkrComments'

interface Props {
  objectiveId: string
  activityElementId: string
  users: Array<{ id: string; name: string | null; email: string }>
}

export default function ActivityTabs({ objectiveId, activityElementId, users }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <Tabs defaultValue="activity">
        <div className="border-b border-border px-4">
          <TabsList className="h-10 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="activity"
              className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-2.5 text-sm font-medium text-muted-foreground data-[state=active]:border-primary-500 data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="comments"
              className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-2.5 text-sm font-medium text-muted-foreground data-[state=active]:border-primary-500 data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Comments
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="mt-0 p-4">
          <div id={activityElementId}>
            <ActivityLogPanel entityType="objective" entityId={objectiveId} />
          </div>
        </TabsContent>

        <TabsContent value="comments" className="mt-0 p-4">
          <OkrComments endpoint="objectives" entityId={objectiveId} users={users} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
