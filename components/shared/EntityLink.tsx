'use client'

import Link from 'next/link'
import { Target, Link2, User as UserIcon, CheckSquare, Layout } from 'lucide-react'

type EntityType = 'user' | 'objective' | 'key-result' | 'todo' | 'sprint'

interface EntityLinkProps {
  type: EntityType
  id: string
  label: string
  avatar?: string | null
  className?: string
  chipStyle?: boolean
}

const ROUTES: Record<EntityType, string> = {
  user: '/dashboard/org/users',
  objective: '/dashboard/objectives',
  'key-result': '/dashboard/key-results',
  todo: '/dashboard/todos',
  sprint: '/dashboard/sprints',
}

const ICONS: Record<EntityType, React.ComponentType<{ className?: string }>> = {
  user: UserIcon,
  objective: Target,
  'key-result': Link2,
  todo: CheckSquare,
  sprint: Layout,
}

/**
 * Reusable clickable entity link. Renders as an inline chip-style link
 * or a plain text link depending on props.
 *
 * Usage:
 *   <EntityLink type="user" id={userId} label={userName} />
 *   <EntityLink type="objective" id={objId} label={objTitle} chipStyle />
 */
export default function EntityLink({ type, id, label, avatar, className, chipStyle = false }: EntityLinkProps) {
  const href = `${ROUTES[type]}/${id}`
  const Icon = ICONS[type]

  if (chipStyle) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center h-5 px-1.5 text-xs font-medium rounded inline-flex items-center gap-1 hover:bg-[color:#dbeafe] transition ${className || ''}`}
        data-tone="primary"
        title={label}
      >
        {type === 'user' && avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
        ) : (
          <Icon className="h-3 w-3" />
        )}
        <span className="max-w-[180px] truncate">{label}</span>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-primary-500 hover:underline ${className || ''}`}
      title={label}
    >
      {type === 'user' && avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-4 w-4 rounded-full object-cover" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span className="truncate">{label}</span>
    </Link>
  )
}
