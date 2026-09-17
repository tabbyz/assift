export type SearchParamValue = string | string[] | undefined

/** page の searchParams の値を 1 つの文字列に丸める（同じキーが複数あれば先頭） */
export function firstString(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
