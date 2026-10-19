'use client'

import { type FormEvent, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Anchor,
  Button,
  CloseButton,
  FileButton,
  Group,
  Image,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { IconPhotoPlus } from '@tabler/icons-react'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { CONTACT_EMAIL } from '@/components/billing/contact'
import {
  CONTACT_BODY_MAX_LENGTH,
  CONTACT_IMAGE_MAX_BYTES,
  CONTACT_IMAGE_MAX_COUNT,
  CONTACT_IMAGE_TOO_LARGE_MESSAGE,
  CONTACT_IMAGE_UNREADABLE_MESSAGE,
  CONTACT_IMAGES_LIMIT_MESSAGE,
  CONTACT_IMAGES_TOTAL_MAX_BYTES,
  CONTACT_TOPICS,
  type ContactTopic,
} from '@/lib/validation/contact'
import { type ContactSent, sendContact } from '../actions'
import { resizeImage, toDataUrl } from '../_lib/resizeImage'
import classes from './ContactForm.module.css'

type Props = {
  /** ログイン中のアカウントのアドレス。null なら未ログイン（返信先を入力してもらう） */
  account: string | null
  /** RLS で見えた店舗（ログイン中だけ） */
  tenant: { id: string; name: string } | null
  digest: string | null
  initialTopic: ContactTopic | null
}

/** `id` はサムネイルの key（同じ画像を 2 回選んでも別の添付として扱う） */
type Attachment = { id: number; blob: Blob; preview: string }

const TOPIC_OPTIONS = Object.entries(CONTACT_TOPICS).map(([value, label]) => ({ value, label }))

export function ContactForm({ account: initialAccount, tenant, digest, initialTopic }: Props) {
  // 送るときにセッションが切れていたら null にして、返信先の欄を出す（`contact_email_required`）
  const [account, setAccount] = useState(initialAccount)
  const [topic, setTopic] = useState<string | null>(initialTopic)
  const [email, setEmail] = useState('')
  const [body, setBody] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [sent, setSent] = useState<ContactSent>()
  const [isPending, startTransition] = useTransition()
  const [isResizing, setIsResizing] = useState(false)
  // フォーム 1 回分の id。同じ内容の連打・送り直しを Resend が 1 通にまとめる（031 §4.5）
  const [requestId] = useState(randomUuid)
  const nextAttachmentId = useRef(0)
  // 選んだファイルを入力欄から消す。消さないと、外した画像をもう一度選んでも change が起きない
  const resetFileInput = useRef<() => void>(null)

  /**
   * 選んだ画像を縮小して足す。読めない画像・上限を超える画像だけを外し、ほかは足す（理由は 1 つにまとめて出す）。
   * 縮小のあいだは外すボタンと送信を止めるので、`attachments` はこの間に変わらない
   */
  const addImages = async (files: File[]) => {
    resetFileInput.current?.()
    const room = CONTACT_IMAGE_MAX_COUNT - attachments.length
    if (files.length === 0 || room <= 0) return
    setIsResizing(true)
    setError(undefined)
    try {
      const resized = await Promise.all(
        files.slice(0, room).map(async (file) => {
          try {
            const blob = await resizeImage(file)
            return { blob, preview: await toDataUrl(blob) }
          } catch {
            return null
          }
        })
      )
      let message = resized.includes(null)
        ? CONTACT_IMAGE_UNREADABLE_MESSAGE
        : files.length > room
          ? CONTACT_IMAGES_LIMIT_MESSAGE
          : undefined
      // サーバーと同じ上限（1 枚・合計）。超えると送信のときに断られるので、選んだ時点で外す
      const next = [...attachments]
      let total = next.reduce((sum, a) => sum + a.blob.size, 0)
      for (const r of resized) {
        if (!r) continue
        if (r.blob.size > CONTACT_IMAGE_MAX_BYTES) {
          message ??= CONTACT_IMAGE_TOO_LARGE_MESSAGE
          continue
        }
        if (total + r.blob.size > CONTACT_IMAGES_TOTAL_MAX_BYTES) {
          message ??= CONTACT_IMAGES_LIMIT_MESSAGE
          continue
        }
        total += r.blob.size
        next.push({ id: nextAttachmentId.current++, ...r })
      }
      setAttachments(next)
      setError(message)
    } finally {
      setIsResizing(false)
    }
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData()
    data.set('topic', topic ?? '')
    if (!account) data.set('email', email)
    data.set('body', body)
    data.set('requestId', requestId)
    if (tenant) data.set('tenantId', tenant.id)
    if (digest) data.set('digest', digest)
    data.set('honeypot', honeypot)
    if (account) data.set('asAccount', '1')
    attachments.forEach((a, i) => data.append('images', a.blob, `image-${i + 1}.jpg`))

    startTransition(async () => {
      try {
        const r = await sendContact(data)
        if (!r.ok) {
          setError(r.error)
          if (r.code === 'contact_email_required') {
            // 入力はそのまま残し、返信先の欄を出す（アドレスの案内は出さない。欄を埋めれば送れる）
            setAccount(null)
            return
          }
          setFailed(true)
          return
        }
        setSent(r.data)
      } catch {
        // 大きさの上限（bodySizeLimit）や通信の失敗は Action の外で起きる
        setError('送信できませんでした。時間をおいてもう一度お試しください')
        setFailed(true)
      }
    })
  }

  if (sent) {
    return (
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Title order={2} size="h4">
            送信しました
          </Title>
          <Text>
            {sent.fromAccount ? 'ログイン中のアカウントのアドレス' : 'ご入力のアドレス'}（
            {sent.replyTo}
            ）へ返信します。数日たっても届かない場合は、迷惑メールのフォルダをご確認ください。
          </Text>
        </Stack>
      </Paper>
    )
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="lg">
        <FormErrorAlert message={error} />
        {failed && (
          // 失敗したときだけアドレスを出す（Client の state でしか描かれないので、クローラーは読まない。031 §4.3）
          <Text size="sm" c="dimmed">
            解決しない場合は {CONTACT_EMAIL} へメールでお問い合わせください。
          </Text>
        )}

        {account ? (
          <Paper withBorder p="md" radius="md" bg="gray.0">
            <Stack gap={4}>
              <Text size="sm">ログイン中のアカウント（{account}）へ返信します。</Text>
              <Text size="xs" c="dimmed">
                調査のため、アカウント
                {tenant ? `・店舗「${tenant.name}」` : ''}
                {digest ? '・エラー番号' : ''}
                ・ブラウザの種類を添えてお送りします。
              </Text>
            </Stack>
          </Paper>
        ) : (
          <TextInput
            label="返信先のメールアドレス"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
        )}

        <Select
          label="お問い合わせの種類"
          placeholder="選んでください"
          data={TOPIC_OPTIONS}
          value={topic}
          onChange={setTopic}
          allowDeselect={false}
          required
        />

        <Textarea
          label="お問い合わせの内容"
          description={digest ? `エラー番号（${digest}）は自動で添えます。` : undefined}
          autosize
          minRows={6}
          maxLength={CONTACT_BODY_MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          required
        />

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            画像（任意・{CONTACT_IMAGE_MAX_COUNT}枚まで）
          </Text>
          <Text size="xs" c="dimmed">
            画面のスクリーンショットがあると、状況が伝わりやすくなります。
          </Text>
          {attachments.length > 0 && (
            <SimpleGrid cols={{ base: 3, xs: 4 }} spacing="xs">
              {attachments.map((a, i) => (
                <div key={a.id} className={classes.thumb}>
                  <Image
                    src={a.preview}
                    alt={`添付 ${i + 1} 枚目`}
                    radius="sm"
                    h={96}
                    fit="cover"
                  />
                  <CloseButton
                    className={classes.remove}
                    size="sm"
                    aria-label={`添付 ${i + 1} 枚目を外す`}
                    disabled={isResizing}
                    onClick={() => setAttachments((current) => current.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
            </SimpleGrid>
          )}
          {attachments.length < CONTACT_IMAGE_MAX_COUNT && (
            <Group>
              <FileButton
                onChange={addImages}
                resetRef={resetFileInput}
                accept="image/png,image/jpeg,image/webp"
                multiple
              >
                {(props) => (
                  <Button
                    {...props}
                    variant="default"
                    leftSection={<IconPhotoPlus size={16} />}
                    loading={isResizing}
                  >
                    画像を選ぶ
                  </Button>
                )}
              </FileButton>
            </Group>
          )}
        </Stack>

        {/* ハニーポット（031 §4.6）。人には見えず、読み上げ・タブ移動でも届かない。`type="hidden"` はボットが避けるので使わない。
            名前は自動入力の拡張機能が埋めそうな語（website・url・name・email など）を避ける */}
        <div className={classes.honeypot} aria-hidden="true">
          <label>
            この欄は空のままにしてください
            <input
              type="text"
              name="hp_ref_code"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.currentTarget.value)}
            />
          </label>
        </div>

        <Text size="xs" c="dimmed">
          送信いただいた内容は、
          <Anchor component={Link} href="/privacy" inherit>
            プライバシーポリシー
          </Anchor>
          に従って取り扱います。
        </Text>

        <Group justify="flex-end">
          <Button type="submit" loading={isPending} disabled={isResizing}>
            送信する
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/**
 * フォーム 1 回分の id（uuid v4 の形）。`crypto.randomUUID()` は安全なオリジン（https・localhost）でしか使えず、
 * LAN の http（`http://192.168.x.x:3000` の開発）ではページごと落ちるので、どこでも使える `getRandomValues` で作る
 */
function randomUuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
