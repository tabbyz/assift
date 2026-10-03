import { addDays, datesBetween, wday } from '@/lib/calendar/dateString'
import {
  allWeeks,
  fullWeeks,
  isWeekendOrHoliday,
  isWorkday,
  restrictionStaffs,
  type PlanRow,
  type Problem,
  type ProblemStaff,
  type Restriction,
} from './problem'
import { restrictionLabel, stateOf, type PlanState } from './validate'

/**
 * 守れなかった制約（013 §5.6）。純関数。
 *
 * 対象は**ソフトとして解いた制約だけ**: なるべくの制約と、必須の週の最低勤務日数（その週に入れる日数が足りない・
 * 解が無くて緩めた、のどちらかでソフトになりうる）。必須の上限は検証器（validate.ts）が守っているので数えない。
 * 数え方は指示の `evaluateDirective()` と同じく、既存のシフトと計画を合わせた表で数える。
 * **見る範囲は model.ts がソフト項を立てる範囲と揃える**（期間の前日からペアの着地日まで・着地日を含む週）。
 * 狭いと、ソルバーが違反を払って置いた行（例: 前日の遅番 → 初日の早番）を報告から落とす。
 */

export type RestrictionOutcome = {
  restrictionId: string
  /** `restrictionLabel`（スタッフ別は名前入り） */
  label: string
  /** 設定上の強さ（必須を緩めて解いたものは true のまま） */
  hard: boolean
  /** 「週最少 2日」「長澤 咲 水曜に 2日」など。店舗全体の規則は守れなかった人ごとに名前を付けて並べる */
  detail: string
}

/** 店舗全体の規則で、守れなかった人を何人まで名前で並べるか */
const MAX_NAMED_STAFFS = 3

export function restrictionOutcomes(problem: Problem, plan: PlanRow[]): RestrictionOutcome[] {
  const state = stateOf(problem, plan)
  const windows = {
    /** 前日の行と初日の行の組み合わせ・金曜の土日まで（model.ts の `pairStart`〜着地日） */
    pairDays: datesBetween(addDays(problem.period.start, -1), problem.landingDate),
    /** 着地日を含む週（model.ts の H5 / 週の上限と同じ） */
    weeks: allWeeks(problem, [...problem.dates, problem.landingDate]),
    fullWeeks: fullWeeks(problem),
  }
  const outcomes: RestrictionOutcome[] = []

  for (const restriction of problem.restrictions) {
    if (restriction.hard && restriction.kind !== 'min_work_week') continue

    const broken: { staff: ProblemStaff; detail: string }[] = []
    for (const staff of restrictionStaffs(problem, restriction)) {
      const detail = violation(problem, state, windows, restriction, staff.id)
      if (detail !== null) broken.push({ staff, detail })
    }
    if (broken.length === 0) continue

    const named = broken.slice(0, MAX_NAMED_STAFFS)
    const detail =
      restriction.staffId !== null
        ? broken[0].detail
        : [
            ...named.map(({ staff, detail }) => `${staff.name} ${detail}`),
            ...(broken.length > named.length ? [`ほか ${broken.length - named.length} 人`] : []),
          ].join(' · ')
    outcomes.push({
      restrictionId: restriction.id,
      label: restrictionLabel(problem, restriction),
      hard: restriction.hard,
      detail,
    })
  }

  return outcomes
}

/** 1 人ぶんの違反。守れていれば null */
function violation(
  problem: Problem,
  state: PlanState,
  windows: { pairDays: string[]; weeks: string[][]; fullWeeks: string[][] },
  restriction: Restriction,
  staffId: string
): string | null {
  const occupant = (date: string) => state.occupant(staffId, date)
  const works = (date: string) => isWorkday(problem, occupant(date))

  switch (restriction.kind) {
    case 'min_work_week': {
      const counts = windows.fullWeeks.map((week) => week.filter(works).length)
      if (counts.length === 0) return null
      const least = Math.min(...counts)
      return least < restriction.days ? `週最少 ${least}日` : null
    }
    case 'max_weekend_days': {
      const count = problem.dates.filter(
        (date) => isWeekendOrHoliday(problem, date) && works(date)
      ).length
      return count > restriction.days ? `土日祝 ${count}日` : null
    }
    case 'prefer_dayoff_wdays': {
      const wdays = new Set(restriction.wdays)
      const count = problem.dates.filter((date) => wdays.has(wday(date)) && works(date)).length
      return count > 0 ? `${count}日入っています` : null
    }
    case 'max_work_week': {
      const most = Math.max(
        ...windows.weeks.map(
          (week) => week.filter((date) => occupant(date) === restriction.patternId).length
        )
      )
      return most > restriction.days ? `週最大 ${most}日` : null
    }
    case 'max_work_consecutive': {
      const matches = (date: string) =>
        restriction.patternId === null ? works(date) : occupant(date) === restriction.patternId
      // 期間の日を 1 つでも含む並びだけを見る（前後 days 日まで辿れば足りる）
      let longest = 0
      let run = 0
      for (const date of datesBetween(
        addDays(problem.period.start, -restriction.days),
        addDays(problem.landingDate, restriction.days)
      )) {
        run = matches(date) ? run + 1 : 0
        longest = Math.max(longest, run)
      }
      return longest > restriction.days ? `最長 ${longest}日連続` : null
    }
    case 'deny_pattern_pair': {
      const count = windows.pairDays.filter(
        (date) =>
          occupant(date) === restriction.pattern1Id &&
          occupant(addDays(date, 1)) === restriction.pattern2Id
      ).length
      return count > 0 ? `${count}回` : null
    }
    case 'sat_or_sun_dayoff': {
      const count = windows.pairDays.filter(
        (date) => wday(date) === 6 && works(date) && works(addDays(date, 1))
      ).length
      return count > 0 ? `${count}回` : null
    }
  }
}
