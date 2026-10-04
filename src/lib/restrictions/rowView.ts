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
}

/** 制約の行を画面の 1 行にする（制約ページ） */
export function toRestrictionRowView(
  restriction: Tables<'restrictions'>,
  { tenantId, patternNames, cycle, activeStaffs }: Options
): RestrictionRowView {
  return {
    id: restriction.id,
    href: `/tenants/${tenantId}/settings/restrictions/${restriction.id}`,
    description: describeRestriction(restriction, patternNames, cycle),
    kindLabel: RESTRICTION_KIND_LABELS[restriction.kind],
    hard: restriction.hard,
    warning: lowerBoundWarning(restriction, activeStaffs),
  }
}
