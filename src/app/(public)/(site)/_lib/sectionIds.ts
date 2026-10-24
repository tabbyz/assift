/**
 * LP の節の id。Server（節）と Client（デモのボタン）の両方から引くので、'use client' の無いここに置く
 * （'use client' のファイルから定数を import すると、Server 側には値ではなくクライアント参照が届く）
 */

/** 「スタッフの画面」の節（`StaffView`）。デモの共有カードの「スタッフの画面を見る」がここへ送る */
export const STAFF_VIEW_ID = 'staff-view'
