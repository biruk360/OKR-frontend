'use client'

import OkrCloseModal from '@/components/shared/OkrCloseModal'

export default function CloseKeyResultModal(props: {
  open: boolean
  onClose: () => void
  keyResult: any
  onInitiated?: () => void
  achievedShortcut?: boolean
}) {
  return <OkrCloseModal {...props} entity={props.keyResult} entityType="keyResult" />
}
