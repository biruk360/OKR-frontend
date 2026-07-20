'use client'

import { type ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const widthClass: Record<NonNullable<Props['width']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  full: 'sm:max-w-[calc(100vw-58px)]',
}

export default function SideDrawer({ open, onClose, title, children, width = 'md' }: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className={widthClass[width]}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <div className={width === 'full' ? 'flex min-h-0 flex-1 overflow-hidden p-0' : 'flex-1 overflow-y-auto p-4'}>{children}</div>
      </SheetContent>
    </Sheet>
  )
}
