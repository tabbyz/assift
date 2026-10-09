import { createLoader, parseAsInteger, parseAsString } from 'nuqs/server'

/** ユーザー一覧の検索語（メールの部分一致）とページ（020 §8） */
export const adminUsersParsers = {
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
}

export const loadAdminUsersSearchParams = createLoader(adminUsersParsers)
