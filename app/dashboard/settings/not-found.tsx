import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-2xl font-bold text-foreground mb-4">Settings Page Not Found</h2>
      <p className="text-muted-foreground mb-4">The settings page you're looking for doesn't exist.</p>
      <Link
        href="/dashboard/settings/profile"
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Go to Profile Settings
      </Link>
    </div>
  )
}

