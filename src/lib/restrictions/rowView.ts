import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import type { Tables } from '@/types/database'
import { describeRestriction } from './describe'
import { RESTRICTION_KIND_LABELS } from './kinds'
import { lowerBoundWarning } from './warnings'

/** 一覧の 1 行（Server で組んで `RestrictionRows` に渡す） */
export type RestrictionRowView = {
  id: string
  href: string
  description: string
  /** 灰色の 2 行目（種類の名前） */
  kindLabel: string
  hard: boolean
  /** 明らかに守れない下限など（013 §3.5）。保存は止めていない */
  warning: string | null
}

type Options = {
  tenantId: string
  patternNames: ReadonlyMap<string, string>
  cycle: ShiftCycle
  /** 明らかに守れない下限の注意に使う（在籍スタッフ） */
  activeStaffs: readonly Pick<Tables<'staffs'>, 'id' | 'max_work_week' | 'available_wdays'>[]
  /** スタッフの編集画面から開くときは `staff`（保存後にそこへ戻る。013 §4.2） */
  from?: 'staff'
}

/** 制約の行を画面の 1 行にする（制約ページ・スタッフの編集画面で共有） */
export function toRestrictionRowView(
  restriction: Tables<'restrictions'>,
  { tenantId, patternNames, cycle, activeStaffs, from }: Options
): RestrictionRowView {
  const href = `/tenants/${tenantId}/settings/restrictions/${restriction.id}`
  return {
    id: restriction.id,
    href: from ? `${href}?from=${from}` : href,
    description: describeRestriction(restriction, patternNames, cycle),
    kindLabel: RESTRICTION_KIND_LABELS[restriction.kind],
    hard: restriction.hard,
    warning: lowerBoundWarning(restriction, activeStaffs),
  }
}
