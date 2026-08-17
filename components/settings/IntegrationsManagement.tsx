'use client'

import { useState, useEffect } from 'react'
import { Save, Mail, MessageSquare, Key } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import AiProviderSettingsPanel from './AiProviderSettingsPanel'

interface FormData {
  emailApiKey?: string
  slackWebhookUrl?: string
  slackApiKey?: string
}

export default function IntegrationsManagement({ showAiProviderSettings = false }: { showAiProviderSettings?: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, reset } = useForm<FormData>()

  useEffect(() => {
    fetch('/api/settings/integrations')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          reset(data.data)
        }
      })
      .catch(() => {})
  }, [reset])

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Integration settings updated successfully')
      } else {
        toast.error(result.error || 'Failed to update integration settings')
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
        <h1 className="text-2xl font-bold text-foreground">Integrations & API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure approved external services and server-side credentials.
        </p>
      </div>

      {showAiProviderSettings && <AiProviderSettingsPanel />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Email Integration */}
        <div className="bg-card shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Mail className="h-5 w-5 text-muted-foreground mr-2" />
            <h3 className="text-lg font-medium text-foreground">Email Integration</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Email API Key
            </label>
            <input
              {...register('emailApiKey')}
              type="password"
              className="input"
              placeholder="Enter email service API key"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              API key for sending email reminders and notifications.
            </p>
          </div>
        </div>

        {/* Slack Integration */}
        <div className="bg-card shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <MessageSquare className="h-5 w-5 text-muted-foreground mr-2" />
            <h3 className="text-lg font-medium text-foreground">Slack Integration</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Slack Webhook URL
              </label>
              <input
                {...register('slackWebhookUrl')}
                type="url"
                className="input"
                placeholder="https://hooks.slack.com/services/..."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Webhook URL for sending Slack notifications.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Slack API Key (Optional)
              </label>
              <input
                {...register('slackApiKey')}
                type="password"
                className="input"
                placeholder="xoxb-..."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Slack Bot Token for advanced integrations.
              </p>
            </div>
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
