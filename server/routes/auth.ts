/**
 * 로그인 · 로그아웃 · 내 계정
 *
 * Google 로그인은 「페이지 이동」 방식 (OpenID Connect, id_token + form_post):
 *   1) 화면이 /api/auth/google/start 로 이동 → 일회용 값(state · nonce)을 짧은 쿠키에 넣고 Google 로그인 페이지로 보냄
 *   2) 사용자가 계정을 고르면 Google 이 /api/auth/google/callback 으로 id_token 을 POST
 *   3) state · nonce · 서명을 확인하고 로그인 쿠키를 준 뒤 원래 화면으로 돌려보냄
 * 팝업이나 Google 스크립트가 없어서 태블릿 「홈 화면에 추가」 앱에서도 똑같이 동작해요. 클라이언트 비밀키도 필요 없어요.
 */
import type { ApiConfig, ApiUser } from '../api-types'
import { InvalidTokenError, verifyGoogleIdToken } from '../auth/google'
import { createSession, currentUser, endSession, requireUser, toApiUser, upsertUser } from '../auth/session'
import type { Env } from '../env'
import { cookieHeader, HttpError, json, randomToken, readCookie, readJson, secure } from '../http'
import { deleteAllUserFiles } from './scores'

const OAUTH_COOKIE = 'volti_oauth'
const OAUTH_PATH = '/api/auth/google'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

/** 개발용 로그인은 내 컴퓨터(localhost)에서 .dev.vars 로 켰을 때만 */
const devLoginAllowed = (env: Env, request: Request) => {
  const host = new URL(request.url).hostname
  return env.DEV_LOGIN === '1' && (host === 'localhost' || host === '127.0.0.1')
}

export function getConfig(env: Env, request: Request): Response {
  return json({ google: !!env.GOOGLE_CLIENT_ID, devLogin: devLoginAllowed(env, request) } satisfies ApiConfig)
}

/** 로그인 뒤 돌아갈 곳: 우리 사이트 안의 경로만 (다른 사이트로 보내는 데 악용 못 하게) */
const safeReturn = (raw: string | null) => (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/')

/** 원래 화면으로 돌려보내면서 결과를 ?login= 으로 알려 줌 */
function backTo(request: Request, path: string, result: 'ok' | 'cancelled' | 'error', cookies: string[]): Response {
  const url = new URL(path, new URL(request.url).origin)
  url.searchParams.set('login', result)
  const headers = secure(new Headers({ location: url.pathname + url.search + url.hash, 'cache-control': 'no-store' }))
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 303, headers })
}

/** 1) Google 로그인 페이지로 보내기 */
export async function startGoogleLogin(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const back = safeReturn(url.searchParams.get('return'))
  if (!env.GOOGLE_CLIENT_ID) return backTo(request, back, 'error', [])
  const state = randomToken(16)
  const nonce = randomToken(16)
  const auth = new URL(GOOGLE_AUTH_URL)
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}${OAUTH_PATH}/callback`,
    response_type: 'id_token',
    response_mode: 'form_post',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  }).toString()
  // Google 이 다른 사이트에서 POST 로 돌아오므로 SameSite=None (로그인 쿠키가 아니라 10분짜리 일회용 확인값)
  const cookie = cookieHeader(OAUTH_COOKIE, JSON.stringify({ state, nonce, back }), 600, { path: OAUTH_PATH, sameSite: 'None' })
  return new Response(null, { status: 302, headers: secure(new Headers({ location: auth.toString(), 'set-cookie': cookie, 'cache-control': 'no-store' })) })
}

/** 2) Google 이 돌아옴 → 확인 → 로그인 쿠키 */
export async function finishGoogleLogin(env: Env, request: Request): Promise<Response> {
  const clear = cookieHeader(OAUTH_COOKIE, '', 0, { path: OAUTH_PATH, sameSite: 'None' })
  let saved: { state?: string; nonce?: string; back?: string } = {}
  try {
    saved = JSON.parse(readCookie(request, OAUTH_COOKIE) ?? '{}')
  } catch {
    // 쿠키가 깨짐 → 아래에서 거절
  }
  const back = safeReturn(saved.back ?? null)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return backTo(request, back, 'error', [clear])
  }
  if (form.get('error')) return backTo(request, back, 'cancelled', [clear])

  const idToken = form.get('id_token')
  const state = form.get('state')
  if (!env.GOOGLE_CLIENT_ID || !saved.state || !saved.nonce || typeof idToken !== 'string' || state !== saved.state) {
    return backTo(request, back, 'error', [clear])
  }
  try {
    const profile = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, { nonce: saved.nonce })
    const user = await upsertUser(env, profile)
    return backTo(request, back, 'ok', [clear, await createSession(env, user.id)])
  } catch (err) {
    // 화면으로 돌아가야 하므로 어떤 오류든 JSON 대신 되돌려 보냄
    if (!(err instanceof InvalidTokenError)) console.error(err)
    return backTo(request, back, 'error', [clear])
  }
}

/** 개발용: Google 없이 이메일만으로 로그인 (localhost + DEV_LOGIN=1 일 때만) */
export async function loginForDev(env: Env, request: Request): Promise<Response> {
  if (!devLoginAllowed(env, request)) throw new HttpError(404, 'not_found', '없는 주소예요.')
  const { email = 'dev@localhost', name } = await readJson<{ email?: string; name?: string }>(request)
  const user = await upsertUser(env, { sub: `dev:${email}`, email, name: name ?? email.split('@')[0], picture: null })
  return json({ user: toApiUser(user) }, { headers: { 'set-cookie': await createSession(env, user.id) } })
}

export async function logout(env: Env, request: Request): Promise<Response> {
  return json({ ok: true }, { headers: { 'set-cookie': await endSession(env, request) } })
}

/** 지금 로그인한 사람 (안 했으면 user: null — 오류가 아니라서 브라우저 콘솔에 빨간 줄이 안 생김) */
export async function getMe(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request)
  return json({ user: user ? (toApiUser(user) satisfies ApiUser) : null })
}

/** 계정 삭제: 서버에 있는 이 사람의 모든 것(파일 · 목록 · 설정 · 세션 · 계정)을 지움. 기기 안의 악보는 그대로 */
export async function deleteMe(env: Env, request: Request): Promise<Response> {
  const user = await requireUser(env, request)
  await deleteAllUserFiles(env, user.id)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scores WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM settings WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ])
  return json({ ok: true }, { headers: { 'set-cookie': await endSession(env, request) } })
}
