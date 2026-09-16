import { BriefingView } from '@/features/automations'

export const metadata = { title: 'Briefing' }

export default function BriefingPage({ params }: { params: { id: string } }) {
  return <BriefingView id={params.id} />
}
