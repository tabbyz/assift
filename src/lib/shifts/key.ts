/** シフト表のセル 1 つ（Server の page が読んだ行と、Client の楽観更新が共有する形） */
export type ShiftCell = {
  staffId: string
  date: string
  patternId: string
  fixed: boolean
}

/** `staffId:date` をキーにしたセルの集合。表のセルは Map から 1 回の参照で引く */
export type ShiftMap = Map<string, ShiftCell>

export function cellKey(staffId: string, date: string): string {
  return `${staffId}:${date}`
}

export function toShiftMap(cells: ShiftCell[]): ShiftMap {
  return new Map(cells.map((cell) => [cellKey(cell.staffId, cell.date), cell]))
}
