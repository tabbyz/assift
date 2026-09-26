/**
 * 「この指示を外して作り直す」の本文の書き換え（012 §11.3）。純関数。
 *
 * 外した指示の原文（解釈の `text`。LLM が原文から抜き出した部分）を本文から取り除く。
 * 次に「別の案を作る」で本文を書き換えて解釈し直しても、外した指示が戻らないようにするため。
 * **原文がそのまま見つからなければ本文は変えない**（LLM が言い換えていた場合。推測で削らない）。
 */

/** 指示のあとに続く区切り（取り除く指示と一緒に消す） */
const TRAILING_SEPARATORS = /^[。．.、,，!！?？]*[ \t　]*\r?\n?/

export function removeInstructionSpan(instructions: string, span: string): string {
  const target = span.trim()
  if (!target) return instructions
  const at = instructions.indexOf(target)
  if (at < 0) return instructions

  const after = instructions.slice(at + target.length).replace(TRAILING_SEPARATORS, '')
  // 末尾の指示を消したら、前の指示のあとの読点も残さない（「A、B」→「A」）
  const before = after.trim()
    ? instructions.slice(0, at)
    : instructions.slice(0, at).replace(/[、,，\s　]+$/, '')
  return (before + after)
    .replace(/[ \t　]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
