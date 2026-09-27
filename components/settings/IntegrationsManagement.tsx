'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Mail, MessageSquare, Key } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import AiProviderSettingsPanel from './AiProviderSettingsPanel'
import { PageHeader } from '@/components/ui/PageHeader'

interface FormData {
  emailApiKey?: string
  slackWebhookUrl?: string
  slackApiKey?: string
}

type Field = keyof FormData

/**
 * GET /api/settings/integrations never returns a secret — each value arrives
 * masked (`••••••••` + last four) with a `configured` flag. The inputs start
 * empty and the mask is shown as a hint; an empty field is saved as
 * "unchanged" server-side, so a secret can be replaced but never echoed back.
 */
interface MaskedSettings {
  masked: Record<Field, string>
  configured: Record<Field, boolean>
}

const EMPTY_FORM: FormData = { emailApiKey: '', slackWebhookUrl: '', slackApiKey: '' }

function keepHint(settings: MaskedSettings | null, field: Field, fallback: string): string {
  if (!settings?.configured[field]) return fallback
  return `Saved (${settings.masked[field] || '••••••••'}) — leave blank to keep`
}

export default function IntegrationsManagement({ showAiProviderSettings = false }: { showAiProviderSettings?: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState<MaskedSettings | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const { register, handleSubmit, reset } = useForm<FormData>({ defaultValues: EMPTY_FORM })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/integrations')
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      const data = await res.json()
      if (data.success && data.data) {
        setSettings({
          masked: {
            emailApiKey: data.data.emailApiKey ?? '',
            slackWebhookUrl: data.data.slackWebhookUrl ?? '',
            slackApiKey: data.data.slackApiKey ?? '',
          },
          configured: data.data.configured ?? { emailApiKey: false, slackWebhookUrl: false, slackApiKey: false },
        })
      }
    } catch {
      /* leave the form usable with empty hints */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
        // Never keep a typed secret in the form after it has been saved.
        reset(EMPTY_FORM)
        void load()
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
      <PageHeader
        className="mb-0"
        title="Integrations & API Keys"
        description="Configure approved external services and server-side credentials."
      />

      {showAiProviderSettings && <AiProviderSettingsPanel />}

      {forbidden && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="status">
          Only administrators can view or change integration credentials.
        </div>
      )}

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
              autoComplete="new-password"
              className="input"
              disabled={forbidden}
              placeholder={keepHint(settings, 'emailApiKey', 'Enter email service API key')}
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
                autoComplete="off"
                className="input"
                disabled={forbidden}
                placeholder={keepHint(settings, 'slackWebhookUrl', 'https://hooks.slack.com/services/...')}
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
                autoComplete="new-password"
                className="input"
                disabled={forbidden}
                placeholder={keepHint(settings, 'slackApiKey', 'xoxb-...')}
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
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary-600 hover:bg-primary-700"
            disabled={isLoading || forbidden}
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
