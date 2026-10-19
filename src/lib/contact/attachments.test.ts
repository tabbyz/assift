import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { CONTACT_IMAGE_MAX_BYTES } from '@/lib/validation/contact'
import { rewriteContactImages } from './attachments'

function image(width: number, height: number, alpha = false) {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 200, g: 100, b: 50 },
    },
  })
}

const file = (bytes: Buffer | string, name = 'x.png') =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name)

async function rewriteOne(bytes: Buffer | string, options?: { maxPixels?: number }) {
  const [out] = await rewriteContactImages([file(bytes)], options)
  return out
}

describe('rewriteContactImages', () => {
  it('PNG・JPEG・WebP を JPEG に書き出し直し、ファイル名はサーバーが決める', async () => {
    const inputs = await Promise.all([
      image(40, 30).png().toBuffer(),
      image(40, 30).jpeg().toBuffer(),
      image(40, 30).webp().toBuffer(),
    ])
    const out = await rewriteContactImages(inputs.map((b, i) => file(b, `元の名前${i}.png`)))
    expect(out.map((a) => a.filename)).toEqual(['image-1.jpg', 'image-2.jpg', 'image-3.jpg'])
    for (const a of out) {
      const meta = await sharp(a.content).metadata()
      expect(meta.format).toBe('jpeg')
      expect([meta.width, meta.height]).toEqual([40, 30])
    }
  })

  it('長い辺を 1,600px に縮める（小さい画像は大きくしない）', async () => {
    const out = await rewriteOne(await image(3200, 1000).png().toBuffer())
    const meta = await sharp(out.content).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 500])
  })

  it('EXIF（位置情報など）を落とす', async () => {
    const withExif = await image(20, 20)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret', ImageDescription: '35.6812,139.7671' } })
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()
    const out = await rewriteOne(withExif)
    expect((await sharp(out.content).metadata()).exif).toBeUndefined()
  })

  it('透過は白にする', async () => {
    const out = await rewriteOne(await image(4, 4, true).png().toBuffer())
    const { data } = await sharp(out.content).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(240)
  })

  it('SVG・GIF・画像でないもの・先頭だけ JPEG に見せたものは失敗', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    const gif = await image(10, 10).gif().toBuffer()
    const fakeJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('<?php echo 1; ?>'),
    ])
    for (const bytes of [svg, gif, 'hello', fakeJpeg]) {
      await expect(rewriteOne(bytes)).rejects.toThrow(
        '1枚目: この画像は添付できません。PNG・JPEG・WebP の画像を選んでください'
      )
    }
  })

  it('画素の上限を超える画像は「大きすぎる」で失敗（解凍爆弾）', async () => {
    const big = await image(200, 200).png().toBuffer()
    await expect(rewriteOne(big, { maxPixels: 100 * 100 })).rejects.toThrow(
      '1枚目: 画像が大きすぎて添付できません'
    )
  })

  it('4 枚以上・1 枚の大きさ・合計の上限で失敗', async () => {
    const small = await image(4, 4).png().toBuffer()
    await expect(rewriteContactImages([1, 2, 3, 4].map(() => file(small)))).rejects.toThrow(
      '画像は3枚まで、合計3.5MBまで添付できます。枚数を減らしてください'
    )
    const tooBig = Buffer.alloc(CONTACT_IMAGE_MAX_BYTES + 1)
    await expect(rewriteContactImages([file(tooBig)])).rejects.toThrow(
      '画像が大きすぎて添付できません'
    )
    const nearMax = Buffer.alloc(1.4 * 1024 * 1024)
    await expect(
      rewriteContactImages([file(nearMax), file(nearMax), file(nearMax)])
    ).rejects.toThrow('画像は3枚まで')
  })

  it('空のファイルは無視する（選ばれていない欄）', async () => {
    expect(await rewriteContactImages([file(Buffer.alloc(0))])).toEqual([])
  })
})
