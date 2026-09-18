import { z } from 'zod'
import { isDateString } from '@/lib/calendar/dateString'

const DATE_ERROR = { error: '日付が正しくありません' }

/**
 * カレンダー日付（`YYYY-MM-DD`）。
 * `isDateString` が実在しない日付（`2026-02-30` など）も弾く（007 §5.5）。
 */
export const dateStringSchema = z.string(DATE_ERROR).refine(isDateString, DATE_ERROR)
