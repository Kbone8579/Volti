/**
 * Google 로그인 확인 — Google 이 돌려준 ID 토큰(JWT)이 진짜인지 검사.
 * Google 공개키로 서명을 확인하고, 우리 앱(클라이언트 ID)용인지 · 만료 안 됐는지 · 이메일 인증됐는지 ·
 * 우리가 로그인을 시작할 때 만든 일회용 값(nonce)이 맞는지 봄. (클라이언트 비밀키가 필요 없는 방식)
 */

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  picture: string | null
}

export interface GoogleJwk extends JsonWebKey {
  kid: string
}

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

let cached: { keys: GoogleJwk[]; until: number } | null = null

/** Google 공개키 (응답의 Cache-Control 만큼 기억) */
export async function fetchGoogleKeys(now = Date.now()): Promise<GoogleJwk[]> {
  if (cached && cached.until > now) return cached.keys
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error(`Google 공개키를 받지 못함 (${res.status})`)
  const { keys } = (await res.json()) as { keys: GoogleJwk[] }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600)
  cached = { keys, until: now + maxAge * 1000 }
  return keys
}

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const decodePart = <T>(s: string): T => JSON.parse(new TextDecoder().decode(fromB64url(s))) as T

export class InvalidTokenError extends Error {}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  opts: { now?: number; nonce?: string; getKeys?: () => Promise<GoogleJwk[]> } = {},
): Promise<GoogleProfile> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new InvalidTokenError('형식이 올바르지 않음')
  const [h, p, s] = parts
  let header: { alg?: string; kid?: string }
  let payload: Record<string, unknown>
  try {
    header = decodePart(h)
    payload = decodePart(p)
  } catch {
    throw new InvalidTokenError('읽을 수 없음')
  }
  if (header.alg !== 'RS256' || !header.kid) throw new InvalidTokenError('지원하지 않는 서명')

  const keys = await (opts.getKeys ?? fetchGoogleKeys)()
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new InvalidTokenError('알 수 없는 키')
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(s), new TextEncoder().encode(`${h}.${p}`))
  if (!ok) throw new InvalidTokenError('서명이 맞지 않음')

  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
  if (!ISSUERS.includes(String(payload.iss))) throw new InvalidTokenError('발급자가 Google 이 아님')
  if (payload.aud !== clientId) throw new InvalidTokenError('다른 앱용 토큰')
  if (typeof payload.exp !== 'number' || payload.exp < nowSec - 60) throw new InvalidTokenError('만료됨')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new InvalidTokenError('사용자 정보 없음')
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new InvalidTokenError('이메일 인증 안 됨')
  if (opts.nonce !== undefined && payload.nonce !== opts.nonce) throw new InvalidTokenError('이번 로그인용 토큰이 아님')

  return {
    sub: payload.sub,
    email: String(payload.email ?? ''),
    name: String(payload.name ?? payload.email ?? ''),
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  }
}
