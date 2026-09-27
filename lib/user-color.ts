// Deterministic per-user color so the same person looks the same across the
// board, list, and modal. Hash → fixed palette (kept short so colors are
// visibly distinct; aligned with the design tokens used elsewhere in the app).

const PALETTE = [
  '#0079BF', // blue
  '#61BD4F', // green
  '#F2D600', // yellow
  '#FF9F1A', // orange
  '#EB5A46', // red
  '#C377E0', // purple
  '#00C2E0', // sky
  '#51E898', // mint
  '#FF78CB', // pink
  '#344563', // slate
] as const

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function userColor(userId: string | null | undefined, fallbackName?: string | null): string {
  const seed = userId || fallbackName || ''
  if (!seed) return PALETTE[0]
  return PALETTE[hash(seed) % PALETTE.length]
}

export function userInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Person hover tooltip helpers ─────────────────────────────────────────────
// Pure formatting for components/shared/UserAvatar's PersonTooltip /
// PeopleTooltip (docs/user_name_hover_REQUIREMENTS.md UNH-3, UNH-5).

/** The name to show for a person: name → email → "Unknown user". Never blank. */
export function personDisplayName(person: { name?: string | null; email?: string | null } | null | undefined): string {
  const name = person?.name?.trim()
  if (name) return name
  const email = person?.email?.trim()
  if (email) return email
  return 'Unknown user'
}

/**
 * Secondary line under the name: the truthy, de-duplicated parts joined with
 * " · ". Parts equal to the display name are dropped so the card never says
 * the same thing twice. Returns undefined when nothing is left.
 */
export function personDetail(parts: Array<string | null | undefined | false>, displayName?: string): string | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const v = typeof p === 'string' ? p.trim() : ''
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key) || (displayName && key === displayName.trim().toLowerCase())) continue
    seen.add(key)
    out.push(v)
  }
  return out.length ? out.join(' · ') : undefined
}

/** Cap a "+N" overflow list: the first `limit` names and how many were left out. */
export function overflowPeople<T>(people: T[], limit = 8): { shown: T[]; more: number } {
  const cap = Math.max(1, Math.floor(limit))
  return { shown: people.slice(0, cap), more: Math.max(0, people.length - cap) }
}
