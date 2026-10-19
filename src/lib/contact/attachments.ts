import 'server-only'
import sharp from 'sharp'
import { ActionError } from '@/lib/actions/error'
import {
  CONTACT_IMAGE_MAX_BYTES,
  CONTACT_IMAGE_MAX_COUNT,
  CONTACT_IMAGES_TOTAL_MAX_BYTES,
} from '@/lib/validation/contact'

export type ContactAttachment = { filename: string; content: Buffer }

/** 画素を読む前に通す形式。`sharp` は SVG（画像の形をした文書）・TIFF・GIF・HEIF なども読めるので、ここで絞る（031 §4.7） */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])
const MAX_EDGE = 1600
const JPEG_QUALITY = 85
/** 読み込むと巨大になる画像（解凍爆弾）を弾く。`sharp` の既定（約 2.7 億画素）より小さく */
export const CONTACT_IMAGE_MAX_PIXELS = 40_000_000

const sizeMessage = `画像は${CONTACT_IMAGE_MAX_COUNT}枚まで、合計${CONTACT_IMAGES_TOTAL_MAX_BYTES / 1024 / 1024}MBまで添付できます`

/**
 * 添付の画像を確かめ、JPEG に書き出し直す（031 §3-12・§4.7）。
 *
 * 種類をファイル名・`File.type`・先頭のバイトで判定せず、`sharp` で読み込めて書き出せたものだけを添付にする
 * （OWASP の image rewriting）。画像でないものは失敗し、紛れ込んだ余計な中身とメタデータ（位置情報）は消える。
 * `rotate()` で向きを画素に反映してから、メタデータを付けずに書き出す（`sharp` の既定）
 */
export async function rewriteContactImages(
  files: File[],
  { maxPixels = CONTACT_IMAGE_MAX_PIXELS }: { maxPixels?: number } = {}
): Promise<ContactAttachment[]> {
  const images = files.filter((file) => file.size > 0)
  if (images.length > CONTACT_IMAGE_MAX_COUNT) throw new ActionError(sizeMessage)
  const total = images.reduce((sum, file) => sum + file.size, 0)
  if (
    images.some((file) => file.size > CONTACT_IMAGE_MAX_BYTES) ||
    total > CONTACT_IMAGES_TOTAL_MAX_BYTES
  ) {
    throw new ActionError(sizeMessage)
  }

  return Promise.all(
    images.map(async (file, index) => {
      const input = Buffer.from(await file.arrayBuffer())
      return {
        filename: `image-${index + 1}.jpg`,
        content: await rewriteImage(input, index, maxPixels),
      }
    })
  )
}

async function rewriteImage(input: Buffer, index: number, maxPixels: number): Promise<Buffer> {
  const unreadable = new ActionError(
    `${index + 1}枚目の画像は添付できません。PNG・JPEG・WebP の画像を選んでください`
  )
  try {
    // metadata() はヘッダだけを読む。形式が合わなければ画素を読まずに止める
    const { format } = await sharp(input, { limitInputPixels: maxPixels }).metadata()
    if (!format || !ALLOWED_FORMATS.has(format)) throw unreadable
    return await sharp(input, { limitInputPixels: maxPixels })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      // 透過は白に（JPEG に透過は無く、そのままだと黒くなる）
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (error) {
    if (error instanceof ActionError) throw error
    throw unreadable
  }
}
