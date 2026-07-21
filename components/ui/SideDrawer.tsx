'use client'

import { type ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showHeader?: boolean
  contentClassName?: string
}

const widthClass: Record<NonNullable<Props['width']>, string> = {
  sm: 'data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
  md: 'data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-md data-[side=right]:sm:max-w-md',
  lg: 'data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-lg data-[side=right]:sm:max-w-lg',
  xl: 'data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-2xl data-[side=right]:sm:max-w-2xl',
  full: 'data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[calc(100vw-58px)] data-[side=right]:sm:max-w-[calc(100vw-58px)]',
}

export default function SideDrawer({ open, onClose, title, children, width = 'md', showHeader = true, contentClassName }: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className={cn(widthClass[width], !showHeader && 'gap-0')}>
        {showHeader ? (
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="sr-only">{title}</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetTitle className="sr-only">{title}</SheetTitle>
            <SheetDescription className="sr-only">{title}</SheetDescription>
          </>
        )}
        <div className={cn(width === 'full' ? 'flex min-h-0 flex-1 overflow-hidden p-0' : 'flex-1 overflow-y-auto p-4', contentClassName)}>{children}</div>
      </SheetContent>
    </Sheet>
  )
}
