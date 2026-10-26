/**
 * 테스트용 가짜 서버 — server/routes 와 같은 규칙(나중에 고친 것이 이김 · 지운 기록 · 파일 확인 · 용량)을 메모리에서 흉내 냄.
 * syncEngine 테스트에서 두 기기가 같은 서버를 쓰는 상황을 만들 때 씀. 앱 코드에서는 쓰지 않아요.
 */
import type { ApiScore, ApiScoreInput, ApiSettings } from '@server/api-types'
import { ApiError, type VoltiApi } from '@/shared/api/voltiApi'

export type FakeApi = Pick<VoltiApi, 'listScores' | 'putScore' | 'deleteScore' | 'putFile' | 'getFile' | 'putThumb' | 'getThumb' | 'getSettings' | 'putSettings'>

export class FakeServer {
  rows = new Map<string, ApiScore>()
  files = new Map<string, File>()
  thumbs = new Map<string, Blob>()
  settings: ApiSettings = { data: null, updatedAt: 0 }
  quota = 500 * 1024 * 1024
  offline = false
  /** 서버 무료 한도에 닿아 올리기를 쉬는 중 */
  uploadsPaused = false
  /** 호출 기록 ("putFile a/0" 처럼) */
  log: string[] = []

  private usage(exceptId = '') {
    let n = 0
    for (const r of this.rows.values()) if (!r.deleted && r.id !== exceptId) n += r.size
    return n
  }

  private dropFiles(id: string) {
    for (const k of [...this.files.keys()]) if (k.startsWith(`${id}/`)) this.files.delete(k)
    this.thumbs.delete(id)
  }

  private gate(what: string) {
    if (this.offline) throw new ApiError(0, 'offline', '서버에 연결할 수 없어요.')
    this.log.push(what)
  }

  api(): FakeApi {
    return {
      listScores: async () => {
        this.gate('listScores')
        return { scores: [...this.rows.values()].map((r) => ({ ...r })), usage: this.usage(), quota: this.quota, uploadsPaused: this.uploadsPaused }
      },
      putFile: async (id, index, file) => {
        this.gate(`putFile ${id}/${index}`)
        if (this.uploadsPaused) throw new ApiError(413, 'server_full', '무료 한도')
        if (this.usage(id) + file.size > this.quota) throw new ApiError(413, 'quota_exceeded', '가득 참')
        this.files.set(`${id}/${index}`, file)
      },
      getFile: async (id, index, fallbackName, createdAt) => {
        this.gate(`getFile ${id}/${index}`)
        const f = this.files.get(`${id}/${index}`)
        if (!f) throw new ApiError(404, 'not_found', '없음')
        return new File([f], f.name || fallbackName, { type: f.type, lastModified: createdAt })
      },
      putThumb: async (id, thumb) => {
        this.gate(`putThumb ${id}`)
        this.thumbs.set(id, thumb)
      },
      getThumb: async (id) => {
        this.gate(`getThumb ${id}`)
        return this.thumbs.get(id) ?? null
      },
      putScore: async (id, body: ApiScoreInput) => {
        this.gate(`putScore ${id}`)
        const cur = this.rows.get(id)
        if (cur && cur.updatedAt > body.updatedAt) return { score: { ...cur }, applied: false }
        let size = cur?.size ?? 0
        let hasThumb = cur?.hasThumb ?? false
        if (!(cur && !cur.deleted && cur.signature === body.signature)) {
          const files = body.fileNames.map((_, i) => this.files.get(`${id}/${i}`))
          if (files.some((f) => !f)) throw new ApiError(409, 'files_missing', '파일 없음')
          size = files.reduce((a, f) => a + f!.size, 0)
          if (this.usage(id) + size > this.quota) {
            if (!cur) this.dropFiles(id)
            throw new ApiError(413, 'quota_exceeded', '가득 참')
          }
          hasThumb = this.thumbs.has(id)
        } else if (body.hasThumb && !hasThumb) hasThumb = this.thumbs.has(id)
        const { hasThumb: _ignored, ...rest } = body
        const score: ApiScore = { ...rest, id, size, hasThumb, deleted: false }
        this.rows.set(id, score)
        return { score: { ...score }, applied: true }
      },
      deleteScore: async (id, at) => {
        this.gate(`deleteScore ${id}`)
        const cur = this.rows.get(id)
        if (!cur) {
          this.dropFiles(id)
          return { ok: true, applied: false }
        }
        if (cur.updatedAt > at) return { ok: true, applied: false }
        this.rows.set(id, { ...cur, deleted: true, title: '', signature: '', fileNames: [], fileTypes: [], size: 0, pageCount: 0, lastPage: 0, zoom: null, hasThumb: false, updatedAt: at })
        this.dropFiles(id)
        return { ok: true, applied: true }
      },
      getSettings: async () => {
        this.gate('getSettings')
        return { ...this.settings }
      },
      putSettings: async (s) => {
        this.gate('putSettings')
        if (this.settings.data && this.settings.updatedAt > s.updatedAt) return { ...this.settings, applied: false }
        this.settings = { data: s.data, updatedAt: s.updatedAt }
        return { ...this.settings, applied: true }
      },
    }
  }
}
