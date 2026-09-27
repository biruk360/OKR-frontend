/**
 * Input rules for the global TodoLabelDef palette, shared by POST and PATCH.
 * Kept beside the routes (not a route file) so both handlers apply one rule.
 */

export const LABEL_NAME_MAX = 50
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export type LabelInput = { name?: string; color?: string }

/** Returns the cleaned fields, or an error message. `partial` allows omitting fields (PATCH). */
export function parseLabelInput(
  body: unknown,
  { partial }: { partial: boolean },
): { ok: true; value: LabelInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' }
  const { name, color } = body as Record<string, unknown>
  const value: LabelInput = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Name required' }
    const trimmed = name.trim()
    if (trimmed.length > LABEL_NAME_MAX) return { ok: false, error: `Name must be at most ${LABEL_NAME_MAX} characters` }
    value.name = trimmed
  } else if (!partial) {
    return { ok: false, error: 'Name required' }
  }

  if (color !== undefined && color !== null && color !== '') {
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) return { ok: false, error: 'Color must be a hex value like #61BD4F' }
    value.color = color
  }

  return { ok: true, value }
}
