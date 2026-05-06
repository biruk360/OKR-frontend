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
