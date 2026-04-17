'use client'

import { useState, useEffect } from 'react'
import { Save, Upload, Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

interface FormData {
  workspaceName: string
  logoUrl?: string
}

export default function BrandingManagement() {
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>()

  useEffect(() => {
    // Load current settings
    fetch('/api/settings/branding')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          reset(data.data)
        }
      })
      .catch(() => {
        // Use defaults
        reset({ workspaceName: 'OKR System' })
      })
  }, [reset])

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/settings/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Branding settings updated successfully')
      } else {
        toast.error(result.error || 'Failed to update branding settings')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Branding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize your workspace name and logo.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Workspace Name */}
        <div className="bg-card shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Building2 className="h-5 w-5 text-muted-foreground mr-2" />
            <h3 className="text-lg font-medium text-foreground">Workspace Name</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Workspace Name
            </label>
            <input
              {...register('workspaceName', { required: 'Workspace name is required' })}
              type="text"
              className="input"
              placeholder="Enter workspace name"
            />
            {errors.workspaceName && (
              <p className="mt-1 text-sm text-red-600">{errors.workspaceName.message}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              This name will appear in the sidebar and throughout the application.
            </p>
          </div>
        </div>

        {/* Logo */}
        <div className="bg-card shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Upload className="h-5 w-5 text-muted-foreground mr-2" />
            <h3 className="text-lg font-medium text-foreground">Logo</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Logo URL
            </label>
            <input
              {...register('logoUrl')}
              type="url"
              className="input"
              placeholder="https://example.com/logo.png"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Enter a URL to your logo image. Recommended size: 200x50px.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

