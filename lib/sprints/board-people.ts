/**
 * Board people — who is on a sprint board, and which cards a person filter keeps.
 *
 * Pure helpers behind the sprint board's assignee filter
 * (docs/card_comments_links_board_filter_REQUIREMENTS.md §3.3, AFL-1…AFL-7).
 *
 * Why this exists: the board used to list only `SprintParticipant` rows (usually
 * none) and matched `assigneeId` alone, while Trello-style cards start
 * unassigned and carry people as `members`. The people on a board are therefore
 * the union of card assignees, card members, participants and the sprint owner.
 */

/** Selection id that matches cards with no assignee and no members (AFL-2). */
export const UNASSIGNED_FILTER_ID = '__unassigned__'

export interface BoardPersonUser {
  id: string
  name: string
  avatar: string | null
}

/** The slice of a board card these helpers read. */
export interface BoardPeopleCard {
  assigneeId: string | null
  assignee?: BoardPersonUser | null
  members?: { user: BoardPersonUser }[] | null
}

export interface BoardPerson extends BoardPersonUser {
  /** Cards this person is on (assignee or member), counted across the whole
   *  board — not the filtered view — so the count does not change as you pick. */
  cardCount: number
}

export interface DeriveBoardPeopleInput {
  columns: ReadonlyArray<{ todos: ReadonlyArray<BoardPeopleCard> }>
  participants?: ReadonlyArray<BoardPersonUser> | null
  owner?: BoardPersonUser | null
  currentUserId?: string | null
}

/** Distinct user ids on a card — assignee plus members. */
export function cardPeopleIds(card: BoardPeopleCard): string[] {
  const ids = new Set<string>()
  if (card.assigneeId) ids.add(card.assigneeId)
  for (const m of card.members ?? []) {
    if (m?.user?.id) ids.add(m.user.id)
  }
  return Array.from(ids)
}

/** True when a card has nobody on it — no assignee and no members. */
export function isCardUnassigned(card: BoardPeopleCard): boolean {
  return cardPeopleIds(card).length === 0
}

/**
 * AFL-1 — the people on the board, de-duplicated by id: the current user first,
 * then everyone else by name (locale compare, case-insensitive; id breaks ties
 * so the order is stable).
 */
export function deriveBoardPeople({
  columns,
  participants,
  owner,
  currentUserId,
}: DeriveBoardPeopleInput): BoardPerson[] {
  const people = new Map<string, BoardPerson>()
  const add = (u: BoardPersonUser | null | undefined) => {
    if (!u?.id || people.has(u.id)) return
    people.set(u.id, { id: u.id, name: u.name ?? '', avatar: u.avatar ?? null, cardCount: 0 })
  }

  const counts = new Map<string, number>()
  for (const col of columns) {
    for (const card of col.todos) {
      add(card.assignee)
      for (const m of card.members ?? []) add(m?.user)
      for (const id of cardPeopleIds(card)) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  for (const p of participants ?? []) add(p)
  add(owner)

  const list = Array.from(people.values()).map((p) => ({ ...p, cardCount: counts.get(p.id) ?? 0 }))
  return list.sort((a, b) => {
    if (currentUserId) {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
    }
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    return byName !== 0 ? byName : a.id.localeCompare(b.id)
  })
}

/** Number of cards with nobody on them (the "Unassigned" option's count). */
export function countUnassignedCards(
  columns: ReadonlyArray<{ todos: ReadonlyArray<BoardPeopleCard> }>,
): number {
  let n = 0
  for (const col of columns) for (const card of col.todos) if (isCardUnassigned(card)) n++
  return n
}

/**
 * AFL-4 — OR within the facet: a card matches when its assignee or any member
 * is selected, or when it has nobody on it and `UNASSIGNED_FILTER_ID` is
 * selected. An empty selection matches every card.
 */
export function cardMatchesPeople(card: BoardPeopleCard, selected: ReadonlySet<string>): boolean {
  if (selected.size === 0) return true
  const ids = cardPeopleIds(card)
  if (ids.length === 0) return selected.has(UNASSIGNED_FILTER_ID)
  return ids.some((id) => selected.has(id))
}

/**
 * AFL-7 — drop selected ids that are no longer on the board. Keeps the
 * unassigned sentinel. Returns the SAME array when nothing was dropped, so a
 * caller can bail out of a state update without re-rendering.
 */
export function pruneSelection(
  selected: string[],
  people: ReadonlyArray<{ id: string }>,
): string[] {
  const known = new Set(people.map((p) => p.id))
  const next = selected.filter((id) => id === UNASSIGNED_FILTER_ID || known.has(id))
  return next.length === selected.length ? selected : next
}

/**
 * AFL-6 — read the saved assignee selection from a persisted filter object.
 * Accepts the current `assignees: string[]` shape and the legacy single-select
 * `assignee: string` shape. Anything else reads as "no selection".
 */
export function readSavedAssignees(saved: unknown): string[] {
  if (!saved || typeof saved !== 'object') return []
  const s = saved as { assignees?: unknown; assignee?: unknown }
  if (Array.isArray(s.assignees)) {
    return Array.from(new Set(s.assignees.filter((v): v is string => typeof v === 'string' && v.length > 0)))
  }
  if (typeof s.assignee === 'string' && s.assignee) return [s.assignee]
  return []
}
