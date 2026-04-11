'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error-report'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError({
      source: 'react-error-boundary.global',
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    })
  }, [error, error.digest, error.message, error.stack])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Application error</h2>
        <p style={{ color: '#444', marginBottom: '1rem' }}>{error.message}</p>
        {error.digest ? (
          <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
