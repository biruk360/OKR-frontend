import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'

export default async function HomePage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }
  
  redirect('/dashboard')
}
