'use client'

import { Printer } from 'lucide-react'

export default function ProgressPagePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[12px] font-medium hover:bg-[color:var(--ap-bg-hover)]"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <Printer className="size-3.5" />
      Print
    </button>
  )
}
