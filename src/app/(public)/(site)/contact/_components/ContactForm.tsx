'use client'

import { type FormEvent, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Anchor,
  Box,
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
import { v4 as uuidv4 } from 'uuid'
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
  CONTACT_SEND_FAILED_MESSAGE,
  CONTACT_TOPICS,
  type ContactTopic,
} from '@/lib/validation/contact'
import { type ContactSent, sendContact } from '../actions'
import { resizeImage, toDataUrl } from '../_lib/resizeImage'

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
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [sent, setSent] = useState<ContactSent>()
  const [isPending, startTransition] = useTransition()
  const [isResizing, setIsResizing] = useState(false)
  // フォーム 1 回分の id。同じ内容の連打・送り直しを Resend が 1 通にまとめる（031 §4.5）。
  // `uuid` の v4 は `crypto.randomUUID()` が無い http の LAN（開発）でも `getRandomValues` で作る
  const [requestId] = useState(() => uuidv4())
  const nextAttachmentId = useRef(0)
  // 選んだファイルを入力欄から消す。消さないと、外した画像をもう一度選んでも change が起きない
  const resetFileInput = useRef<() => void>(null)
  // ハニーポットは React の状態にせず、送るときに DOM の値を読む（イベントを起こさずに `.value` を書くボットも拾う）
  const honeypotRef = useRef<HTMLInputElement>(null)

  /**
   * 選んだ画像を 1 枚ずつ縮小して足す（並行にすると、スマホで大きな写真を同時に展開してメモリが足りなくなる）。
   * 読めない画像・上限を超える画像は外し、空きがある限り後ろの画像を試す。外した理由は 1 つにまとめて出す。
   * 縮小のあいだは外すボタンと送信を止めるので、`attachments` はこの間に変わらない
   */
  const addImages = async (files: File[]) => {
    resetFileInput.current?.()
    if (files.length === 0 || attachments.length >= CONTACT_IMAGE_MAX_COUNT) return
    setIsResizing(true)
    setError(undefined)
    try {
      const next = [...attachments]
      let total = next.reduce((sum, a) => sum + a.blob.size, 0)
      let message: string | undefined
      for (const file of files) {
        if (next.length >= CONTACT_IMAGE_MAX_COUNT) {
          message ??= CONTACT_IMAGES_LIMIT_MESSAGE
          break
        }
        let blob: Blob
        let preview: string
        try {
          blob = await resizeImage(file)
          preview = await toDataUrl(blob)
        } catch {
          message ??= CONTACT_IMAGE_UNREADABLE_MESSAGE
          continue
        }
        // サーバーと同じ上限（1 枚・合計）。超えると送信のときに断られるので、選んだ時点で外す
        if (blob.size > CONTACT_IMAGE_MAX_BYTES) {
          message ??= CONTACT_IMAGE_TOO_LARGE_MESSAGE
          continue
        }
        if (total + blob.size > CONTACT_IMAGES_TOTAL_MAX_BYTES) {
          message ??= CONTACT_IMAGES_LIMIT_MESSAGE
          continue
        }
        total += blob.size
        next.push({ id: nextAttachmentId.current++, blob, preview })
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
    data.set('honeypot', honeypotRef.current?.value ?? '')
    if (account) data.set('asAccount', '1')
    attachments.forEach((a, i) => data.append('images', a.blob, `image-${i + 1}.jpg`))

    startTransition(async () => {
      try {
        const r = await sendContact(data)
        if (!r.ok) {
          setError(r.error)
          // 入力の誤りは直せば送れるので、代わりのアドレスは送れなかったときだけ案内する
          setFailed(r.error === CONTACT_SEND_FAILED_MESSAGE)
          // セッションが切れていた: 入力はそのまま残し、返信先の欄を出す
          if (r.code === 'contact_email_required') setAccount(null)
          return
        }
        setSent(r.data)
      } catch {
        // 大きさの上限（bodySizeLimit）や通信の失敗は Action の外で起きる
        setError(CONTACT_SEND_FAILED_MESSAGE)
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
                <Box key={a.id} pos="relative">
                  <Image
                    src={a.preview}
                    alt={`添付 ${i + 1} 枚目`}
                    radius="sm"
                    h={96}
                    fit="cover"
                  />
                  <CloseButton
                    pos="absolute"
                    top={4}
                    right={4}
                    bg="white"
                    size="sm"
                    aria-label={`添付 ${i + 1} 枚目を外す`}
                    disabled={isResizing}
                    onClick={() =>
                      setAttachments((current) => current.filter((x) => x.id !== a.id))
                    }
                  />
                </Box>
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
            名前は自動入力の拡張機能が埋めそうな語（website・url・name・email など）を避ける。
            画面の外に出す（`display: none` は一部のボットが見抜く） */}
        <Box
          pos="absolute"
          left={-10000}
          w={1}
          h={1}
          style={{ overflow: 'hidden' }}
          aria-hidden="true"
        >
          <label>
            この欄は空のままにしてください
            <input
              type="text"
              name="hp_ref_code"
              tabIndex={-1}
              autoComplete="off"
              ref={honeypotRef}
              defaultValue=""
            />
          </label>
        </Box>

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
