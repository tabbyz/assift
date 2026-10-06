import { Fragment } from 'react'
import classes from '../Site.module.css'

/**
 * 見出しを文節ごとに分けて、切れ目でだけ折り返す（016 §4.4）。
 * `|` が文節の切れ目、`\n` が改行（狭い画面では改行の代わりに文節で折り返す）。
 *
 * 例: `シフト表が早く作れる、\n4つのしくみ` / `3ステップで、|すぐ使える`
 */
export function Phrases({ children }: { children: string }) {
  const lines = children.split('\n')
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split('|').map((phrase, j) => (
        <span key={j} className={classes.nb}>
          {phrase}
        </span>
      ))}
    </Fragment>
  ))
}
