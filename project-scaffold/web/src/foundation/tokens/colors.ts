// foundation/tokens/colors.ts
// Single source of truth for all colors.
// Never hardcode a hex value anywhere in the codebase — reference these instead.

export const colors = {
  // ── Brand ──────────────────────────────────────────
  primary:   { 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 900: '#1E3A5F' },
  secondary: { 50: '#F5F3FF', 100: '#EDE9FE', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9', 900: '#2E1065' },

  // ── Semantic ────────────────────────────────────────
  success:   { 50: '#F0FDF4', 100: '#DCFCE7', 500: '#22C55E', 600: '#16A34A', 700: '#15803D', 900: '#14532D' },
  warning:   { 50: '#FFFBEB', 100: '#FEF3C7', 500: '#F59E0B', 600: '#D97706', 700: '#B45309', 900: '#78350F' },
  error:     { 50: '#FFF1F2', 100: '#FFE4E6', 500: '#F43F5E', 600: '#E11D48', 700: '#BE123C', 900: '#881337' },
  info:      { 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 900: '#1E3A5F' },

  // ── Neutral ─────────────────────────────────────────
  neutral:   { 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8', 500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A' },

  // ── Always ──────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// Status color map — use this for StatusChip and similar components
export const statusColors = {
  active:    colors.success,
  inactive:  colors.neutral,
  pending:   colors.warning,
  error:     colors.error,
  info:      colors.info,
} as const;

export type ColorScale = typeof colors.primary;
export type StatusColorKey = keyof typeof statusColors;
