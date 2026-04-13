// foundation/tokens/spacing.ts
export const spacing = {
  0:   '0px',
  1:   '4px',
  2:   '8px',
  3:   '12px',
  4:   '16px',
  5:   '20px',
  6:   '24px',
  8:   '32px',
  10:  '40px',
  12:  '48px',
  16:  '64px',
  20:  '80px',
  24:  '96px',
} as const;

export const borderRadius = {
  none: '0px',
  sm:   '4px',
  md:   '8px',
  lg:   '12px',
  xl:   '16px',
  full: '9999px',
} as const;

export const shadows = {
  sm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md:  '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg:  '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl:  '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  none: 'none',
} as const;

// foundation/tokens/typography.ts
export const typography = {
  fontFamily: {
    sans:  'var(--font-sans, system-ui, sans-serif)',
    mono:  'var(--font-mono, ui-monospace, monospace)',
  },
  fontSize: {
    xs:   '12px',
    sm:   '14px',
    base: '16px',
    lg:   '18px',
    xl:   '20px',
    '2xl':'24px',
    '3xl':'30px',
    '4xl':'36px',
  },
  fontWeight: {
    regular: '400',
    medium:  '500',
    semibold:'600',
    bold:    '700',
  },
  lineHeight: {
    tight:  '1.25',
    normal: '1.5',
    relaxed:'1.75',
  },
} as const;

export const animation = {
  duration: {
    fast:   '100ms',
    normal: '200ms',
    slow:   '300ms',
  },
  easing: {
    ease:    'ease',
    easeIn:  'ease-in',
    easeOut: 'ease-out',
    spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;
