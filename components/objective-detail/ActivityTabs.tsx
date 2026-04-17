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
    <Tabs defaultValue="activity">
      <TabsList className="h-9 w-full justify-start bg-transparent p-0 gap-0 border-b border-border rounded-none">
        <TabsTrigger
          value="activity"
          className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary-500 data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Activity
        </TabsTrigger>
        <TabsTrigger
          value="comments"
          className="rounded-none border-b-2 border-transparent px-3 pb-2 pt-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary-500 data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Comments
        </TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="mt-0 pt-3">
        <div id={activityElementId}>
          <ActivityLogPanel entityType="objective" entityId={objectiveId} />
        </div>
      </TabsContent>

      <TabsContent value="comments" className="mt-0 pt-3">
        <OkrComments endpoint="objectives" entityId={objectiveId} users={users} />
      </TabsContent>
    </Tabs>
  )
}
