import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { notFound } from 'next/navigation'
import { ActionError, GENERIC_ERROR_MESSAGE } from './error'
import { runAction } from './run'

describe('runAction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('成功は data を返し、ログに残さない', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runAction(async () => 1)).toEqual({ ok: true, data: 1 })
    expect(log).not.toHaveBeenCalled()
  })

  it('想定外の例外は汎用メッセージを返し、[action] を付けてログに残す', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('db down')
    const result = await runAction(async () => {
      throw error
    })
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR_MESSAGE })
    expect(log).toHaveBeenCalledWith('[action] 想定外のエラー', error)
  })

  it('ActionError はメッセージと code を返し、ログに残さない', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runAction(async () => {
      throw new ActionError('上限です', 'staff_limit')
    })
    expect(result).toEqual({ ok: false, error: '上限です', code: 'staff_limit' })
    expect(log).not.toHaveBeenCalled()
  })

  it('ZodError は先頭 issue のメッセージを返し、ログに残さない', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runAction(async () => z.string().min(1, '店舗名は入力必須です').parse(''))
    expect(result).toEqual({ ok: false, error: '店舗名は入力必須です' })
    expect(log).not.toHaveBeenCalled()
  })

  it('notFound() は再スローし、ログに残さない', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runAction(async () => notFound())).rejects.toThrow()
    expect(log).not.toHaveBeenCalled()
  })
})
