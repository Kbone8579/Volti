/**
 * Volti 서버 (Cloudflare Worker) — /api/* 요청만 여기로 와요.
 * 화면 파일(HTML · JS · 그림)은 Cloudflare 가 정적 파일로 바로 보내서 이 코드를 거치지 않아요 (무료 · 무제한).
 *
 * 하는 일: Google 로그인 · 로그인 유지(쿠키) · 악보 파일과 목록 · 설정을 계정에 저장해서 기기끼리 맞추기
 */
import type { Env } from './env'
import { assertSameOrigin, errorResponse, HttpError } from './http'
import { ensureSchema } from './schema'
import { deleteMe, finishGoogleLogin, getConfig, getMe, loginForDev, logout, startGoogleLogin } from './routes/auth'
import { deleteScore, getFile, getThumb, listScores, putFile, putScore, putThumb } from './routes/scores'
import { getSettings, putSettings } from './routes/settings'

type Handler = (env: Env, request: Request, ...params: string[]) => Response | Promise<Response>

/** [메서드, 주소 패턴, 처리] — :이름 자리는 그대로 인자로 넘어감 */
const ROUTES: [string, string, Handler][] = [
  ['POST', '/api/auth/dev', loginForDev],
  ['POST', '/api/auth/logout', logout],
  ['GET', '/api/me', getMe],
  ['DELETE', '/api/me', deleteMe],
  ['GET', '/api/scores', listScores],
  ['PUT', '/api/scores/:id', putScore],
  ['DELETE', '/api/scores/:id', deleteScore],
  ['PUT', '/api/scores/:id/files/:index', putFile],
  ['GET', '/api/scores/:id/files/:index', getFile],
  ['PUT', '/api/scores/:id/thumb', putThumb],
  ['GET', '/api/scores/:id/thumb', getThumb],
  ['GET', '/api/settings', getSettings],
  ['PUT', '/api/settings', putSettings],
]

const compiled = ROUTES.map(([method, pattern, handler]) => ({
  method,
  re: new RegExp(`^${pattern.replace(/:[a-z]+/g, '([^/]+)')}$`),
  handler,
}))

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    try {
      // 설정 확인은 DB 없이 (로그인 버튼을 보여 줄지 정하는 용도)
      if (url.pathname === '/api/config' && request.method === 'GET') return getConfig(env, request)
      // Google 로그인: 페이지 이동으로 오가므로 X-Volti 헤더가 없음 (state · nonce 쿠키로 확인)
      if (url.pathname === '/api/auth/google/start' && request.method === 'GET') return await startGoogleLogin(env, request)
      if (url.pathname === '/api/auth/google/callback' && request.method === 'POST') {
        await ensureSchema(env.DB)
        return await finishGoogleLogin(env, request)
      }
      assertSameOrigin(request)
      let pathMatched = false
      for (const r of compiled) {
        const m = r.re.exec(url.pathname)
        if (!m) continue
        pathMatched = true
        if (r.method !== request.method) continue
        await ensureSchema(env.DB)
        return await r.handler(env, request, ...m.slice(1).map(decodeURIComponent))
      }
      throw pathMatched ? new HttpError(405, 'method_not_allowed', '허용되지 않은 방식이에요.') : new HttpError(404, 'not_found', '없는 주소예요.')
    } catch (err) {
      return errorResponse(err)
    }
  },
} satisfies ExportedHandler<Env>
