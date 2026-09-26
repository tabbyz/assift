/**
 * MILP を LP 形式（CPLEX LP）の文字列に組む道具（012 §5.11）。HiGHS に文字列で渡す。
 *
 * ソルバーには依存しない（`solver/highs.ts` だけが HiGHS を知る）。変数は宣言しなければ連続 [0, +∞)。
 */

/** 線形式 `Σ coef·var + constant` */
export class Linear {
  readonly terms = new Map<string, number>()
  constant = 0

  add(name: string, coef = 1): this {
    const next = (this.terms.get(name) ?? 0) + coef
    if (next === 0) this.terms.delete(name)
    else this.terms.set(name, next)
    return this
  }

  addConstant(value: number): this {
    this.constant += value
    return this
  }

  plus(other: Linear, factor = 1): this {
    for (const [name, coef] of other.terms) this.add(name, coef * factor)
    this.constant += other.constant * factor
    return this
  }

  get size(): number {
    return this.terms.size
  }
}

export type Op = '<=' | '>=' | '='

type Row = { terms: [string, number][]; op: Op; rhs: number }

/** LP 形式の数値。係数に 1/m のような端数が出るので桁を丸める */
function num(value: number): string {
  return String(Number(value.toFixed(6)))
}

/** `+ 2 x1 - 0.5 x2`。1 行が長くなりすぎないよう 16 項ごとに改行する（LP 形式は継続行を許す） */
function formatTerms(terms: Iterable<[string, number]>): string {
  const parts: string[] = []
  let index = 0
  for (const [name, coef] of terms) {
    const sign = coef < 0 ? '-' : '+'
    const magnitude = Math.abs(coef)
    parts.push(`${index > 0 && index % 16 === 0 ? '\n  ' : ''}${sign} ${num(magnitude)} ${name}`)
    index++
  }
  return parts.join(' ')
}

export type ConstrainOptions = {
  /**
   * `<=` の右辺を 0 で止める（週上限・連勤など、既存だけで上限を超えている窓）。
   * 既存の違反はこの実行では直せないので、新しい行を足さない（= 変数 ≤ 0）ことで検証器と同じ意味にする
   */
  clamp?: boolean
}

export class LpBuilder {
  private readonly rows: Row[] = []
  private readonly binaries = new Set<string>()
  readonly objective = new Linear()
  /**
   * 変数を 1 つも含まないハード制約が定数だけで破れている（例: 「必ず」の指示の日がすでに別のシフトで埋まっている）。
   * LP 形式では書けないので、解く前にここで「解なし」と判断する
   */
  staticallyInfeasible = false

  binary(name: string): void {
    this.binaries.add(name)
  }

  /** `expr op rhs`。変数の無い式は書かない（定数だけで破れていれば staticallyInfeasible を立てる） */
  constrain(expr: Linear, op: Op, rhs: number, options: ConstrainOptions = {}): void {
    let bound = rhs - expr.constant
    if (options.clamp && op === '<=') bound = Math.max(0, bound)

    if (expr.size === 0) {
      const holds = op === '<=' ? 0 <= bound : op === '>=' ? 0 >= bound : bound === 0
      if (!holds && !options.clamp) this.staticallyInfeasible = true
      return
    }
    this.rows.push({ terms: [...expr.terms], op, rhs: bound })
  }

  get constraintCount(): number {
    return this.rows.length
  }

  get binaryCount(): number {
    return this.binaries.size
  }

  /**
   * LP 形式の文字列。`objective` を差し替えられる（2 段で解くとき、1 段目は不足だけを最小化する）。
   * `extra` は差し替えた目的関数と組で足す行（2 段目の「不足の合計 ≤ 1 段目の値」）
   */
  toLp(objective: Linear = this.objective, extra: Row[] = []): string {
    const lines: string[] = ['Minimize']
    // 目的関数が空だと LP 形式として読めないので、任意の 1 変数に 0 を掛けて置く
    const objTerms: [string, number][] =
      objective.size > 0 ? [...objective.terms] : [[this.anyVariable(), 0]]
    lines.push(` obj: ${formatTerms(objTerms)}`)
    lines.push('Subject To')
    ;[...this.rows, ...extra].forEach((row, index) => {
      lines.push(` r${index}: ${formatTerms(row.terms)} ${row.op} ${num(row.rhs)}`)
    })
    if (this.binaries.size > 0) {
      lines.push('Binary')
      const names = [...this.binaries]
      for (let i = 0; i < names.length; i += 16) lines.push(` ${names.slice(i, i + 16).join(' ')}`)
    }
    lines.push('End')
    return lines.join('\n')
  }

  private anyVariable(): string {
    const first = this.binaries.values().next().value ?? this.rows[0]?.terms[0]?.[0]
    if (!first) throw new Error('LpBuilder: 変数が 1 つも無いモデルは書けない')
    return first
  }
}

export function row(expr: Linear, op: Op, rhs: number): Row {
  return { terms: [...expr.terms], op, rhs: rhs - expr.constant }
}
