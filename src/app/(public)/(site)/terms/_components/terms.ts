/**
 * 規約に書く運営側の事実（016 §6。すべて決定済み）。ポリシー・特商法表記・エラー画面・課金の画面もここから引く。
 */
export const TERMS = {
  /** 運営者の名称 */
  operator: 'assift運営',
  /** 問い合わせ先 */
  contactEmail: 'support@assift.com',
  /** 制定日 / 最終更新日（リリース日。016 §6） */
  enactedOn: '2026年10月30日',
  updatedOn: '2026年10月30日',
  /** 第一審の専属的合意管轄（v1 の規約 第15条と同じ。016 §6） */
  court: '東京地方裁判所',
} as const
