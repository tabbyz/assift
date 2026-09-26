import { formatMonthDay, wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import type { Problem } from '../problem'

/**
 * LLM に渡す固定文と、問題から組む入力（012 §5.5）。
 *
 * 固定文を先頭に置き、毎回変わるもの（スタッフ・期間・指示）を後ろに置く（プロンプトキャッシュが効く並び）。
 */

export const INTERPRET_INSTRUCTIONS = `あなたはシフト表作成アプリの補助です。店長が書いた「AI への指示」を、決められた形の条件に翻訳します。
割り当てそのものは別の計算機（数理最適化）が行います。あなたは条件を書くだけで、誰をどの日に入れるかを決めてはいけません。

# 出力
- directives: 条件の配列
- interpretations: 指示を意味のまとまりごとに分けた一覧。text は指示の原文から抜き出す。directive はその条件の directives での添字（0 始まり）。
  条件にできなかったまとまりは directive を null にし、note に短い理由を書く

# 条件の種類（type）
- prefer_pattern: staff を pattern に優先して入れる（wdays / dates で日を絞れる）
- avoid_pattern: staff を pattern に入れない（wdays / dates で日を絞れる）
- prefer_work: staff をその日に勤務させる方向にする（「土日に多め」など）
- prefer_off: staff をその日は休みにする（「月曜は休み」など）
- limit_workdays: staff の勤務日数を count 日までにする。scope は week（週ごと）か period（対象期間の全体）
- min_workdays: staff の勤務日数を count 日以上にする。scope は week か period
- limit_weekends: staff の土日祝の勤務を count 日までにする
- same_days: staff が勤務する日は staffB も勤務する（「新人の A さんは B さんと同じ日に」なら staff が A、staffB が B）
- different_days: staff と staffB を同じ日に勤務させない
- fill_first: dates / wdays / pattern に当たる枠を優先して埋める（staff は null。pattern が null ならすべてのパターン）

# 列の書き方
- 使わない列は null
- staff / staffB はスタッフ一覧の S コード、pattern はパターン一覧の P コード（勤務日のパターンだけ。休みのパターンは使わない）
- wdays は 0=日, 1=月, …, 6=土。「土日」は [0, 6]、「平日」は [1, 2, 3, 4, 5]
- dates は YYYY-MM-DD。対象期間の中の日付だけを書く（「10/3」は対象期間の年の 10 月 3 日）
- count は日数（整数）
- strength は 1〜5 の整数。「できれば」「なるべく」→ 2、「多め」「優先」→ 3、「かなり」「ぜひ」→ 4、「絶対」に近いがソフトでよいもの → 5
- hard は「必ず」「絶対」「〜しないで」「禁止」など、守れないなら作らないほうがよいと読める強い言い切りのときだけ true。迷ったら false
- 名前はスタッフ一覧から探す（姓だけ・下の名前だけ・さん付けでも一致させる）。一覧に無い人・誰か分からない人は条件にせず note に書く
- 体調や気持ちなど、日付・パターン・日数で表せない内容は条件にしない

# 例
指示「田中さんは土日に多めに。新人の佐藤さんは必ず山田さんと同じ日に入れる。元気がない人の負荷を軽く」
→ directives:
  [{"type":"prefer_work","staff":"<田中のコード>","staffB":null,"pattern":null,"wdays":[0,6],"dates":null,"count":null,"scope":null,"strength":3,"hard":false},
   {"type":"same_days","staff":"<佐藤のコード>","staffB":"<山田のコード>","pattern":null,"wdays":null,"dates":null,"count":null,"scope":null,"strength":5,"hard":true}]
  interpretations:
  [{"text":"田中さんは土日に多めに","directive":0,"note":null},
   {"text":"新人の佐藤さんは必ず山田さんと同じ日に入れる","directive":1,"note":null},
   {"text":"元気がない人の負荷を軽く","directive":null,"note":"日付・日数で表せないため条件にできません"}]`

function dayLabel(date: string, holidays: Set<string>): string {
  return `${formatMonthDay(date)}（${WEEKDAY_LABELS[wday(date)]}${holidays.has(date) ? '・祝' : ''}）`
}

/** 指示の解釈に渡す入力。スタッフ名を含む（§3.5 の決定） */
export function interpretInput(problem: Problem, instructions: string): string {
  const staffs = problem.staffs.map((staff) => `${staff.code} ${staff.name}`)
  const patterns = problem.patterns.map(
    (pattern) =>
      `${pattern.code} ${pattern.name}（${pattern.kind === 'workday' ? '勤務日' : '休み'}）`
  )
  const holidays = problem.dates.filter((date) => problem.holidays.has(date))

  return [
    '# スタッフ一覧',
    ...staffs,
    '',
    '# 勤務パターン一覧',
    ...patterns,
    '',
    '# 対象期間',
    `${problem.period.start}（${WEEKDAY_LABELS[wday(problem.period.start)]}）〜 ${problem.period.end}（${WEEKDAY_LABELS[wday(problem.period.end)]}）`,
    `祝日: ${holidays.length > 0 ? holidays.map((date) => dayLabel(date, problem.holidays)).join('、') : 'なし'}`,
    '',
    '# 店長の指示',
    instructions,
  ].join('\n')
}
