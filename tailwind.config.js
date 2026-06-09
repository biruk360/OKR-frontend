/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '0.75rem',
        'card-lg': '1rem',
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
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        surface: {
          app: '#F2F2F7',
          card: '#FFFFFF',
          sidebar: '#F9F9FB',
          hover: '#F9F9FB',
          muted: '#E5E5EA',
        },
        ink: {
          primary: '#1D1D1F',
          secondary: '#8E8E93',
          tertiary: '#D1D1D6',
        },
        primary: {
          50: 'rgba(0, 122, 255, 0.12)',
          100: 'rgba(0, 122, 255, 0.18)',
          200: 'rgba(0, 122, 255, 0.28)',
          300: 'rgba(0, 122, 255, 0.4)',
          400: '#3395FF',
          500: '#007AFF',
          600: '#007AFF',
          700: '#0051D5',
          800: '#003D9E',
          900: '#002F78',
        },
        success: {
          50: 'rgba(52, 199, 89, 0.12)',
          100: 'rgba(52, 199, 89, 0.2)',
          200: 'rgba(52, 199, 89, 0.35)',
          300: 'rgba(52, 199, 89, 0.5)',
          400: '#5FD47E',
          500: '#34C759',
          600: '#34C759',
          700: '#248A3D',
          800: '#1B6B30',
          900: '#145026',
        },
        warning: {
          50: 'rgba(255, 149, 0, 0.12)',
          100: 'rgba(255, 149, 0, 0.2)',
          200: 'rgba(255, 149, 0, 0.35)',
          300: 'rgba(255, 204, 0, 0.45)',
          400: '#FFB340',
          500: '#FF9500',
          600: '#E08300',
          700: '#B36800',
          800: '#8A5000',
          900: '#663C00',
        },
        danger: {
          50: 'rgba(255, 59, 48, 0.12)',
          100: 'rgba(255, 59, 48, 0.2)',
          200: 'rgba(255, 59, 48, 0.35)',
          300: 'rgba(255, 59, 48, 0.5)',
          400: '#FF6259',
          500: '#FF3B30',
          600: '#E0342A',
          700: '#B32A22',
          800: '#862019',
          900: '#5C1612',
        },
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'page-title': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'section-title': ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        'overline': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.05em', fontWeight: '700' }],
        'body': ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],
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
  plugins: [require('@tailwindcss/typography'), require('tw-animate-css')],
}
