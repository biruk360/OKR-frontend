import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-section-title text-foreground mb-4">Settings Page Not Found</h2>
      <p className="text-muted-foreground mb-4">The settings page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/dashboard/settings/profile" className={buttonVariants()}>
        Go to Profile Settings
      </Link>
    </div>
  )
}

