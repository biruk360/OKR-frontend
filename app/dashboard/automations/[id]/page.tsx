import { AutomationDetail } from '@/features/automations'

export const metadata = { title: 'Automation' }

export default function AutomationDetailPage({ params }: { params: { id: string } }) {
  return <AutomationDetail id={params.id} />
}
