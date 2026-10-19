import { describe, expect, it } from 'vitest'
import { CONTACT_IMAGE_MAX_EDGE, CONTACT_IMAGE_MAX_OUTPUT_PIXELS } from '@/lib/validation/contact'
import { contactImageSize } from './scale'

describe('contactImageSize', () => {
  it('上限より小さい画像は大きくしない', () => {
    expect(contactImageSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('画素数の上限に収める（縦横比は保つ）', () => {
    const { width, height } = contactImageSize(4032, 3024)
    expect(width * height).toBeLessThanOrEqual(CONTACT_IMAGE_MAX_OUTPUT_PIXELS + width + height)
    expect(width / height).toBeCloseTo(4032 / 3024, 2)
  })

  it('縦に長いスクリーンショットも幅が残る（文字が読める）', () => {
    const { width, height } = contactImageSize(1170, 20000)
    expect(width).toBeGreaterThan(350)
    expect(height).toBeLessThanOrEqual(CONTACT_IMAGE_MAX_EDGE)
  })

  it('長い辺はキャンバスの上限に余裕を持たせる', () => {
    expect(Math.max(...Object.values(contactImageSize(1000, 100000)))).toBeLessThanOrEqual(
      CONTACT_IMAGE_MAX_EDGE
    )
  })

  it('細長い画像でも 1px 未満にしない', () => {
    expect(contactImageSize(2, 80000).width).toBe(1)
  })
})
