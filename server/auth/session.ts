/**
 * 로그인 상태 유지 — 로그인하면 무작위 토큰을 쿠키(HttpOnly)로 주고, DB 에는 그 해시만 저장.
 * 쿠키가 털려도 DB 에서 원래 토큰을 알 수 없고, 화면의 자바스크립트는 쿠키를 읽을 수 없음.
 */
import type { ApiUser } from '../api-types'
import type { Env } from '../env'
import { cookieHeader, HttpError, randomToken, readCookie, sha256 } from '../http'

export const SESSION_COOKIE = 'volti_session'
const SESSION_DAYS = 180
const DAY = 86_400_000

interface UserRow {
  id: string
  email: string
  name: string
  picture: string | null
}

export const toApiUser = (u: UserRow): ApiUser => ({ id: u.id, email: u.email, name: u.name, picture: u.picture })

/** Google(또는 개발용) 계정 → 사용자 행 (없으면 만들기) */
export async function upsertUser(env: Env, p: { sub: string; email: string; name: string; picture: string | null }, now = Date.now()): Promise<UserRow> {
  const found = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(p.sub).first<{ id: string }>()
  const id = found?.id ?? crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT(google_sub) DO UPDATE SET email = ?3, name = ?4, picture = ?5, last_login_at = ?6`,
  )
    .bind(id, p.sub, p.email, p.name, p.picture, now)
    .run()
  return { id, email: p.email, name: p.name, picture: p.picture }
}

/** 세션 만들고 Set-Cookie 헤더 값 돌려줌 */
export async function createSession(env: Env, userId: string, now = Date.now()): Promise<string> {
  const token = randomToken()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * DAY)
    .run()
  // 오래된 세션 정리 (가끔)
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run()
  return cookieHeader(SESSION_COOKIE, token, SESSION_DAYS * 86_400)
}

/** 요청의 쿠키로 로그인한 사용자 찾기 (없으면 null). 반 넘게 지난 세션은 기간을 늘림 */
export async function currentUser(env: Env, request: Request, now = Date.now()): Promise<UserRow | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const hash = await sha256(token)
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<UserRow & { expires_at: number }>()
  if (!row || row.expires_at < now) return null
  if (row.expires_at - now < (SESSION_DAYS / 2) * DAY) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_DAYS * DAY, hash).run()
  }
  return { id: row.id, email: row.email, name: row.name, picture: row.picture }
}

export async function requireUser(env: Env, request: Request): Promise<UserRow> {
  const user = await currentUser(env, request)
  if (!user) throw new HttpError(401, 'unauthorized', '로그인이 필요해요.')
  return user
}

export async function endSession(env: Env, request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  return cookieHeader(SESSION_COOKIE, '', 0)
}
