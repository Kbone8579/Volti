/**
 * 동기화 실행 — syncPlan 이 정한 일을 실제로 함 (서버 호출 · 이 기기 저장소 쓰기).
 *
 * 서버(api)와 저장소(library)는 밖에서 넣어 줌 → 테스트에선 가짜 서버 · 가짜 저장소로 두 기기를 흉내 냄.
 * 한 악보에서 오류가 나도 나머지는 계속하고, 결과에 모아서 돌려줌.
 * 로그인이 풀렸거나(401) 인터넷이 끊기면 바로 멈추고 그 오류를 던짐 (화면에서 상태로 보여 줌).
 */
import type { ApiScore, ApiScoreInput } from '@server/api-types'
import { MAX_FILE_BYTES } from '@server/limits'
import { entryUpdatedAt, type LibraryEntry } from '@/features/library'
import type { Settings } from '@/features/settings'
import { ApiError, type VoltiApi } from '@/shared/api/voltiApi'
import { decideSettings, noteLocalSettings, readStamp, writeStamp } from './syncedSettings'
import { planSync, type SyncAction } from './syncPlan'

/** 동기화가 쓰는 이 기기 저장소 기능 (features/library/lib/libraryDb 와 같은 모양) */
export interface SyncLibrary {
  listScores(): Promise<LibraryEntry[]>
  listDeleted(): Promise<{ id: string; at: number }[]>
  getEntry(id: string): Promise<LibraryEntry | null>
  getScoreFiles(id: string): Promise<File[]>
  saveScore(entry: LibraryEntry, files: File[]): Promise<void>
  updateScore(id: string, patch: Partial<Pick<LibraryEntry, 'title' | 'lastPage' | 'openedAt' | 'thumb' | 'pageCount' | 'zoom' | 'updatedAt'>>): Promise<LibraryEntry | null>
  deleteScore(id: string, opts?: { record?: boolean; at?: number }): Promise<void>
  forgetDeleted(id: string): Promise<void>
  rekeyScore(fromId: string, toId: string): Promise<LibraryEntry | null>
}

export type SyncApi = Pick<VoltiApi, 'listScores' | 'putScore' | 'deleteScore' | 'putFile' | 'getFile' | 'putThumb' | 'getThumb'>

export interface SyncProgress {
  /** 파일까지 오가는 일 중 끝난 수 / 전체 */
  done: number
  total: number
}

export interface SyncResult {
  /** 이 기기에서 id 가 바뀐 악보 (열려 있던 악보를 따라가도록) */
  rekeyed: { from: string; to: string }[]
  /** 서버를 따라 이 기기에서 지운 악보 */
  removed: string[]
  downloaded: number
  uploaded: number
  /** 서버 공간이 모자라거나 파일이 너무 커서 못 올린 악보 수 (이 기기에만 있음) */
  skippedForQuota: number
  /** 그 밖의 이유로 실패한 악보 수 (다음 동기화 때 다시 시도) */
  failed: number
  /** 이 기기 라이브러리를 바꾼 횟수 (0 이면 목록을 다시 읽을 필요 없음) */
  localChanges: number
  usage: number
  quota: number
}

/** 이 오류면 동기화를 통째로 멈춤 */
const isFatal = (err: unknown) => err instanceof ApiError && (err.status === 0 || err.status === 401 || err.code === 'no_server')

function toInput(e: LibraryEntry, files: { type: string }[], hasThumb: boolean): ApiScoreInput {
  return {
    title: e.title,
    signature: e.signature,
    fileNames: e.fileNames,
    fileTypes: files.map((f) => f.type || 'application/octet-stream'),
    size: e.size,
    pageCount: e.pageCount,
    createdAt: e.createdAt,
    openedAt: e.openedAt,
    lastPage: e.lastPage,
    zoom: e.zoom ?? null,
    updatedAt: entryUpdatedAt(e),
    hasThumb,
  }
}

function fromRemote(r: ApiScore, thumb: Blob | null): LibraryEntry {
  return {
    id: r.id,
    title: r.title,
    signature: r.signature,
    fileNames: r.fileNames,
    size: r.size,
    pageCount: r.pageCount,
    createdAt: r.createdAt,
    openedAt: r.openedAt,
    lastPage: r.lastPage,
    zoom: r.zoom ?? undefined,
    thumb,
    updatedAt: r.updatedAt,
  }
}

export async function syncLibrary(
  deps: { api: SyncApi; library: SyncLibrary; onProgress?: (p: SyncProgress) => void; signal?: AbortSignal },
): Promise<SyncResult> {
  const { api, library, onProgress, signal } = deps
  const [list, local, deleted] = await Promise.all([api.listScores(), library.listScores(), library.listDeleted()])
  const remoteById = new Map(list.scores.map((r) => [r.id, r]))
  const actions = planSync(
    local.map((e) => ({ id: e.id, signature: e.signature, updatedAt: entryUpdatedAt(e) })),
    deleted,
    list.scores,
  )

  const result: SyncResult = { rekeyed: [], removed: [], downloaded: 0, uploaded: 0, skippedForQuota: 0, failed: 0, localChanges: 0, usage: list.usage, quota: list.quota }
  const heavy = actions.filter((a) => a.kind === 'download' || a.kind === 'upload').length
  let heavyDone = 0
  if (heavy) onProgress?.({ done: 0, total: heavy })
  const upload = async (id: string, remote: ApiScore | undefined) => {
    // 서버가 무료 한도에 닿아 올리기를 쉬는 중 → 보내지 않고 이 기기에만 둠
    if (list.uploadsPaused) {
      result.skippedForQuota++
      return
    }
    const entry = await library.getEntry(id)
    if (!entry) return // 그사이 지워짐 → 다음 동기화가 지운 기록으로 처리
    const files = await library.getScoreFiles(id)
    // 어차피 거절될 것은 미리 건너뜀 (큰 파일을 보내느라 데이터 · 시간을 쓰지 않게)
    const size = files.reduce((a, f) => a + f.size, 0)
    const replacing = remote && !remote.deleted ? remote.size : 0
    if (files.some((f) => f.size > MAX_FILE_BYTES) || result.usage - replacing + size > result.quota) {
      result.skippedForQuota++
      return
    }
    try {
      for (let i = 0; i < files.length; i++) await api.putFile(id, i, files[i])
      if (entry.thumb) await api.putThumb(id, entry.thumb)
      const { score } = await api.putScore(id, toInput(entry, files, !!entry.thumb))
      result.usage += score.size - (remote && !remote.deleted ? remote.size : 0)
      result.uploaded++
    } catch (err) {
      // 공간이 모자람 → 이 악보만 건너뜀 (더 작은 악보는 들어갈 수 있으니 계속)
      if (err instanceof ApiError && err.status === 413) {
        result.skippedForQuota++
        return
      }
      throw err
    }
  }

  const download = async (r: ApiScore) => {
    const files: File[] = []
    for (let i = 0; i < r.fileNames.length; i++) files.push(await api.getFile(r.id, i, r.fileNames[i], r.createdAt))
    const thumb = r.hasThumb ? await api.getThumb(r.id) : null
    // 받는 사이 이 기기에서 더 나중에 고쳤으면 덮어쓰지 않음
    const cur = await library.getEntry(r.id)
    if (cur && entryUpdatedAt(cur) > r.updatedAt) return
    await library.saveScore(fromRemote(r, thumb), files)
    result.downloaded++
    result.localChanges++
  }

  const run = async (a: SyncAction) => {
    switch (a.kind) {
      case 'rekey':
        if (await library.rekeyScore(a.from, a.to)) {
          result.rekeyed.push({ from: a.from, to: a.to })
          result.localChanges++
        }
        return
      case 'deleteLocal':
        await library.deleteScore(a.id, { record: false })
        result.removed.push(a.id)
        result.localChanges++
        return
      case 'deleteRemote':
        await api.deleteScore(a.id, a.at)
        await library.forgetDeleted(a.id)
        return
      case 'forgetDeleted':
        await library.forgetDeleted(a.id)
        return
      case 'pullMeta': {
        const r = remoteById.get(a.id)!
        const cur = await library.getEntry(a.id)
        if (!cur || entryUpdatedAt(cur) >= r.updatedAt) return
        const thumb = !cur.thumb && r.hasThumb ? await api.getThumb(a.id) : undefined
        await library.updateScore(a.id, {
          title: r.title,
          lastPage: r.lastPage,
          openedAt: r.openedAt,
          pageCount: r.pageCount,
          zoom: r.zoom ?? undefined,
          updatedAt: r.updatedAt,
          ...(thumb ? { thumb } : {}),
        })
        result.localChanges++
        return
      }
      case 'pushMeta': {
        const r = remoteById.get(a.id)!
        const entry = await library.getEntry(a.id)
        if (!entry) return
        if (entry.thumb && !r.hasThumb) await api.putThumb(a.id, entry.thumb)
        try {
          await api.putScore(a.id, toInput(entry, r.fileTypes.map((type) => ({ type })), !!entry.thumb || r.hasThumb))
        } catch (err) {
          // 서버에 파일이 없어진 경우 → 파일까지 다시 올림
          if (err instanceof ApiError && err.status === 409) await upload(a.id, r)
          else throw err
        }
        return
      }
      case 'download':
        await download(remoteById.get(a.id)!)
        onProgress?.({ done: ++heavyDone, total: heavy })
        return
      case 'upload':
        await upload(a.id, remoteById.get(a.id))
        onProgress?.({ done: ++heavyDone, total: heavy })
        return
    }
  }

  for (const a of actions) {
    if (signal?.aborted) break
    try {
      await run(a)
    } catch (err) {
      if (isFatal(err)) throw err
      console.warn('[sync]', a, err)
      result.failed++
      if (a.kind === 'download' || a.kind === 'upload') onProgress?.({ done: ++heavyDone, total: heavy })
    }
  }
  return result
}

/* ───────── 설정 ───────── */

export interface SettingsSyncDeps {
  api: Pick<VoltiApi, 'getSettings' | 'putSettings'>
  getSettings: () => Settings
  applyPatch: (patch: Partial<Settings>) => void
  now?: () => number
}

/** 설정 맞추기. 서버 값을 받아 적용했으면 'pulled', 올렸으면 'pushed' */
export async function syncSettings(deps: SettingsSyncDeps): Promise<'none' | 'pushed' | 'pulled'> {
  const { api, getSettings, applyPatch } = deps
  const now = deps.now?.() ?? Date.now()
  noteLocalSettings(getSettings(), now)
  const stamp = readStamp() ?? { json: '', at: 0 }
  const remote = await api.getSettings()
  const decision = decideSettings(getSettings(), stamp, remote, now)
  if (decision.kind === 'none') return 'none'
  if (decision.kind === 'pull') {
    writeStamp(decision.stamp)
    applyPatch(decision.patch)
    return 'pulled'
  }
  const saved = await api.putSettings(decision.body)
  if (!saved.applied) {
    // 그사이 다른 기기가 더 나중에 고침 → 그걸 따름
    const again = decideSettings(getSettings(), { ...stamp, at: decision.body.updatedAt }, saved, now)
    if (again.kind === 'pull') {
      writeStamp(again.stamp)
      applyPatch(again.patch)
      return 'pulled'
    }
  } else if (stamp.at === 0) {
    writeStamp({ ...stamp, at: decision.body.updatedAt })
  }
  return 'pushed'
}
