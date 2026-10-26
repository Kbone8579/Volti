import { describe, expect, it } from 'vitest'
import { InvalidTokenError, verifyGoogleIdToken, type GoogleJwk } from './google'

const CLIENT = 'test-client.apps.googleusercontent.com'
const NOW = 1_800_000_000_000

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)))

async function makeKey(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid } as GoogleJwk
  const sign = async (payload: object, header: object = { alg: 'RS256', kid, typ: 'JWT' }) => {
    const data = `${enc(header)}.${enc(payload)}`
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data)))
    return `${data}.${b64url(sig)}`
  }
  return { jwk, sign }
}

const good = {
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  sub: '1234567890',
  email: 'player@example.com',
  email_verified: true,
  name: '연주자',
  picture: 'https://lh3.googleusercontent.com/a/x',
  exp: NOW / 1000 + 3600,
}

describe('Google 로그인 토큰 확인', () => {
  it('진짜 토큰이면 사용자 정보, 위조 · 다른 앱 · 만료 · 미인증은 거절', async () => {
    const k = await makeKey('k1')
    const other = await makeKey('k1') // 같은 kid 를 흉내낸 다른 키 (위조)
    const opts = { now: NOW, getKeys: async () => [k.jwk] }

    const p = await verifyGoogleIdToken(await k.sign(good), CLIENT, opts)
    expect(p).toEqual({ sub: '1234567890', email: 'player@example.com', name: '연주자', picture: good.picture })

    const reject = async (token: string) => {
      await expect(verifyGoogleIdToken(token, CLIENT, opts)).rejects.toBeInstanceOf(InvalidTokenError)
    }
    await reject(await other.sign(good)) // 서명 위조
    await reject(await k.sign({ ...good, aud: 'someone-else' })) // 다른 앱용
    await reject(await k.sign({ ...good, iss: 'https://evil.example' }))
    await reject(await k.sign({ ...good, exp: NOW / 1000 - 600 })) // 만료
    await reject(await k.sign({ ...good, email_verified: false }))
    await reject(await k.sign(good, { alg: 'none', kid: 'k1' }))
    await reject(await k.sign(good, { alg: 'RS256', kid: 'unknown' }))
    await reject('not.a.jwt')
    // 내용을 바꾸면 서명이 안 맞음
    const [h, , s] = (await k.sign(good)).split('.')
    await reject(`${h}.${enc({ ...good, sub: 'attacker' })}.${s}`)
  })

  it('로그인을 시작할 때 만든 nonce 와 다르면 거절 (가로챈 토큰 재사용 막기)', async () => {
    const k = await makeKey('k1')
    const opts = { now: NOW, getKeys: async () => [k.jwk] }
    const token = await k.sign({ ...good, nonce: 'n-123' })
    await expect(verifyGoogleIdToken(token, CLIENT, { ...opts, nonce: 'n-123' })).resolves.toMatchObject({ sub: '1234567890' })
    await expect(verifyGoogleIdToken(token, CLIENT, { ...opts, nonce: 'n-other' })).rejects.toBeInstanceOf(InvalidTokenError)
    await expect(verifyGoogleIdToken(await k.sign(good), CLIENT, { ...opts, nonce: 'n-123' })).rejects.toBeInstanceOf(InvalidTokenError)
  })
})
