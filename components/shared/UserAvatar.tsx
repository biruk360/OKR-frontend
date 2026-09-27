'use client'

/**
 * UserAvatar, UserAvatarStack and the person hover card.
 *
 * Anywhere a person is shown compactly — initials, a photo, a "+N" overflow or
 * a truncated name — hovering (or focusing, when the trigger is focusable)
 * reveals the full name in a small card. Spec: docs/user_name_hover_REQUIREMENTS.md.
 *
 * Performance (UNH-8): each tooltip is a Radix Tooltip root — a context and a
 * few refs. The content, its portal and the popper positioning mount only while
 * open, so a board with hundreds of avatars pays nothing per avatar until one
 * is hovered. Requires the app-wide `TooltipProvider` in app/providers.tsx.
 */

import * as React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import {
  overflowPeople,
  personDetail,
  personDisplayName,
  userColor,
  userInitials,
} from '@/lib/user-color'
import { cn } from '@/lib/utils'

export interface AvatarUser {
  id: string
  name: string
  avatar?: string | null
}

/** Anything that identifies a person well enough to show in the hover card. */
export interface PersonLike {
  id?: string | null
  name?: string | null
  email?: string | null
  avatar?: string | null
}

type Side = 'top' | 'right' | 'bottom' | 'left'

/** Open delay: long enough that sweeping the pointer across a board does not
 *  flash cards, short enough to feel immediate when you mean it. */
const OPEN_DELAY_MS = 180

// Above the card modal's z-[90]/z-[91] panels and the mention list's z-[200].
const CARD_CLASS =
  'ap-person-tip pointer-events-none z-[210] rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] text-[var(--ap-fg)] select-none'
const CARD_STYLE: React.CSSProperties = { boxShadow: 'var(--ap-shadow-pop-sm)' }

// ─── Avatar face (no tooltip) ────────────────────────────────────────────────

interface AvatarFaceProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  person: PersonLike
  size: number
  ring?: boolean
}

/** The bare circle. forwardRef + prop spread so it can be a Radix `asChild` trigger. */
const AvatarFace = React.forwardRef<HTMLElement, AvatarFaceProps>(function AvatarFace(
  { person, size, ring = false, className, style, ...rest },
  ref,
) {
  const name = personDisplayName(person)
  const ringCls = ring ? 'ring-2 ring-[var(--ap-bg-raised)]' : ''
  if (person.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref as React.Ref<HTMLImageElement>}
        src={person.avatar}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', ringCls, className)}
        style={{ width: size, height: size, ...style }}
        {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
      />
    )
  }
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      role="img"
      aria-label={name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', ringCls, className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        background: userColor(person.id, person.name ?? person.email),
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden>{userInitials(person.name ?? person.email)}</span>
    </span>
  )
})

// ─── PersonTooltip ───────────────────────────────────────────────────────────

export interface PersonTooltipProps {
  /** Who to show. `name` → `email` → "Unknown user". */
  person: PersonLike
  /** Optional secondary line — role, "Assignee", "You"… Only pass data already in hand. */
  detail?: string | null
  /** The trigger. Must accept a ref and spread props (a DOM element or a forwardRef component). */
  children: React.ReactElement
  side?: Side
  align?: 'start' | 'center' | 'end'
  /** Open only when the trigger's text is actually clipped (for `truncate` names). */
  whenTruncated?: boolean
  /** Render the trigger untouched — no tooltip. */
  disabled?: boolean
}

export function PersonTooltip({
  person,
  detail,
  children,
  side = 'top',
  align = 'center',
  whenTruncated = false,
  disabled = false,
}: PersonTooltipProps) {
  // Typed as the Trigger's default element; with asChild it is whatever the child renders.
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const onOpenChange = React.useCallback(
    (next: boolean) => {
      if (next && whenTruncated) {
        const el = triggerRef.current
        if (!el || el.scrollWidth <= el.clientWidth) return
      }
      setOpen(next)
    },
    [whenTruncated],
  )
  if (disabled) return children

  const name = personDisplayName(person)
  const secondary = personDetail([detail], name)
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange} delayDuration={OPEN_DELAY_MS} disableHoverableContent>
      <TooltipPrimitive.Trigger asChild ref={triggerRef}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          aria-label={secondary ? `${name}, ${secondary}` : name}
          className={cn(CARD_CLASS, 'flex max-w-[280px] items-center gap-2.5 py-2 pl-2 pr-3')}
          style={CARD_STYLE}
        >
          <AvatarFace person={person} size={28} aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="break-words text-body-sm font-semibold leading-tight">{name}</span>
            {secondary && (
              <span className="mt-0.5 truncate text-xs leading-tight text-[var(--ap-fg-subtle)]">{secondary}</span>
            )}
          </span>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ─── PeopleTooltip (the "+N" overflow) ───────────────────────────────────────

export interface PeopleTooltipProps {
  people: PersonLike[]
  /** Header line. Defaults to "N more". */
  heading?: string
  children: React.ReactElement
  side?: Side
  /** Names listed before collapsing to "and N more". */
  limit?: number
}

export function PeopleTooltip({ people, heading, children, side = 'top', limit = 8 }: PeopleTooltipProps) {
  if (people.length === 0) return children
  const { shown, more } = overflowPeople(people, limit)
  const names = people.map((p) => personDisplayName(p))
  return (
    <TooltipPrimitive.Root delayDuration={OPEN_DELAY_MS} disableHoverableContent>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          aria-label={names.join(', ')}
          className={cn(CARD_CLASS, 'w-max max-w-[260px] px-2.5 py-2')}
          style={CARD_STYLE}
        >
          <p className="mb-1.5 text-micro font-semibold uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)]">
            {heading ?? `${people.length} more`}
          </p>
          <ul className="space-y-1">
            {shown.map((p, i) => (
              <li key={p.id ?? i} className="flex min-w-0 items-center gap-2">
                <AvatarFace person={p} size={18} aria-hidden />
                <span className="truncate text-body-sm font-medium">{personDisplayName(p)}</span>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="mt-1.5 text-xs text-[var(--ap-fg-subtle)]">and {more} more</p>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ─── UserAvatar ──────────────────────────────────────────────────────────────

interface UserAvatarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  user: AvatarUser
  size?: number
  ring?: boolean
  className?: string
  /** Hover card with the full name. On by default; turn off when the full name
   *  is already visible right next to the avatar (UNH-6). */
  tooltip?: boolean
  /** Secondary line in the hover card. */
  tooltipDetail?: string | null
  tooltipSide?: Side
}

export const UserAvatar = React.forwardRef<HTMLElement, UserAvatarProps>(function UserAvatar(
  { user, size = 22, ring = false, className, tooltip = true, tooltipDetail, tooltipSide, ...rest },
  ref,
) {
  const face = <AvatarFace ref={ref} person={user} size={size} ring={ring} className={className} {...rest} />
  if (!tooltip) return face
  return (
    <PersonTooltip person={user} detail={tooltipDetail} side={tooltipSide}>
      {face}
    </PersonTooltip>
  )
})

// ─── UserAvatarStack ─────────────────────────────────────────────────────────

interface UserAvatarStackProps {
  users: AvatarUser[]
  size?: number
  max?: number
  showNames?: boolean
  className?: string
  /** Secondary line per person in their hover card (e.g. "Assignee"). */
  detail?: (user: AvatarUser) => string | null | undefined
}

/**
 * Cascaded avatar stack with optional inline names. Used on the sprint board
 * and todo list so a glance at color/initials identifies the assignee(s).
 * Each avatar shows its person on hover; "+N" lists the rest (UNH-5).
 */
export function UserAvatarStack({ users, size = 22, max = 3, showNames = false, className, detail }: UserAvatarStackProps) {
  if (!users.length) return null
  const visible = users.slice(0, max)
  const hidden = users.slice(max)
  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      <div className="flex -space-x-1.5 shrink-0">
        {visible.map((u) => (
          <UserAvatar key={u.id} user={u} size={size} ring tooltipDetail={detail?.(u)} />
        ))}
        {hidden.length > 0 && (
          <PeopleTooltip people={hidden}>
            <span
              role="img"
              aria-label={`${hidden.length} more: ${hidden.map((u) => u.name).join(', ')}`}
              className="inline-flex items-center justify-center rounded-full bg-muted font-semibold text-foreground ring-2 ring-[var(--ap-bg-raised)]"
              style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
            >
              +{hidden.length}
            </span>
          </PeopleTooltip>
        )}
      </div>
      {showNames && (
        <span className="truncate text-caption font-medium text-foreground/80 min-w-0">
          {visible.map((u) => (
            <span
              key={u.id}
              className="mr-1.5 inline-flex items-center gap-1"
              style={{ color: userColor(u.id, u.name) }}
            >
              {u.name}
            </span>
          ))}
          {hidden.length > 0 && <span className="text-muted-foreground">+{hidden.length}</span>}
        </span>
      )}
    </div>
  )
}
