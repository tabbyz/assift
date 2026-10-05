import { STAFF_NAME_MAX_LENGTH } from '@/lib/validation/staffs'

/** 初期設定で 1 回に入れられる人数（014 §5.4） */
export const SETUP_STAFFS_MAX = 100

/**
 * 区切り: 改行・タブ（Excel の行をコピーしたとき）・読点・カンマ。
 * **空白では区切らない**（「山田 花子」を 2 人にしない）
 */
const SEPARATOR = /\r\n|[\n\r\t、,，]/

export type StaffNameError = { line: number; name: string }
export type StaffNameDuplicate = { name: string; lines: number[] }

export type ParsedStaffNames = {
  /** 作る名前（入力の順。同じ名前も両方残す） */
  names: string[]
  /** 10 文字を超える名前。1 つでもあれば進めない */
  errors: StaffNameError[]
  /** 同じ名前。注意を出すだけで止めない（設定画面も DB も同名を許している。014 §4.3） */
  duplicates: StaffNameDuplicate[]
  /** 上限（100 人）を超えている */
  tooMany: boolean
}

/**
 * 貼り付けた名前を分ける。`line` は区切りで分けたあとの何番目か（空の項目を飛ばした 1 始まり）。
 * 全角空白も `trim()` で落ちる（JavaScript の空白には U+3000 が含まれる）。
 */
export function parseStaffNames(text: string): ParsedStaffNames {
  const names = text
    .split(SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value !== '')

  const errors: StaffNameError[] = []
  const linesByName = new Map<string, number[]>()
  names.forEach((name, index) => {
    const line = index + 1
    // サーバーの `staffNameSchema`（Zod の `.max` = UTF-16 の長さ）と同じ数え方にする。食い違うと画面は通るのに保存で落ちる
    if (name.length > STAFF_NAME_MAX_LENGTH) errors.push({ line, name })
    linesByName.set(name, [...(linesByName.get(name) ?? []), line])
  })

  const duplicates = [...linesByName]
    .filter(([, lines]) => lines.length > 1)
    .map(([name, lines]) => ({ name, lines }))

  return { names, errors, duplicates, tooMany: names.length > SETUP_STAFFS_MAX }
}
