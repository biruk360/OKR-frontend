import { AutomationEditPage } from '@/features/automations'

export const metadata = { title: 'Edit automation' }

export default function EditAutomationPage({ params }: { params: { id: string } }) {
  return <AutomationEditPage id={params.id} />
}
