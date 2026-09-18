'use client'

import { Info, Pause, Play, Shuffle } from 'lucide-react'
import { useWallpaper } from '../hooks/useWallpaper'
import { cn } from '@/lib/utils'

/**
 * Full-bleed rotating photo backdrop for the auth screens.
 *
 * Renders at most two image layers (the frame on screen and the one fading out
 * beneath it), a colour wash that paints instantly underneath, the scrims that
 * keep white text legible over an unknown photograph, and the Bing-style
 * caption and playback controls in the bottom corners.
 *
 * `children` are composed on top, inside the page's own layout.
 */
export default function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const { current, previous, imageReady, source, index, count, paused, togglePaused, next } =
    useWallpaper()

  const hasCaption = Boolean(current.caption || current.credit)

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Colour wash — visible for the moment before the photo decodes, and the
          entire backdrop when the photo source is unavailable. */}
      <div
        className="absolute inset-0 transition-[background] duration-700"
        style={{ background: current.gradient }}
        aria-hidden
      />

      {/* Outgoing frame. Present only for the length of the crossfade. */}
      {previous?.url && (
        <img
          key={`prev-${previous.id}`}
          src={previous.url}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      )}

      {/* Current frame: blurred thumbnail first, full photo over it, both
          drifting slowly so the screen is never completely still. */}
      {current.thumbUrl && (
        <img
          key={`thumb-${current.id}`}
          src={current.thumbUrl}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-110 object-cover blur-2xl"
        />
      )}
      {current.url && (
        <img
          key={`full-${current.id}`}
          src={current.url}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          decoding="async"
          className={cn(
            'ap-auth-kenburns absolute inset-0 size-full object-cover transition-opacity duration-[1200ms] ease-out',
            imageReady ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}

      {/* Scrims. Literal oklch rather than tokens: these darken a photograph,
          they are not a UI surface. The diagonal one carries the sign-in card,
          the bottom one carries the caption. */}
      {/* A flat wash first: the photo set is unpredictable, and a snowfield at
          noon washes out white text that a mountain at dusk carries easily. */}
      <div
        className="absolute inset-0"
        style={{ background: 'oklch(0.13 0.02 258 / 0.24)' }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, oklch(0.13 0.02 258 / 0.78) 0%, oklch(0.13 0.02 258 / 0.55) 38%, oklch(0.13 0.02 258 / 0.26) 62%, oklch(0.13 0.02 258 / 0.50) 100%)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-52"
        style={{
          background: 'linear-gradient(to top, oklch(0.10 0.02 258 / 0.72), transparent)',
        }}
        aria-hidden
      />

      <div className="relative z-10 min-h-screen">{children}</div>

      {/* Caption — the photo's own story, the way Bing shows it. */}
      {hasCaption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="group pointer-events-auto max-w-[min(560px,58vw)]">
            <div
              className="max-h-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-focus-within:max-h-24 group-focus-within:opacity-100 group-hover:max-h-24 group-hover:opacity-100"
              aria-hidden
            >
              <p className="pb-2 text-[12px] leading-relaxed text-white/80">
                {current.caption}
                {current.credit && <span className="text-white/55"> · {current.credit}</span>}
              </p>
            </div>
            <a
              href={current.link ?? undefined}
              target={current.link ? '_blank' : undefined}
              rel={current.link ? 'noreferrer noopener' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-[var(--ap-radius-pill)] border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-md transition',
                current.link ? 'hover:bg-white/20' : 'cursor-default'
              )}
              title={`${current.title}${current.caption ? ` — ${current.caption}` : ''}`}
            >
              <Info className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
              <span className="truncate">{current.title}</span>
            </a>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            {count > 1 && (
              <span className="mr-1 hidden text-[11px] tabular-nums text-white/55 md:inline">
                {index + 1} / {count}
              </span>
            )}
            <button
              type="button"
              onClick={togglePaused}
              aria-label={paused ? 'Resume backdrop rotation' : 'Pause backdrop rotation'}
              title={paused ? 'Resume' : 'Pause'}
              className="flex size-8 items-center justify-center rounded-[var(--ap-radius-pill)] border border-white/15 bg-white/10 text-white/85 backdrop-blur-md transition hover:bg-white/20"
            >
              {paused ? (
                <Play className="size-3.5" strokeWidth={1.75} />
              ) : (
                <Pause className="size-3.5" strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Show another backdrop"
              title="Another photo"
              className="flex size-8 items-center justify-center rounded-[var(--ap-radius-pill)] border border-white/15 bg-white/10 text-white/85 backdrop-blur-md transition hover:bg-white/20"
            >
              <Shuffle className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {/* Sources are credited even when nobody hovers the chip. */}
      {source === 'bing' && (
        <span className="sr-only">Backdrop photography: Bing image of the day.</span>
      )}
    </div>
  )
}
