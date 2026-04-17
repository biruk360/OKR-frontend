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
  width?: 'sm' | 'md' | 'lg'
}

const widthClass: Record<NonNullable<Props['width']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
}

export default function SideDrawer({ open, onClose, title, children, width = 'md' }: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className={widthClass[width]}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
