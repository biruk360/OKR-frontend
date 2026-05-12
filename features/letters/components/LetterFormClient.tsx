'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Archive,
  Save,
} from 'lucide-react'
import {
  PageHeader,
  Button,
  Input,
  Textarea,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
} from '@/components/ui'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'
import {
  LETTER_TYPE_LABEL,
  type LetterStatus,
  type UpdateLetterForm,
  type LetterType,
} from '@/types'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import LetterStatusBadge from './LetterStatusBadge'
import LetterStatusBar from './LetterStatusBar'
import CustomerLookup from './CustomerLookup'
import EnclosuresPanel from './EnclosuresPanel'
import PdfPreviewPanel from './PdfPreviewPanel'
import MarkAsSentModal from './MarkAsSentModal'
import RejectLetterModal from './RejectLetterModal'
import type { LetterDetail, LetterEnclosureWithUploader } from '../types'
import {
  approveLetter,
  archiveLetter,
  submitLetter,
  markLetterSent,
  rejectLetter,
  unarchiveLetter,
  updateLetter,
} from '../services/lettersApi'

interface Props {
  initial: LetterDetail
  viewer: { id: string; role: string }
}

function canEditDraft(viewer: Props['viewer'], letter: LetterDetail): boolean {
  if (viewer.role === 'ADMIN') return true
  return letter.preparedById === viewer.id && letter.status === 'DRAFT'
}

function canApprove(role: string) {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

export default function LetterFormClient({ initial, viewer }: Props) {
  const router = useRouter()
  const [letter, setLetter] = useState<LetterDetail>(initial)
  const [subject, setSubject] = useState(letter.subject)
  const [salutation, setSalutation] = useState(letter.salutation || '')
  const [closing, setClosing] = useState(letter.closing || '')
  const [recipientAddress, setRecipientAddress] = useState(letter.recipientAddress || '')
  const [senderDepartment, setSenderDepartment] = useState(letter.senderDepartment || '')
  const [signatoryId, setSignatoryId] = useState<string | null>(letter.signatoryId)
  const [customerName, setCustomerName] = useState(letter.customerName)
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(letter.odooPartnerId)
  const [bodyContent, setBodyContent] = useState(letter.bodyContent || '')
  const [date, setDate] = useState(() => new Date(letter.date).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [enclosures, setEnclosures] = useState<LetterEnclosureWithUploader[]>(letter.enclosures)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)

  const editable = canEditDraft(viewer, letter)
  const status = letter.status as LetterStatus
  const { users } = useUsersForSelection()

  // FR-5: auto-save body content after 30s of inactivity (DRAFT only).
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!editable) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { void save({ silent: true }) }, 30_000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyContent])

  async function save(opts?: { silent?: boolean }): Promise<void> {
    if (!editable) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload: UpdateLetterForm = {
        subject,
        date,
        customerName,
        odooPartnerId,
        recipientAddress,
        salutation,
        closing,
        senderDepartment,
        signatoryId,
        bodyContent,
      }
      const updated = await updateLetter(letter.id, payload)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      if (!opts?.silent) setSaveError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    try {
      await save() // ensure latest fields persisted first
      const updated = await submitLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Submit failed')
    }
  }

  async function handleApprove() {
    try {
      const updated = await approveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Approval failed')
    }
  }

  async function handleArchive() {
    try {
      const updated = await archiveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Archive failed')
    }
  }

  async function handleUnarchive() {
    try {
      const updated = await unarchiveLetter(letter.id)
      setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
    } catch (e: any) {
      setSaveError(e?.message || 'Unarchive failed')
    }
  }

  const transitionButtons = useMemo(() => {
    const buttons: React.ReactNode[] = []
    if (status === 'DRAFT' && editable) {
      buttons.push(
        <Button key="submit" onClick={handleSubmit} size="sm">
          <Send className="mr-1.5 size-3.5" /> Submit for Approval
        </Button>
      )
    }
    if (status === 'SUBMITTED' && canApprove(viewer.role)) {
      buttons.push(
        <Button key="approve" onClick={handleApprove} size="sm">
          <CheckCircle2 className="mr-1.5 size-3.5" /> Approve
        </Button>
      )
      buttons.push(
        <Button key="reject" variant="outline" size="sm" onClick={() => setShowRejectModal(true)}>
          <XCircle className="mr-1.5 size-3.5" /> Return to Draft
        </Button>
      )
    }
    if (status === 'APPROVED') {
      buttons.push(
        <Button key="send" onClick={() => setShowSendModal(true)} size="sm">
          <PackageCheck className="mr-1.5 size-3.5" /> Mark as Sent
        </Button>
      )
    }
    if (status === 'SENT') {
      buttons.push(
        <Button key="archive" variant="outline" size="sm" onClick={handleArchive}>
          <Archive className="mr-1.5 size-3.5" /> Archive
        </Button>
      )
    }
    if (status === 'ARCHIVED' && viewer.role === 'ADMIN') {
      buttons.push(
        <Button key="unarchive" variant="outline" size="sm" onClick={handleUnarchive}>
          Unarchive
        </Button>
      )
    }
    return buttons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, editable, viewer.role])

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={letter.referenceNumber || 'Draft Letter'}
        description={`${LETTER_TYPE_LABEL[letter.letterType as LetterType]} · prepared by ${letter.preparedBy.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/letters">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1.5 size-3.5" /> Back
              </Button>
            </Link>
            {editable && (
              <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
                <Save className="mr-1.5 size-3.5" /> {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
            {transitionButtons}
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LetterStatusBar status={status} />
          <LetterStatusBadge status={status} />
        </div>
      </Card>

      {saveError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
      )}

      <Card className="space-y-4 p-4">
        <div>
          <Label htmlFor="lf-subject">Subject</Label>
          <Input
            id="lf-subject"
            value={subject}
            disabled={!editable}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={255}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recipient Details</h3>
            <div>
              <Label>Customer</Label>
              <CustomerLookup
                value={{ odooPartnerId, customerName }}
                onChange={(v) => {
                  setCustomerName(v.customerName)
                  setOdooPartnerId(v.odooPartnerId)
                  if (v.address && !recipientAddress) setRecipientAddress(v.address)
                }}
                disabled={!editable}
              />
            </div>
            <div>
              <Label htmlFor="lf-address">Recipient Address</Label>
              <Textarea
                id="lf-address"
                rows={3}
                value={recipientAddress}
                disabled={!editable}
                onChange={(e) => setRecipientAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lf-salutation">Salutation</Label>
                <Input id="lf-salutation" value={salutation} disabled={!editable} onChange={(e) => setSalutation(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lf-closing">Closing</Label>
                <Input id="lf-closing" value={closing} disabled={!editable} onChange={(e) => setClosing(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sender Info</h3>
            <div>
              <Label htmlFor="lf-date">Date</Label>
              <Input id="lf-date" type="date" value={date} disabled={!editable} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Letter Type</Label>
              <Input value={LETTER_TYPE_LABEL[letter.letterType as LetterType]} disabled />
            </div>
            <div>
              <Label htmlFor="lf-signatory">Signatory</Label>
              <select
                id="lf-signatory"
                value={signatoryId || ''}
                disabled={!editable && status !== 'SUBMITTED'}
                onChange={(e) => setSignatoryId(e.target.value || null)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Select signatory —</option>
                {(users || []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="lf-dept">Sender Department</Label>
              <Input id="lf-dept" value={senderDepartment} disabled={!editable} onChange={(e) => setSenderDepartment(e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="body" className="w-full">
        <TabsList>
          <TabsTrigger value="body">Body Content</TabsTrigger>
          <TabsTrigger value="enclosures">Enclosures ({enclosures.length})</TabsTrigger>
          <TabsTrigger value="preview">PDF Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="body">
          <Card className="p-4">
            <Label className="mb-1 block text-xs text-gray-500">
              HTML supported. Placeholders like <code>{'{{customer_name}}'}</code>, <code>{'{{date}}'}</code>,
              <code>{'{{reference_number}}'}</code> are resolved at PDF generation.
            </Label>
            <Textarea
              rows={18}
              value={bodyContent}
              disabled={!editable}
              onChange={(e) => setBodyContent(e.target.value)}
              className="font-mono text-sm"
            />
          </Card>
        </TabsContent>
        <TabsContent value="enclosures">
          <Card className="p-4">
            <EnclosuresPanel
              letterId={letter.id}
              enclosures={enclosures}
              canEdit={editable}
              onChange={setEnclosures}
            />
          </Card>
        </TabsContent>
        <TabsContent value="preview">
          <Card className="p-4">
            <PdfPreviewPanel letterId={letter.id} canPrint={status !== 'DRAFT'} />
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Activity Log</h3>
        <ActivityLogPanel entityType="letter" entityId={letter.id} embedded />
      </Card>

      <RejectLetterModal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={async (reason) => {
          const updated = await rejectLetter(letter.id, reason)
          setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
        }}
      />
      <MarkAsSentModal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSubmit={async (payload) => {
          const updated = await markLetterSent(letter.id, payload)
          setLetter((prev) => ({ ...prev, ...updated, enclosures: prev.enclosures }))
        }}
      />
    </div>
  )
}
