/**
 * Operating-package importer (IMP-2) — workbook names → users.
 *
 * The workbooks name people by first name ("Eden"), short form ("Yohannes G"), role ("CEO",
 * "ERP Lead") or seat ("AI Lead", "Systems team"). Resolution order for one name token:
 *   1. the override map (scripts/data/operating-package-user-map.json): an alias or the person's
 *      name → that person, found by email (any listed), then full name, then unique first name;
 *   2. the map's non-person list / patterns (seats, teams, groups) → NON_PERSON (no user, no error);
 *   3. the users table: exact full name, then a unique first name.
 * Anything else is UNMATCHED (or AMBIGUOUS when several users fit). `--apply` refuses to run while
 * any name in a blocking role (owners, dependency providers, the CEO) is unmatched.
 */
import * as fs from 'fs'
import { cellText, isBlank, splitNames } from './text'

export interface UserRow {
  id: string
  name: string
  email: string
  isActive: boolean
}

export interface PersonEntry {
  /** Canonical name — a full name ("Biruk Hailu") or a first name ("Mukuken"). */
  name: string
  /** Mailboxes to try first (any that exists wins; active users preferred). */
  emails?: string[]
  /** Workbook spellings, roles and short forms that mean this person. */
  aliases?: string[]
  /**
   * Deliberately not imported yet (e.g. a role starting later, no account): resolves to SKIPPED —
   * never a user, never blocks --apply. Their package is left out; cells they own fall back
   * (company KR owner → the CEO) and they are dropped from parties / collaborators.
   */
  skip?: boolean
  skipReason?: string
}

export interface UserMapFile {
  people: PersonEntry[]
  /** Exact (case-insensitive) names that are seats, teams or groups — never a user. */
  nonPersons?: string[]
  /** Regex sources (case-insensitive) for non-person names. */
  nonPersonPatterns?: string[]
}

export type Resolution =
  | { status: 'MATCHED'; userId: string; userName: string; userEmail: string; method: string }
  | { status: 'NON_PERSON'; method: string }
  | { status: 'SKIPPED'; method: string; person: string }
  | { status: 'UNMATCHED'; method: string }
  | { status: 'AMBIGUOUS'; method: string; candidates: string[] }

export function loadUserMap(path: string): UserMapFile {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<UserMapFile>
  if (!raw || !Array.isArray(raw.people)) throw new Error(`${path}: "people" must be an array`)
  return { people: raw.people, nonPersons: raw.nonPersons ?? [], nonPersonPatterns: raw.nonPersonPatterns ?? [] }
}

/**
 * "Eden (Bid Lead)" → "Eden"; "CEO when needed" → "CEO"; "Yared's ERP team" stays (a team).
 * Strips parentheticals and trailing qualifiers that the sheets add after a name.
 */
export function normalisePersonName(raw: string): string {
  let t = cellText(raw).replace(/\([^)]*\)/g, ' ')
  t = t.replace(/\b(when needed|if needed|when hired|once hired|as needed|for pricing|for demos|for their seats?|until\b).*$/i, '')
  t = t.replace(/^(the|our)\s+/i, '')
  return t.replace(/\s+/g, ' ').replace(/[.:;,\s]+$/, '').trim()
}

function lower(s: string): string {
  return s.trim().toLowerCase()
}

function firstToken(name: string): string {
  return lower(name).split(/\s+/)[0] ?? ''
}

export class PeopleResolver {
  private readonly users: UserRow[]
  private readonly aliasIndex = new Map<string, PersonEntry>()
  private readonly nonPersons: Set<string>
  private readonly nonPersonPatterns: RegExp[]
  private readonly cache = new Map<string, Resolution>()

  constructor(users: UserRow[], map: UserMapFile) {
    this.users = users
    for (const person of map.people) {
      for (const alias of [person.name, ...(person.aliases ?? [])]) {
        const key = lower(normalisePersonName(alias) || alias)
        if (key && !this.aliasIndex.has(key)) this.aliasIndex.set(key, person)
      }
    }
    this.nonPersons = new Set((map.nonPersons ?? []).map((n) => lower(normalisePersonName(n) || n)))
    this.nonPersonPatterns = (map.nonPersonPatterns ?? []).map((p) => new RegExp(p, 'i'))
  }

  /** Resolve one name token (not a list). */
  resolve(rawName: string): Resolution {
    const name = normalisePersonName(rawName)
    const key = lower(name)
    const cached = this.cache.get(key)
    if (cached) return cached
    const result = this.resolveUncached(name)
    this.cache.set(key, result)
    return result
  }

  /** Resolve every name in a list cell ("Meklit; Betty", "Eden, Yohannes G"). */
  resolveList(cell: string | null | undefined): Array<{ raw: string; resolution: Resolution }> {
    return splitNames(cell).map((raw) => ({ raw, resolution: this.resolve(raw) }))
  }

  /** Distinct matched user ids of a list cell, in order. */
  userIds(cell: string | null | undefined): string[] {
    const ids: string[] = []
    for (const { resolution } of this.resolveList(cell)) {
      if (resolution.status === 'MATCHED' && !ids.includes(resolution.userId)) ids.push(resolution.userId)
    }
    return ids
  }

  private resolveUncached(name: string): Resolution {
    if (!name || isBlank(name)) return { status: 'NON_PERSON', method: 'blank' }
    const key = lower(name)

    const person = this.aliasIndex.get(key)
    if (person) return this.findPerson(person)

    if (this.nonPersons.has(key)) return { status: 'NON_PERSON', method: 'non-person list' }
    if (this.nonPersonPatterns.some((re) => re.test(name))) return { status: 'NON_PERSON', method: 'non-person pattern' }

    return this.byName(name, 'users table')
  }

  private findPerson(person: PersonEntry): Resolution {
    if (person.skip) return { status: 'SKIPPED', method: `map: skip${person.skipReason ? ` (${person.skipReason})` : ''}`, person: person.name }
    const emails = (person.emails ?? []).map(lower)
    if (emails.length > 0) {
      const byEmail = this.users.filter((u) => emails.includes(lower(u.email)))
      const pick = this.pickOne(byEmail)
      if (pick) return { status: 'MATCHED', userId: pick.id, userName: pick.name, userEmail: pick.email, method: 'map: email' }
    }
    return this.byName(person.name, 'map: name')
  }

  private byName(name: string, method: string): Resolution {
    const key = lower(name)
    const exact = this.users.filter((u) => lower(u.name) === key)
    const exactPick = this.pickOne(exact)
    if (exactPick) return { status: 'MATCHED', userId: exactPick.id, userName: exactPick.name, userEmail: exactPick.email, method: `${method} (full name)` }
    if (exact.length > 1) return { status: 'AMBIGUOUS', method: `${method} (full name)`, candidates: exact.map((u) => `${u.name} <${u.email}>`) }

    // A first name ("Eden") or a "First L" short form ("Yohannes G").
    const parts = key.split(/\s+/)
    let candidates: UserRow[]
    if (parts.length === 1) {
      candidates = this.users.filter((u) => firstToken(u.name) === parts[0])
    } else if (parts.length === 2 && parts[1].length === 1) {
      candidates = this.users.filter((u) => {
        const t = lower(u.name).split(/\s+/)
        return t[0] === parts[0] && (t[1] ?? '').startsWith(parts[1])
      })
    } else {
      candidates = []
    }
    const pick = this.pickOne(candidates)
    if (pick) return { status: 'MATCHED', userId: pick.id, userName: pick.name, userEmail: pick.email, method: `${method} (first name)` }
    if (candidates.length > 1) return { status: 'AMBIGUOUS', method: `${method} (first name)`, candidates: candidates.map((u) => `${u.name} <${u.email}>`) }
    return { status: 'UNMATCHED', method }
  }

  /** One user: the only one, or the only active one among several. */
  private pickOne(rows: UserRow[]): UserRow | null {
    if (rows.length === 1) return rows[0]
    const active = rows.filter((u) => u.isActive)
    return active.length === 1 ? active[0] : null
  }
}
