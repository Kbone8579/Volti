/**
 * 악보 동기화 API
 *
 *   GET    /api/scores                       내 악보 목록 (지운 기록 포함) + 사용량
 *   PUT    /api/scores/:id/files/:index      원본 파일 하나 올리기 (본문 = 파일 그대로)
 *   GET    /api/scores/:id/files/:index      원본 파일 받기
 *   PUT    /api/scores/:id/thumb             썸네일 올리기
 *   GET    /api/scores/:id/thumb             썸네일 받기
 *   PUT    /api/scores/:id                   악보 정보 올리기 (파일을 먼저 다 올린 뒤)
 *   DELETE /api/scores/:id?at=시각           지우기 (다른 기기도 지우도록 기록은 남김)
 *
 * 파일은 R2 의 u/<사용자>/<악보>/f0, f1 … , thumb 에 저장.
 * 기기마다 고친 시각(updatedAt)이 다르면 더 나중 것을 씀.
 * R2 를 쓸 때마다 freeGuard 로 횟수 · 공간을 세서 무료 한도 전에 멈춤 (요금이 나가지 않게).
 */
import type { ApiScore, ApiScoreInput, ApiScoreList, ApiZoom } from '../api-types'
import { requireUser } from '../auth/session'
import type { Env } from '../env'
import { assertStorage, spendOps, uploadsPaused } from '../freeGuard'
import { HttpError, json, readJson } from '../http'
import { MAX_FILE_BYTES, MAX_FILES, MAX_THUMB_BYTES, MB } from '../limits'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

interface ScoreRow {
  id: string
  title: string
  signature: string
  file_names: string
  file_types: string
  size: number
  page_count: number
  created_at: number
  opened_at: number
  last_page: number
  zoom: string | null
  has_thumb: number
  updated_at: number
  deleted: number
}

const parseZoom = (z: string | null): ApiZoom => (z === null ? null : z === 'width' ? 'width' : Number.isFinite(Number(z)) ? Number(z) : null)

export const toApiScore = (r: ScoreRow): ApiScore => ({
  id: r.id,
  title: r.title,
  signature: r.signature,
  fileNames: JSON.parse(r.file_names) as string[],
  fileTypes: JSON.parse(r.file_types) as string[],
  size: r.size,
  pageCount: r.page_count,
  createdAt: r.created_at,
  openedAt: r.opened_at,
  lastPage: r.last_page,
  zoom: parseZoom(r.zoom),
  hasThumb: !!r.has_thumb,
  updatedAt: r.updated_at,
  deleted: !!r.deleted,
})

const prefix = (userId: string, id: string) => `u/${userId}/${id}/`
const fileKey = (userId: string, id: string, i: number) => `${prefix(userId, id)}f${i}`
const thumbKey = (userId: string, id: string) => `${prefix(userId, id)}thumb`

export const quotaOf = (env: Env) => Math.max(1, Number(env.USER_QUOTA_MB ?? 500) || 500) * MB

async function usageOf(env: Env, userId: string, exceptId?: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM scores WHERE user_id = ? AND deleted = 0 AND id != ?')
    .bind(userId, exceptId ?? '')
    .first<{ used: number }>()
  return row?.used ?? 0
}

function checkId(id: string): string {
  if (!ID_RE.test(id)) throw new HttpError(400, 'bad_id', '악보 id 가 올바르지 않아요.')
  return id
}

async function getRow(env: Env, userId: string, id: string) {
  return env.DB.prepare('SELECT * FROM scores WHERE user_id = ? AND id = ?').bind(userId, id).first<ScoreRow>()
}

/* ───────── 목록 ───────── */

export async function listScores(env: Env, request: Request): Promise<Response> {
  const user = await requireUser(env, request)
  const { results } = await env.DB.prepare('SELECT * FROM scores WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all<ScoreRow>()
  return json({
    scores: results.map(toApiScore),
    usage: await usageOf(env, user.id),
    quota: quotaOf(env),
    uploadsPaused: await uploadsPaused(env),
  } satisfies ApiScoreList)
}

/* ───────── 파일 ───────── */

export async function putFile(env: Env, request: Request, rawId: string, rawIndex: string): Promise<Response> {
  const user = await requireUser(env, request)
  const id = checkId(rawId)
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0 || index >= MAX_FILES) throw new HttpError(400, 'bad_index', '파일 번호가 올바르지 않아요.')
  const len = Number(request.headers.get('content-length'))
  if (!request.body || !Number.isFinite(len) || len <= 0) throw new HttpError(411, 'length_required', '파일 크기를 알 수 없어요.')
  if (len > MAX_FILE_BYTES) throw new HttpError(413, 'file_too_large', `파일 하나가 너무 커요 (최대 ${MAX_FILE_BYTES / MB}MB).`)
  if ((await usageOf(env, user.id, id)) + len > quotaOf(env)) {
    throw new HttpError(413, 'quota_exceeded', `서버 저장 공간(${quotaOf(env) / MB}MB)이 가득 찼어요.`)
  }
  await assertStorage(env, len)
  await spendOps(env, { a: 1 }, { status: 413 })
  const name = decodeURIComponent(request.headers.get('x-file-name') ?? `file${index}`).slice(0, 300)
  await env.FILES.put(fileKey(user.id, id, index), request.body, {
    httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
    customMetadata: { name },
  })
  return json({ ok: true })
}

async function sendObject(obj: R2ObjectBody | null): Promise<Response> {
  if (!obj) throw new HttpError(404, 'not_found', '파일이 서버에 없어요.')
  const headers = new Headers({ 'cache-control': 'private, no-store' })
  headers.set('content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
  if (obj.customMetadata?.name) headers.set('x-file-name', encodeURIComponent(obj.customMetadata.name))
  headers.set('content-length', String(obj.size))
  return new Response(obj.body, { headers })
}

export async function getFile(env: Env, request: Request, rawId: string, rawIndex: string): Promise<Response> {
  const user = await requireUser(env, request)
  await spendOps(env, { b: 1 })
  return sendObject(await env.FILES.get(fileKey(user.id, checkId(rawId), Number(rawIndex))))
}

export async function putThumb(env: Env, request: Request, rawId: string): Promise<Response> {
  const user = await requireUser(env, request)
  const id = checkId(rawId)
  const len = Number(request.headers.get('content-length'))
  if (!request.body || !Number.isFinite(len) || len <= 0) throw new HttpError(411, 'length_required', '파일 크기를 알 수 없어요.')
  if (len > MAX_THUMB_BYTES) throw new HttpError(413, 'file_too_large', '썸네일이 너무 커요.')
  await spendOps(env, { a: 1 }, { status: 413 })
  await env.FILES.put(thumbKey(user.id, id), request.body, { httpMetadata: { contentType: request.headers.get('content-type') || 'image/webp' } })
  return json({ ok: true })
}

export async function getThumb(env: Env, request: Request, rawId: string): Promise<Response> {
  const user = await requireUser(env, request)
  await spendOps(env, { b: 1 })
  return sendObject(await env.FILES.get(thumbKey(user.id, checkId(rawId))))
}

/* ───────── 악보 정보 ───────── */

function validateInput(b: ApiScoreInput): void {
  const bad = (what: string) => {
    throw new HttpError(400, 'bad_request', `악보 정보가 올바르지 않아요 (${what}).`)
  }
  if (typeof b.title !== 'string' || b.title.length > 300) bad('제목')
  if (typeof b.signature !== 'string' || b.signature.length > 20_000) bad('서명')
  if (!Array.isArray(b.fileNames) || b.fileNames.length === 0 || b.fileNames.length > MAX_FILES) bad('파일 목록')
  if (!Array.isArray(b.fileTypes) || b.fileTypes.length !== b.fileNames.length) bad('파일 종류')
  for (const k of ['pageCount', 'createdAt', 'openedAt', 'lastPage', 'updatedAt'] as const) if (typeof b[k] !== 'number' || !Number.isFinite(b[k])) bad(k)
  if (!(b.zoom === null || b.zoom === 'width' || (typeof b.zoom === 'number' && Number.isFinite(b.zoom)))) bad('배율')
}

export async function putScore(env: Env, request: Request, rawId: string): Promise<Response> {
  const user = await requireUser(env, request)
  const id = checkId(rawId)
  const body = await readJson<ApiScoreInput>(request)
  validateInput(body)
  const cur = await getRow(env, user.id, id)

  // 서버 쪽이 더 나중에 바뀌었으면 그대로 두고 서버 것을 돌려줌
  if (cur && cur.updated_at > body.updatedAt) return json({ score: toApiScore(cur), applied: false })

  let size = cur?.size ?? 0
  let hasThumb = !!cur?.has_thumb
  const sameFiles = cur && !cur.deleted && cur.signature === body.signature
  if (!sameFiles) {
    // 새 악보(또는 파일이 바뀐 악보): 파일이 다 올라왔는지 확인하고 실제 크기를 셈
    await spendOps(env, { b: body.fileNames.length + 1 }, { status: 413 })
    const heads = await Promise.all(body.fileNames.map((_, i) => env.FILES.head(fileKey(user.id, id, i))))
    const missing = heads.flatMap((h, i) => (h ? [] : [i]))
    if (missing.length) throw new HttpError(409, 'files_missing', `파일 ${missing.length}개가 아직 서버에 없어요.`)
    size = heads.reduce((a, h) => a + (h?.size ?? 0), 0)
    if ((await usageOf(env, user.id, id)) + size > quotaOf(env)) {
      if (!cur) await deletePrefix(env, prefix(user.id, id)) // 올려 둔 파일이 자리만 차지하지 않게
      throw new HttpError(413, 'quota_exceeded', `서버 저장 공간(${quotaOf(env) / MB}MB)이 가득 찼어요.`)
    }
    hasThumb = !!(await env.FILES.head(thumbKey(user.id, id)))
  } else if (body.hasThumb && !hasThumb) {
    await spendOps(env, { b: 1 }, { status: 413 })
    hasThumb = !!(await env.FILES.head(thumbKey(user.id, id)))
  }

  const zoom = body.zoom === null ? null : String(body.zoom)
  await env.DB.prepare(
    `INSERT INTO scores (user_id, id, title, signature, file_names, file_types, size, page_count, created_at, opened_at, last_page, zoom, has_thumb, updated_at, deleted)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0)
     ON CONFLICT(user_id, id) DO UPDATE SET title = ?3, signature = ?4, file_names = ?5, file_types = ?6, size = ?7, page_count = ?8,
       created_at = ?9, opened_at = ?10, last_page = ?11, zoom = ?12, has_thumb = ?13, updated_at = ?14, deleted = 0`,
  )
    .bind(
      user.id,
      id,
      body.title,
      body.signature,
      JSON.stringify(body.fileNames),
      JSON.stringify(body.fileTypes),
      size,
      body.pageCount,
      body.createdAt,
      body.openedAt,
      body.lastPage,
      zoom,
      hasThumb ? 1 : 0,
      body.updatedAt,
    )
    .run()
  return json({ score: toApiScore((await getRow(env, user.id, id))!), applied: true })
}

/** 지우기: 파일은 지우고, 다른 기기에서도 지우도록 「지운 기록」만 남김 */
export async function deleteScore(env: Env, request: Request, rawId: string): Promise<Response> {
  const user = await requireUser(env, request)
  const id = checkId(rawId)
  const at = Number(new URL(request.url).searchParams.get('at') ?? Date.now())
  const cur = await getRow(env, user.id, id)
  if (!cur) {
    // 목록엔 없지만 올리다 만 파일이 남아 있을 수 있음 → 정리
    await deletePrefix(env, prefix(user.id, id))
    return json({ ok: true, applied: false })
  }
  // 지운 뒤에 다른 기기에서 더 나중에 고쳤으면 지우지 않음
  if (cur.updated_at > at) return json({ ok: true, applied: false, score: toApiScore(cur) })
  // 다른 기기도 지우도록 「지운 기록」(악보 번호 · 지운 시각)만 남기고, 제목 · 파일 이름 같은 내용은 비움
  await env.DB.prepare(
    `UPDATE scores SET deleted = 1, title = '', signature = '', file_names = '[]', file_types = '[]', size = 0, page_count = 0,
       last_page = 0, zoom = NULL, has_thumb = 0, updated_at = ? WHERE user_id = ? AND id = ?`,
  )
    .bind(at, user.id, id)
    .run()
  await deletePrefix(env, prefix(user.id, id))
  return json({ ok: true, applied: true })
}

async function deletePrefix(env: Env, p: string): Promise<void> {
  let cursor: string | undefined
  do {
    // 지우기는 공간을 줄이는 일이라 한도에 닿아도 막지 않고 세기만 (목록 = 쓰기 1번, 지우기는 무료)
    await spendOps(env, { a: 1 }, { force: true })
    const page = await env.FILES.list({ prefix: p, cursor })
    if (page.objects.length) await env.FILES.delete(page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}

export function deleteAllUserFiles(env: Env, userId: string): Promise<void> {
  return deletePrefix(env, `u/${userId}/`)
}
