import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { ZodType } from 'zod'
import {
  V1_EXPORT_TABLE_NAMES,
  V1_EXPORT_TABLES,
  v1ManifestSchema,
  type V1Export,
  type V1ExportTable,
} from './v1Types'

/**
 * `v1-export/<日時>/` の JSONL と manifest を読む（021 §6.1）。1 行ずつ Zod で検査し、形が違えばその場で止める
 * （どのファイルの何行目がどう違うかを出す）。
 *
 * 全行をメモリに載せる（重複の判定に全行が要る。§9.1-5）。
 */

export class ExportFormatError extends Error {}

export async function readJsonl<T>(path: string, schema: ZodType<T>): Promise<T[]> {
  const rows: T[] = []
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  let lineNo = 0
  for await (const line of lines) {
    lineNo++
    if (line.trim() === '') continue
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch {
      throw new ExportFormatError(`${path}:${lineNo}: JSON として読めません`)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ExportFormatError(
        `${path}:${lineNo}: ${issue.path.join('.')} ${issue.message}（${JSON.stringify(json).slice(0, 200)}）`
      )
    }
    rows.push(parsed.data)
  }
  return rows
}

export async function readExport(dir: string): Promise<V1Export> {
  const manifestJson = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const manifest = v1ManifestSchema.safeParse(manifestJson)
  if (!manifest.success) {
    throw new ExportFormatError(`manifest.json: ${manifest.error.issues[0].message}`)
  }

  const tables = {} as { [K in V1ExportTable]: V1Export[K] }
  for (const table of V1_EXPORT_TABLE_NAMES) {
    const schema: ZodType<V1Export[V1ExportTable][number]> = V1_EXPORT_TABLES[table]
    const rows = await readJsonl(join(dir, `${table}.jsonl`), schema)
    // manifest の件数と合わなければ、エクスポートが途中で止まっているか別のディレクトリ
    const expected = manifest.data.counts[table]
    if (expected !== undefined && expected !== rows.length) {
      throw new ExportFormatError(
        `${table}.jsonl: 行数 ${rows.length} が manifest の ${expected} と合いません`
      )
    }
    ;(tables as Record<string, unknown>)[table] = rows
  }

  return { manifest: manifest.data, ...tables }
}
