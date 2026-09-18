'use client'

import { useEffect, useState } from 'react'
import { Compass, LineChart, Target, Users } from 'lucide-react'
import CompanySignature from './CompanySignature'

/**
 * The editorial half of the sign-in screen — brand lockup, a greeting that
 * knows what time it is, and a line that changes with the backdrop.
 *
 * Everything time- or random-dependent is resolved in an effect rather than
 * during render: the server has no idea what hour it is for the visitor, and
 * guessing would trip a hydration mismatch on every load.
 */

const TAGLINES = [
  'Set the objective. Move the number. Repeat.',
  'Every key result on this screen belongs to someone.',
  'Strategy is what you measure on a Monday.',
  'Progress is a habit before it is a chart.',
  'Ambitious goals, honest scores.',
]

const PILLARS = [
  { icon: Target, label: 'Objectives that ladder up' },
  { icon: LineChart, label: 'Key results scored weekly' },
  { icon: Users, label: 'Teams aligned, not just informed' },
]

function greetingFor(hour: number): string {
  if (hour < 5) return 'Still going'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function AuthHero() {
  const [greeting, setGreeting] = useState('Welcome back')
  const [today, setToday] = useState('')
  const [tagline, setTagline] = useState(TAGLINES[0])

  useEffect(() => {
    const now = new Date()
    setGreeting(greetingFor(now.getHours()))
    setToday(
      now.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    )
    setTagline(TAGLINES[Math.floor(Math.random() * TAGLINES.length)])
  }, [])

  return (
    <div className="flex flex-col justify-center text-white">
      <div className="ap-auth-rise flex items-center gap-2.5" style={{ animationDelay: '40ms' }}>
        <span className="flex size-9 items-center justify-center rounded-[var(--ap-radius-md)] border border-white/20 bg-white/15 backdrop-blur-md">
          <Compass className="size-[18px]" strokeWidth={1.75} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">OKR Workspace</span>
      </div>

      <h1
        className="ap-auth-rise mt-9 text-[40px] font-semibold leading-[1.06] tracking-[-0.03em] [text-shadow:0_2px_18px_oklch(0.1_0.02_258/0.55)] xl:text-[52px]"
        style={{ animationDelay: '120ms' }}
      >
        {greeting}.
        <br />
        <span className="text-white/70">Let&apos;s move the numbers.</span>
      </h1>

      <p
        className="ap-auth-rise mt-5 max-w-[42ch] text-[15px] leading-relaxed text-white/80 [text-shadow:0_1px_10px_oklch(0.1_0.02_258/0.5)]"
        style={{ animationDelay: '200ms' }}
      >
        {tagline}
      </p>

      <ul
        className="ap-auth-rise mt-10 space-y-3 text-[13px] text-white/75 [text-shadow:0_1px_8px_oklch(0.1_0.02_258/0.45)]"
        style={{ animationDelay: '280ms' }}
      >
        {PILLARS.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-[var(--ap-radius-sm)] border border-white/15 bg-white/10">
              <Icon className="size-3.5" strokeWidth={1.75} />
            </span>
            {label}
          </li>
        ))}
      </ul>

      {today && (
        <p
          className="ap-auth-rise mt-10 text-[12px] uppercase tracking-[0.14em] text-white/45"
          style={{ animationDelay: '360ms' }}
        >
          {today}
        </p>
      )}

      <div className="ap-auth-rise mt-9" style={{ animationDelay: '440ms' }}>
        <CompanySignature />
      </div>
    </div>
  )
}
