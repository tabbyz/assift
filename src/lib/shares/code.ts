/**
 * 共有 URL のコード（v1 `Share#set_code`）。
 *
 * v1 は `SecureRandom.alphanumeric(8)` のあと `tr("0O1lIij", "2345678")` で読み間違えやすい文字を
 * 置き換えていたが、置換なので置換先の 7 文字だけ 2 倍出る。v2 は最初から 55 文字から引く。
 */
export const SHARE_CODE_LENGTH = 8

/** 英数字から `0 O 1 l I i j` を除いた 55 文字（v1 が読み間違えを避けた文字） */
export const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnopqrstuvwxyz'

/**
 * 剰余バイアスを消すための足切り。`256 % 55 = 36` なので、220 以上のバイトを採ると
 * アルファベットの先頭 36 文字だけが 1 回分多く出る。捨てて引き直す。
 */
const REJECT_FROM = 256 - (256 % SHARE_CODE_ALPHABET.length)

function cryptoBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * 引き直しの上限。1 バイトの 86%（220/256）が使えるので、実際には 1〜2 回で 8 文字が埋まる。
 * 上限を置くのは、差し替えた乱数源が使えるバイトを返さないときに**無限ループにしない**ため。
 */
const MAX_DRAWS = 16

/** 乱数源は差し替えられる（テストで固定するため）。既定は `crypto.getRandomValues` */
export function generateShareCode(randomBytes: (n: number) => Uint8Array = cryptoBytes): string {
  let code = ''
  for (let draw = 0; draw < MAX_DRAWS && code.length < SHARE_CODE_LENGTH; draw++) {
    for (const byte of randomBytes(SHARE_CODE_LENGTH - code.length)) {
      if (byte >= REJECT_FROM) continue
      code += SHARE_CODE_ALPHABET[byte % SHARE_CODE_ALPHABET.length]
      // 要求より多く返す乱数源に当たっても 8 文字を超えない（DB の CHECK に頼らない）
      if (code.length === SHARE_CODE_LENGTH) break
    }
  }
  if (code.length < SHARE_CODE_LENGTH) {
    throw new Error('generateShareCode: 乱数源が使えるバイトを返さない')
  }
  return code
}

/**
 * URL から来たコードの形式。DB の CHECK（`^[A-Za-z0-9]{8}$`）と同じで、**55 文字には絞らない**。
 * v1 から移行したコードも英数字 8 文字なので、公開ページの入口で想定外の値を落とさずに済む。
 */
const SHARE_CODE_SHAPE = new RegExp(`^[A-Za-z0-9]{${SHARE_CODE_LENGTH}}$`)

export function isShareCode(value: string): boolean {
  return SHARE_CODE_SHAPE.test(value)
}
