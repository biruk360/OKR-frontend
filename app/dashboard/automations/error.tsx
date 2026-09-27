'use client'

import { SectionError } from '@/components/dashboard/SectionError'

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} section="Automations" />
}
