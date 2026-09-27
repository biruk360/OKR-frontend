'use client'

import { cn } from '@/lib/utils'

export function Avatar({ name, size = 'sm' }: { name: string | null | undefined; size?: 'xs' | 'sm' | 'md' }) {
  const sz = size === 'xs' ? 'size-5 text-micro' : size === 'md' ? 'size-8 text-[13px]' : 'size-6 text-caption'
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full font-bold', sz)}
      style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--ap-accent)' }}
    >
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  )
}
