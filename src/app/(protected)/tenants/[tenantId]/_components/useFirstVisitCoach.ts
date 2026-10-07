'use client'

import { useState, useSyncExternalStore } from 'react'

/**
 * シフト表を初めて開いたときだけ出す「マスを押すと、勤務を入れられます」（014 §4.7）。
 * 店舗ごとに 1 回。見たかどうかは localStorage（この端末の便利機能。読めなければ出さない）
 */
const storageKey = (tenantId: string) => `assift-shift-coach:${tenantId}`

function hasSeen(tenantId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(tenantId)) !== null
  } catch {
    return true
  }
}

function markSeen(tenantId: string) {
  try {
    window.localStorage.setItem(storageKey(tenantId), '1')
  } catch {
    // 書けなくても、この表示のあいだは閉じたままにする（下の state）
  }
}

const subscribeNothing = () => () => {}

export function useFirstVisitCoach(tenantId: string) {
  // サーバーでは出さず（false）、ハイドレーションのあとに読む
  const unseen = useSyncExternalStore(
    subscribeNothing,
    () => !hasSeen(tenantId),
    () => false
  )
  const [finished, setFinished] = useState(false)

  return {
    active: unseen && !finished,
    finish: () => {
      markSeen(tenantId)
      setFinished(true)
    },
  }
}
