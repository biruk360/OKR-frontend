export const projectPortalInclude = {
  phases: {
    orderBy: { position: 'asc' },
    include: {
      milestones: {
        orderBy: { position: 'asc' },
        include: {
          activities: {
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  },
} as const
