import type { ComponentProps } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { isClientPortalUser } from '@/lib/todos/visibility'
import { loadWorkBoard } from '@/features/todos/services/todo-pages.server'
import WorkBoardClient from '@/components/work/WorkBoardClient'

export const metadata = { title: 'Work Board' }

export default async function WorkBoardPage() {
  const session = await getServerSessionSafe()
  if (!session?.user?.id) redirect('/auth/signin')

  // Client-portal sessions never see internal to-dos (project invariant 4).
  if (isClientPortalUser(session.user)) notFound()

  // Data + visibility (surface `work`, CPM-2 + A6 record scope) live in
  // features/todos/services/todo-pages.server.ts.
  const { todos, users, labelDefs } = await loadWorkBoard(session.user)

  return (
    <WorkBoardClient
      initialTodos={todos as ComponentProps<typeof WorkBoardClient>['initialTodos']}
      users={users}
      labelDefs={labelDefs}
      currentUserId={session.user.id}
      currentUserRole={session.user.role as string}
    />
  )
}
