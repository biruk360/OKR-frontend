import { NextRequest } from 'next/server'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { canAuthorAutomations } from '@/lib/automations/access'
import { isToolAvailable } from '@/lib/automations/tools'
import { isOdooConfigured } from '@/lib/odoo/client'
import { resolveAiProviderCredential } from '@/lib/ai/credentials'
import { TOOL_IDS, type ToolId } from '@/types/automations'
import type { UserRole } from '@/types'

/**
 * What an author can actually build with right now.
 *
 * `available` is a phase question (is the tool implemented?); `configured` is an
 * environment question (are its credentials present?). The form needs both so it
 * can explain *why* a tool is unusable instead of silently hiding it.
 */
const TOOL_META: Record<ToolId, { label: string; description: string; phase: string }> = {
  'okr.query': { label: 'OKR & delivery data', description: 'Objectives, key results, to-dos, projects, risks and sprints — scoped to what you can already see.', phase: 'P0' },
  'odoo.search': { label: 'Odoo CRM & ERP', description: 'Read leads, orders, invoices, partners and tasks from Odoo. Read-only.', phase: 'P1' },
  'web.search': { label: 'Web search', description: 'Search the public web for tenders, news and announcements.', phase: 'P2' },
  'web.fetch': { label: 'Fetch a web page', description: 'Read a page or PDF from an allowlisted domain.', phase: 'P2' },
  'mail.search': { label: 'Shared mailbox', description: 'Read a shared service mailbox.', phase: 'P3' },
  'site.login': { label: 'Authenticated site', description: 'Sign in to a declared third-party site and read it.', phase: 'P3' },
}

async function isConfigured(tool: ToolId): Promise<boolean> {
  switch (tool) {
    case 'okr.query':
      return true
    case 'odoo.search':
      return isOdooConfigured()
    default:
      return false
  }
}

export const GET = withAuth(async (_request: NextRequest, { session }) => {
  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canAuthorAutomations(principal))) return apiForbidden('Insufficient permissions')

  // Synthesis needs an OpenAI credential regardless of which tools are picked.
  const aiCredential = await resolveAiProviderCredential('openai')

  const tools = await Promise.all(
    TOOL_IDS.map(async (tool) => ({
      tool,
      ...TOOL_META[tool],
      available: isToolAvailable(tool),
      configured: await isConfigured(tool),
    }))
  )

  return apiSuccess({ tools, aiConfigured: aiCredential !== null })
})
