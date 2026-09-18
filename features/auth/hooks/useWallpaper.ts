'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWallpapers, pickStartIndex, FALLBACK_SCENES } from '../services/wallpaper'
import type { Wallpaper, WallpaperSource } from '../types'

/** Remembers the last frame so the next sign-in opens on a different one. */
const LAST_SHOWN_KEY = 'okr.auth.lastWallpaperId'
/** Long enough to be scenery, short enough to notice while you type. */
const ROTATE_MS = 20_000
/** Must match the CSS crossfade on the image layers. */
const CROSSFADE_MS = 1_200

function readLastShownId(): string | null {
  try {
    return window.localStorage.getItem(LAST_SHOWN_KEY)
  } catch {
    return null
  }
}

function rememberLastShownId(id: string) {
  try {
    window.localStorage.setItem(LAST_SHOWN_KEY, id)
  } catch {
    /* private mode / blocked storage — the rotation still works, it just repeats */
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface UseWallpaperResult {
  /** The frame on screen. Never null — it starts on a built-in scene. */
  current: Wallpaper
  /** The frame fading out beneath it, if a change is in flight. */
  previous: Wallpaper | null
  /** True once the current photo has actually decoded. */
  imageReady: boolean
  /** Where the set came from — `fallback` means the built-in scenes. */
  source: WallpaperSource
  count: number
  index: number
  paused: boolean
  togglePaused: () => void
  /** Advance to the next frame (preloads first, so there is no flash). */
  next: () => void
}

/**
 * Drives the rotating sign-in backdrop.
 *
 * Only ever holds two images in the DOM — the one on screen and the one fading
 * out — and preloads the next frame before swapping, so a slow photo never
 * blanks the screen mid-fade. Rotation stops for `prefers-reduced-motion`.
 */
export function useWallpaper(): UseWallpaperResult {
  const [images, setImages] = useState<Wallpaper[]>(FALLBACK_SCENES)
  const [source, setSource] = useState<WallpaperSource>('fallback')
  const [index, setIndex] = useState(0)
  const [previous, setPrevious] = useState<Wallpaper | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const advancing = useRef(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the real set, then jump straight to a random frame from it. The first
  // paint is a built-in scene, so there is never an empty screen.
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    fetchWallpapers(controller.signal).then((payload) => {
      if (cancelled) return
      const start = pickStartIndex(payload.images, readLastShownId())
      setImages(payload.images)
      setSource(payload.source)
      setIndex(start)
      setImageReady(false)
      rememberLastShownId(payload.images[start]?.id ?? '')
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [])

  const current = images[index] ?? FALLBACK_SCENES[0]

  const goTo = useCallback(
    (nextIndex: number) => {
      if (advancing.current || images.length <= 1) return
      const target = images[nextIndex]
      if (!target || target.id === current.id) return

      const swap = () => {
        setPrevious(current)
        setIndex(nextIndex)
        setImageReady(Boolean(target.url))
        rememberLastShownId(target.id)
        advancing.current = false
        if (fadeTimer.current) clearTimeout(fadeTimer.current)
        // Drop the outgoing layer once the crossfade has finished.
        fadeTimer.current = setTimeout(() => setPrevious(null), CROSSFADE_MS)
      }

      if (!target.url) {
        swap()
        return
      }

      advancing.current = true
      const preload = new Image()
      preload.decoding = 'async'
      preload.referrerPolicy = 'no-referrer'
      preload.onload = swap
      preload.onerror = () => {
        advancing.current = false
      }
      preload.src = target.url
    },
    [current, images]
  )

  const next = useCallback(() => {
    goTo((index + 1) % Math.max(images.length, 1))
  }, [goTo, index, images.length])

  // Autoplay. Held while paused, and switched off entirely for reduced motion —
  // a backdrop that swaps itself is exactly the kind of motion that setting is
  // asking us to stop.
  useEffect(() => {
    if (paused || images.length <= 1 || prefersReducedMotion()) return
    const timer = setInterval(next, ROTATE_MS)
    return () => clearInterval(timer)
  }, [next, paused, images.length])

  const togglePaused = useCallback(() => setPaused((p) => !p), [])

  // The first frame reports its own decode through this; later frames are
  // already decoded by the preloader above.
  useEffect(() => {
    if (!current.url) {
      setImageReady(true)
      return
    }
    let cancelled = false
    const probe = new Image()
    probe.decoding = 'async'
    probe.referrerPolicy = 'no-referrer'
    probe.onload = () => {
      if (!cancelled) setImageReady(true)
    }
    probe.src = current.url
    return () => {
      cancelled = true
    }
  }, [current.url])

  return useMemo(
    () => ({
      current,
      previous,
      imageReady,
      source,
      count: images.length,
      index,
      paused,
      togglePaused,
      next,
    }),
    [current, previous, imageReady, source, images.length, index, paused, togglePaused, next]
  )
}
