import { Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'

/** フォーム上部に出すエラー。message が無ければ何も描画しない */
export function FormErrorAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
      {message}
    </Alert>
  )
}
