import { describe, expect, it } from 'vitest'
import { removeInstructionSpan } from './instructions'

describe('removeInstructionSpan', () => {
  it('原文の部分と、あとに続く句点・改行を取り除く', () => {
    expect(
      removeInstructionSpan(
        '田中さんは土日に多めに。青木さんは今月入れない。新人の佐藤さんは山田さんと同じ日に',
        '青木さんは今月入れない'
      )
    ).toBe('田中さんは土日に多めに。新人の佐藤さんは山田さんと同じ日に')
    expect(
      removeInstructionSpan('青木さんは今月入れない\n田中さんは土日多め', '青木さんは今月入れない')
    ).toBe('田中さんは土日多め')
  })

  it('末尾の指示を消したら、前の読点も残さない', () => {
    expect(
      removeInstructionSpan('田中さんは土日多め、青木さんは今月入れない', '青木さんは今月入れない')
    ).toBe('田中さんは土日多め')
  })

  it('指示が 1 つだけなら空になる', () => {
    expect(removeInstructionSpan('青木さんは今月入れない。', '青木さんは今月入れない')).toBe('')
  })

  it('原文がそのまま見つからない・空なら本文は変えない', () => {
    expect(removeInstructionSpan('青木さんは今月お休み', '青木さんは今月入れない')).toBe(
      '青木さんは今月お休み'
    )
    expect(removeInstructionSpan('青木さんは今月お休み', '  ')).toBe('青木さんは今月お休み')
  })
})
