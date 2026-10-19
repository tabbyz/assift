import 'server-only'
import sharp from 'sharp'
import { ActionError } from '@/lib/actions/error'
import { contactImageSize } from './scale'
import {
  CONTACT_IMAGE_MAX_BYTES,
  CONTACT_IMAGE_JPEG_QUALITIES,
  CONTACT_IMAGE_MAX_COUNT,
  CONTACT_IMAGE_MAX_INPUT_PIXELS,
  CONTACT_IMAGE_TOO_LARGE_MESSAGE,
  CONTACT_IMAGE_UNREADABLE_MESSAGE,
  CONTACT_IMAGES_LIMIT_MESSAGE,
  CONTACT_IMAGES_TOTAL_MAX_BYTES,
} from '@/lib/validation/contact'

export type ContactAttachment = { filename: string; content: Buffer }

/** 画素を読む前に通す形式。`sharp` は SVG（画像の形をした文書）・TIFF・GIF・HEIF なども読めるので、ここで絞る（031 §4.7） */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])
/**
 * 添付の画像を確かめ、JPEG に書き出し直す（031 §3-12・§4.7）。
 *
 * 種類をファイル名・`File.type`・先頭のバイトで判定せず、`sharp` で読み込めて書き出せたものだけを添付にする
 * （OWASP の image rewriting）。画像でないものは失敗し、紛れ込んだ余計な中身とメタデータ（位置情報）は消える。
 * `rotate()` で向きを画素に反映してから、メタデータを付けずに書き出す（`sharp` の既定）。
 * 品質はブラウザと同じ順に下げ、1 枚の上限に収まったところで止める（ブラウザが品質を下げて収めた画像を、既定の品質で膨らませない）
 */
export async function rewriteContactImages(
  files: File[],
  { maxPixels = CONTACT_IMAGE_MAX_INPUT_PIXELS }: { maxPixels?: number } = {}
): Promise<ContactAttachment[]> {
  const images = files.filter((file) => file.size > 0)
  if (images.length > CONTACT_IMAGE_MAX_COUNT) throw new ActionError(CONTACT_IMAGES_LIMIT_MESSAGE)
  if (images.some((file) => file.size > CONTACT_IMAGE_MAX_BYTES)) {
    throw new ActionError(CONTACT_IMAGE_TOO_LARGE_MESSAGE)
  }
  const total = images.reduce((sum, file) => sum + file.size, 0)
  if (total > CONTACT_IMAGES_TOTAL_MAX_BYTES) throw new ActionError(CONTACT_IMAGES_LIMIT_MESSAGE)

  // 1 枚ずつ（同時に展開するとメモリの山が枚数倍になる）
  const attachments: ContactAttachment[] = []
  for (const [index, file] of images.entries()) {
    const input = Buffer.from(await file.arrayBuffer())
    attachments.push({
      filename: `image-${index + 1}.jpg`,
      content: await rewriteImage(input, index, maxPixels),
    })
  }
  return attachments
}

async function rewriteImage(input: Buffer, index: number, maxPixels: number): Promise<Buffer> {
  const unreadable = new ActionError(`${index + 1}枚目: ${CONTACT_IMAGE_UNREADABLE_MESSAGE}`)
  try {
    // metadata() はヘッダだけを読む。形式が合わなければ画素を読まずに止める
    const image = sharp(input, { limitInputPixels: maxPixels })
    const { format, autoOrient } = await image.metadata()
    if (!format || !ALLOWED_FORMATS.has(format)) throw unreadable
    // 大きさはブラウザと同じ計算（`autoOrient` は EXIF の向きを反映したあとの幅と高さ。`rotate()` のあとに合わせる）
    const size = contactImageSize(autoOrient.width, autoOrient.height)
    const pipeline = image
      .rotate()
      .resize(size.width, size.height, { fit: 'fill' })
      // 透過は白に（JPEG に透過は無く、そのままだと黒くなる）
      .flatten({ background: '#ffffff' })
    let output: Buffer | undefined
    for (const quality of CONTACT_IMAGE_JPEG_QUALITIES) {
      output = await pipeline
        .clone()
        .jpeg({ quality: Math.round(quality * 100) })
        .toBuffer()
      if (output.length <= CONTACT_IMAGE_MAX_BYTES) break
    }
    return output!
  } catch (error) {
    if (error instanceof ActionError) throw error
    // 画素数の上限（`limitInputPixels`）は「大きすぎる」と伝える（形式を選び直しても直らない）
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new ActionError(`${index + 1}枚目: ${CONTACT_IMAGE_TOO_LARGE_MESSAGE}`)
    }
    throw unreadable
  }
}
