import { CONTACT_IMAGE_JPEG_QUALITY, CONTACT_IMAGE_MAX_EDGE } from '@/lib/validation/contact'

/**
 * 添付の画像を長い辺 1,600px の JPEG に描き直す（ブラウザ専用。031 §4.7）。
 * 転送を小さくするためのもの（Vercel の関数は 1 リクエスト 4.5MB まで）。守りはサーバーの書き出し直し（`lib/contact/attachments.ts`）
 */

export async function resizeImage(file: File): Promise<Blob> {
  // オプションは渡さない: `imageOrientation: 'from-image'` を知らない古いブラウザは例外にする。
  // いまのブラウザは既定で EXIF の向きを反映する（仕様の既定が from-image）。反映しない古いブラウザでは横向きのまま届く
  // （描き直すと EXIF が消えるので、サーバーの `rotate()` では直せない）。読めずに添付できないより、向きが違うほうを取る
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, CONTACT_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas の 2d が使えません')
    // 透過の PNG は JPEG にすると黒くなるので、白を敷いてから描く
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('JPEG に書き出せません'))),
        'image/jpeg',
        CONTACT_IMAGE_JPEG_QUALITY
      )
    })
  } finally {
    bitmap.close()
  }
}

/** プレビュー用の `data:` の URL（`blob:` は CSP の `img-src` に無い。022） */
export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
