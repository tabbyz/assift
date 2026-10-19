import { CONTACT_IMAGE_MAX_EDGE, CONTACT_IMAGE_MAX_OUTPUT_PIXELS } from '@/lib/validation/contact'

/**
 * 添付の画像を縮めた大きさ（031 §4.7）。ブラウザの縮小とサーバーの書き出し直しで同じ計算を使う。
 *
 * 長い辺ではなく**画素数**で縮める: 長い辺で縮めると、縦に長いスクリーンショット（1,170 × 20,000 など）の幅が数十 px になり、
 * 文字が読めなくなる。長い辺はキャンバスの上限（ブラウザごとに 1〜3 万 px）に余裕を持たせるためだけに抑える。
 * 大きくはしない。どちらの辺も 1px 未満にしない（細長い画像でキャンバスが 0 になると書き出せない）
 */
export function contactImageSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(
    1,
    Math.sqrt(CONTACT_IMAGE_MAX_OUTPUT_PIXELS / (width * height)),
    CONTACT_IMAGE_MAX_EDGE / Math.max(width, height)
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
