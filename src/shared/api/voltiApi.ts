/**
 * Volti 서버(/api) 호출 모음 — 로그인(features/account)과 동기화(features/sync)가 같이 씀. 서버 코드는 server/ 에 있고, 주고받는 모양은 @server/api-types.
 * - 쿠키(로그인 유지)는 브라우저가 알아서 붙임 (같은 주소)
 * - 데이터를 바꾸는 요청엔 X-Volti 헤더 (서버의 CSRF 막기와 짝)
 */
import type { ApiConfig, ApiScore, ApiScoreInput, ApiScoreList, ApiSettings, ApiUser } from '@server/api-types'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 인터넷이 끊겼거나 서버에 닿지 못함 */
export const isOffline = (err: unknown) => err instanceof ApiError && err.status === 0

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.method && init.method !== 'GET') headers.set('x-volti', '1')
  let res: Response
  try {
    res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'offline', '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.')
  }
  if (!res.ok) {
    let code = 'error'
    let message = `서버 오류 (${res.status})`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      code = body.error ?? code
      message = body.message ?? message
    } catch {
      // 본문이 JSON 이 아님 (서버가 없는 개발 환경 등)
      if (res.status === 404) code = 'no_server'
    }
    throw new ApiError(res.status, code, message)
  }
  return res
}

const getJson = async <T>(path: string) => (await call(path)).json() as Promise<T>
const sendJson = async <T>(method: string, path: string, body?: unknown) =>
  (await call(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).json() as Promise<T>

const enc = encodeURIComponent

export const api = {
  config: () => getJson<ApiConfig>('/api/config'),
  /** Google 로그인 페이지로 이동 (끝나면 지금 화면으로 ?login=ok|cancelled|error 를 붙여 돌아옴) */
  googleLoginUrl: (returnTo: string) => `/api/auth/google/start?return=${encodeURIComponent(returnTo)}`,
  /** 로그인 안 했으면 null */
  me: () => getJson<{ user: ApiUser | null }>('/api/me').then((r) => r.user),
  loginForDev: (email: string) => sendJson<{ user: ApiUser }>('POST', '/api/auth/dev', { email }).then((r) => r.user),
  logout: () => sendJson<{ ok: true }>('POST', '/api/auth/logout'),
  deleteAccount: () => sendJson<{ ok: true }>('DELETE', '/api/me'),

  listScores: () => getJson<ApiScoreList>('/api/scores'),
  putScore: (id: string, meta: ApiScoreInput) => sendJson<{ score: ApiScore; applied: boolean }>('PUT', `/api/scores/${enc(id)}`, meta),
  deleteScore: (id: string, at: number) => sendJson<{ ok: true; applied: boolean }>('DELETE', `/api/scores/${enc(id)}?at=${at}`),
  putFile: (id: string, index: number, file: File) =>
    call(`/api/scores/${enc(id)}/files/${index}`, {
      method: 'PUT',
      headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': enc(file.name) },
      body: file,
    }).then(() => undefined),
  getFile: async (id: string, index: number, fallbackName: string, createdAt: number): Promise<File> => {
    const res = await call(`/api/scores/${enc(id)}/files/${index}`)
    const name = res.headers.get('x-file-name')
    const blob = await res.blob()
    return new File([blob], name ? decodeURIComponent(name) : fallbackName, { type: blob.type, lastModified: createdAt })
  },
  putThumb: (id: string, thumb: Blob) =>
    call(`/api/scores/${enc(id)}/thumb`, { method: 'PUT', headers: { 'content-type': thumb.type || 'image/webp' }, body: thumb }).then(() => undefined),
  getThumb: async (id: string): Promise<Blob | null> => {
    try {
      return await (await call(`/api/scores/${enc(id)}/thumb`)).blob()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  getSettings: () => getJson<ApiSettings>('/api/settings'),
  putSettings: (s: ApiSettings) => sendJson<ApiSettings & { applied: boolean }>('PUT', '/api/settings', s),
}

export type VoltiApi = typeof api
