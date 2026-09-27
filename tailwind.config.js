/**
 * Colour tokens are CSS variables so dark mode can retarget them. Each variable
 * holds bare channels ("242 242 247"), never a full colour, so `<alpha-value>`
 * (Tailwind's opacity-modifier slot) can be spliced in.
 */
const channel = (name) => `rgb(var(--rgb-${name}) / <alpha-value>)`
/**
 * Soft wash of a base colour (the 50–300 steps). A function rather than an
 * `<alpha-value>` string so it can keep the original semantics exactly:
 *   - no modifier  → the wash's own alpha (× `--ap-tint-scale`: 1 in light,
 *                    raised in dark, where a 12% wash over a near-black card
 *                    disappears);
 *   - a modifier   → REPLACES the alpha (`bg-primary-50/50` = 50%), which is
 *                    what Tailwind did when these were literal rgba() values.
 * Tailwind passes `var(--tw-*-opacity, 1)` when no modifier was written.
 */
const washWith = (base, alpha) => ({ opacityValue } = {}) =>
  opacityValue === undefined || String(opacityValue).startsWith('var(')
    ? `${base} / calc(${alpha} * var(--ap-tint-scale)))`
    : `${base} / ${opacityValue})`
const tint = (name, alpha) => washWith(`rgb(var(--rgb-${name})`, alpha)
/** The single brand accent. Same variable `--ap-accent` is built from. */
const ACCENT = 'oklch(var(--ap-accent-lch) / <alpha-value>)'
const accentTint = (alpha) => washWith('oklch(var(--ap-accent-lch)', alpha)
/** 50–300 are washes of the 500 hue; 400–900 are solid shades. */
const semanticScale = (family, tintAlphas) => {
  const scale = {}
  ;[50, 100, 200, 300].forEach((step, i) => {
    if (tintAlphas[i] !== undefined) scale[step] = tint(`${family}-500`, tintAlphas[i])
  })
  ;[400, 500, 600, 700, 800, 900].forEach((step) => {
    scale[step] = channel(`${family}-${step}`)
  })
  return scale
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Project Management module — activity status swatches are applied via dynamically
    // constructed class names (badges + Gantt bars), so Tailwind cannot see them in source.
    'bg-project-status-not-started',
    'bg-project-status-started',
    'bg-project-status-finished',
    'bg-project-status-approval-requested',
    'bg-project-status-approved',
    'bg-project-status-rejected',
    'bg-project-baseline',
    'border-project-status-not-started',
    'border-project-status-started',
    'border-project-status-finished',
    'border-project-status-approval-requested',
    'border-project-status-approved',
    'border-project-status-rejected',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Without these, `font-sans` / `font-mono` ignore the --ap-* tokens and
        // the mono face lands on ~2 CSS selectors instead of the whole app.
        sans: ['var(--ap-font-sans)'],
        mono: ['var(--ap-font-mono)'],
        // shadcn primitives (Card/Dialog/Sheet titles) use `font-heading`;
        // without an entry it compiled to nothing.
        heading: ['var(--ap-font-sans)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--ap-radius-card)',      /* 12px */
        'card-lg': 'var(--ap-radius-lg)',   /* 14px */
        pill: '999px',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Palette tokens resolve through CSS custom properties defined in
        // app/globals.css (`:root` = light, `.dark` = dark). The variables hold
        // bare channels so Tailwind's opacity modifiers (`bg-danger-500/30`)
        // keep working. Light values are the original hexes, unchanged.
        // Scripts that need a literal colour (emails, PDFs) must not read these.
        surface: {
          app: channel('surface-app'),
          card: channel('surface-card'),
          sidebar: channel('surface-sidebar'),
          hover: channel('surface-hover'),
          muted: channel('surface-muted'),
        },
        ink: {
          primary: channel('ink-primary'),
          secondary: channel('ink-secondary'),
          tertiary: channel('ink-tertiary'),
        },
        // DEFAULT/foreground: shadcn's `bg-primary`, `text-primary-foreground`
        // (default Button/Badge, checked Checkbox) had no base colour, so they
        // compiled to nothing and default buttons rendered unfilled.
        // 500/600 ARE the Apple Pro accent (`--ap-accent`): one accent, not two.
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: accentTint(0.12),
          100: accentTint(0.18),
          200: accentTint(0.28),
          300: accentTint(0.4),
          400: channel('primary-400'),
          500: ACCENT,
          600: ACCENT,
          700: channel('primary-700'),
          800: channel('primary-800'),
          900: channel('primary-900'),
        },
        success: semanticScale('success', [0.12, 0.2, 0.35, 0.5]),
        warning: {
          ...semanticScale('warning', [0.12, 0.2, 0.35]),
          // A different hue on purpose (yellow, not orange) — kept from the original.
          300: tint('warning-300', 0.45),
        },
        danger: semanticScale('danger', [0.12, 0.2, 0.35, 0.5]),
        // Project Management module — exact Instagantt-parity activity status colors
        // (build spec Epic B1 / D2). These are hard requirements, so they live as
        // named tokens rather than inline hex (satisfies the "no hardcoded hex" rule).
        'project-status': {
          'not-started': '#E5E5EA',
          started: '#A8D0F0',
          finished: '#4A90D9',
          'approval-requested': '#F5D547',
          approved: '#5CB85C',
          rejected: '#F0932B',
        },
        // Baseline ghost bar on the Gantt (rendered at 40% opacity via /40 modifier).
        'project-baseline': '#D1D1D6',
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'page-title': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'section-title': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'overline': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.05em', fontWeight: '700' }],
        'body': ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],
        // Dense UI labels (chips, table meta, Gantt). Size only — no line-height or
        // weight — so they are drop-in replacements for text-[11px] / text-[10px].
        'caption': '0.6875rem',
        'micro': '0.625rem',
      },

      boxShadow: {
        card: '0 4px 24px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.06)',
        popover: '0 8px 32px rgba(0, 0, 0, 0.08)',
      },
      spacing: {
        18: '4.5rem',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      maxWidth: {
        content: '1440px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
