/** 一括操作の種類（v1 `ShiftsController#fixed` / `#unfixed` / `#clear`）。メニューはこの順で並ぶ */
export const BULK_KINDS = ['fix', 'unfix', 'clear'] as const

export type BulkKind = (typeof BULK_KINDS)[number]

type BulkCopy = {
  /** メニュー項目と確認ダイアログの見出し */
  title: string
  /** 確認ダイアログの本文。スタッフ単位のときは名前が頭に付く（v1 と同じ） */
  confirm: (staffName?: string) => string
  success: string
  /** 対象が 1 行も無かったときの文言（緑の成功で流さない。008 §10.11） */
  nothing: string
}

/**
 * 一括操作の文言（v1 の `data-confirm` と `notice` をそのまま移植）。
 * ツールメニュー（全体）とスタッフ名メニュー（スタッフ単位）が同じ定義を使う。
 *
 * v1 のクリアは「この週の下書きシフトを…」だったが、周期は 1 か月・半月・2 週間もあるので
 * 「この期間の」に直した（008 §4）。
 */
export const BULK_COPY: Record<BulkKind, BulkCopy> = {
  fix: {
    title: 'すべて確定シフトにする',
    confirm: (staffName) =>
      staffName
        ? `${staffName} のシフトをすべて「確定シフト」にします。よろしいですか？`
        : 'この期間のシフトをすべて「確定シフト」にします。よろしいですか？',
    success: 'シフトを確定しました',
    nothing: '確定するシフトがありませんでした',
  },
  unfix: {
    title: 'すべて下書きに戻す',
    confirm: (staffName) =>
      staffName
        ? `${staffName} のシフトをすべて「下書きシフト」に戻します。よろしいですか？`
        : 'この期間のシフトをすべて「下書き」に戻します。よろしいですか？',
    success: 'シフトを下書きに戻しました',
    nothing: '下書きに戻すシフトがありませんでした',
  },
  clear: {
    title: '下書きシフトをクリア',
    confirm: (staffName) =>
      staffName
        ? `${staffName} の下書きシフトをクリアしますか？ ※確定されたシフトはクリアされません。`
        : 'この期間の下書きシフトをクリアしますか？ ※確定されたシフトはクリアされません。',
    success: '下書きシフトをクリアしました',
    nothing: 'クリアする下書きシフトがありませんでした',
  },
}
