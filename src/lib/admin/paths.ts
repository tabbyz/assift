/**
 * 運営者の管理画面のパス（020 §4.1）。管理画面のホスト（admin.assift.com）でも rewrite しないので、
 * `<Link>`・`redirect()`・`revalidatePath()` のどれもこの 1 系統を使う。素の文字列を書かない。
 *
 * 先頭の `/-` は意味を持たない区切り（GitLab の `/-/` と同じ）。本体の機能のパスとぶつからない
 */
export const ADMIN_ROOT = '/-'
export const ADMIN_LOGIN_PATH = `${ADMIN_ROOT}/login`
export const ADMIN_USERS_PATH = `${ADMIN_ROOT}/users`

export function adminUserPath(userId: string): string {
  return `${ADMIN_USERS_PATH}/${userId}`
}

/** 管理画面のパスか。`/-foo` は含めない */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_ROOT || pathname.startsWith(`${ADMIN_ROOT}/`)
}
