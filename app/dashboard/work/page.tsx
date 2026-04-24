import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import WorkBoardClient from '@/components/work/WorkBoardClient'

export const metadata = { title: 'Work Board' }

export default async function WorkBoardPage() {
  const session = await getServerSessionSafe()
  if (!session?.user?.id) redirect('/auth/signin')

  const userId = session.user.id
  const role = session.user.role as string

  // Load all todos the current user can see:
  // - assigned to them, created by them, or they are a member
  // - ADMIN/EXECUTIVE see all
  const isAdmin = role === 'ADMIN' || role === 'EXECUTIVE'

  const todos = await prisma.todo.findMany({
    where: isAdmin
      ? {}
      : {
          OR: [
            { assigneeId: userId },
            { creatorId: userId },
            { members: { some: { userId } } },
          ],
        },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      labels: { include: { labelDef: true } },
      checklists: { include: { items: { select: { id: true, completed: true } } } },
      attachments: { select: { id: true } },
      keyResult: { select: { id: true, title: true, objective: { select: { id: true, title: true } } } },
      objective: { select: { id: true, title: true } },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  })

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  const labelDefs = await prisma.todoLabelDef.findMany({ orderBy: { createdAt: 'asc' } })

  return (
    <WorkBoardClient
      initialTodos={JSON.parse(JSON.stringify(todos))}
      users={users}
      labelDefs={labelDefs}
      currentUserId={userId}
      currentUserRole={role}
    />
  )
}
