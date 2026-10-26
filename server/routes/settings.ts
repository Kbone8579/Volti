import type { ApiSettings } from '../api-types'
import { requireUser } from '../auth/session'
import type { Env } from '../env'
import { HttpError, json, readJson } from '../http'

/** 기기끼리 같이 쓰는 설정 (화면이 정한 항목만 들어옴). 더 나중에 바뀐 쪽이 이김 */
export async function getSettings(env: Env, request: Request): Promise<Response> {
  const user = await requireUser(env, request)
  const row = await env.DB.prepare('SELECT data, updated_at FROM settings WHERE user_id = ?').bind(user.id).first<{ data: string; updated_at: number }>()
  return json((row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 }) satisfies ApiSettings)
}

export async function putSettings(env: Env, request: Request): Promise<Response> {
  const user = await requireUser(env, request)
  const body = await readJson<ApiSettings>(request, 900_000)
  if (!body.data || typeof body.data !== 'object' || typeof body.updatedAt !== 'number') throw new HttpError(400, 'bad_request', '설정 형식이 올바르지 않아요.')
  const cur = await env.DB.prepare('SELECT data, updated_at FROM settings WHERE user_id = ?').bind(user.id).first<{ data: string; updated_at: number }>()
  if (cur && cur.updated_at > body.updatedAt) {
    return json({ data: JSON.parse(cur.data), updatedAt: cur.updated_at, applied: false })
  }
  await env.DB.prepare(
    `INSERT INTO settings (user_id, data, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3`,
  )
    .bind(user.id, JSON.stringify(body.data), body.updatedAt)
    .run()
  return json({ data: body.data, updatedAt: body.updatedAt, applied: true })
}
