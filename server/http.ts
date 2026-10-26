import type { ApiError } from './api-types'

/** 화면에서 그대로 보여 줄 수 있는 오류 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.code, message: err.message } satisfies ApiError, { status: err.status })
  }
  console.error(err)
  return json({ error: 'server_error', message: '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.' } satisfies ApiError, { status: 500 })
}

export async function readJson<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > maxBytes) throw new HttpError(413, 'too_large', '보낸 데이터가 너무 커요.')
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'bad_json', '요청 형식이 올바르지 않아요.')
  }
}

/* ───────── 쿠키 ───────── */

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie')
  if (!raw) return null
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function cookieHeader(
  name: string,
  value: string,
  maxAgeSec: number,
  opts: { path?: string; sameSite?: 'Lax' | 'None' } = {},
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? '/'}`,
    'HttpOnly',
    'Secure',
    `SameSite=${opts.sameSite ?? 'Lax'}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ].join('; ')
}

/**
 * 다른 사이트가 사용자 몰래 요청을 보내지 못하게 (CSRF):
 * 데이터를 바꾸는 요청은 우리 화면만 붙이는 헤더(X-Volti)와 같은 출처(Origin)를 요구.
 */
export function assertSameOrigin(request: Request): void {
  if (request.method === 'GET' || request.method === 'HEAD') return
  if (request.headers.get('x-volti') !== '1') throw new HttpError(403, 'forbidden', '허용되지 않은 요청이에요.')
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'forbidden', '허용되지 않은 요청이에요.')
}

/* ───────── 작은 도구 ───────── */

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return b64url(new Uint8Array(digest))
}
