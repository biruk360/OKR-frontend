'use client'

import { userColor, userInitials } from '@/lib/user-color'
import { cn } from '@/lib/utils'

export interface AvatarUser {
  id: string
  name: string
  avatar?: string | null
}

interface UserAvatarProps {
  user: AvatarUser
  size?: number
  ring?: boolean
  className?: string
}

export function UserAvatar({ user, size = 22, ring = false, className }: UserAvatarProps) {
  const bg = userColor(user.id, user.name)
  const ringCls = ring ? 'ring-2 ring-white' : ''
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        title={user.name}
        className={cn('rounded-full object-cover', ringCls, className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      title={user.name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', ringCls, className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)), background: bg }}
    >
      {userInitials(user.name)}
    </span>
  )
}

interface UserAvatarStackProps {
  users: AvatarUser[]
  size?: number
  max?: number
  showNames?: boolean
  className?: string
}

/**
 * Cascaded avatar stack with optional inline names. Used on the sprint board
 * and todo list so a glance at color/initials identifies the assignee(s).
 */
export function UserAvatarStack({ users, size = 22, max = 3, showNames = false, className }: UserAvatarStackProps) {
  if (!users.length) return null
  const visible = users.slice(0, max)
  const overflow = users.length - visible.length
  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      <div className="flex -space-x-1.5 shrink-0">
        {visible.map((u) => (
          <UserAvatar key={u.id} user={u} size={size} ring />
        ))}
        {overflow > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground ring-2 ring-white"
            style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
            title={users.slice(max).map((u) => u.name).join(', ')}
          >
            +{overflow}
          </span>
        )}
      </div>
      {showNames && (
        <span className="truncate text-[11px] font-500 text-foreground/80 min-w-0">
          {visible.map((u) => (
            <span
              key={u.id}
              className="mr-1.5 inline-flex items-center gap-1"
              style={{ color: userColor(u.id, u.name) }}
            >
              {u.name}
            </span>
          ))}
          {overflow > 0 && <span className="text-muted-foreground">+{overflow}</span>}
        </span>
      )}
    </div>
  )
}
