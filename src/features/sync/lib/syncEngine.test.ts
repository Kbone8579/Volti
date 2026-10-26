// 두 기기(태블릿 A · 노트북 B)가 한 서버로 맞춰지는지 — 진짜 라이브러리 코드(IndexedDB 흉내) + 가짜 서버
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings'
import { FakeServer } from './fakeServer'
import { syncLibrary, syncSettings, type SyncLibrary } from './syncEngine'

type LibraryModule = typeof import('@/features/library/lib/libraryDb')

class MemoryStorage {
  private m = new Map<string, string>()
  getItem = (k: string) => this.m.get(k) ?? null
  setItem = (k: string, v: string) => void this.m.set(k, String(v))
  removeItem = (k: string) => void this.m.delete(k)
}

interface Device {
  db: LibraryModule
  storage: MemoryStorage
  settings: Settings
}

let clock = 1_000
let server: FakeServer

/** 기기마다 따로인 IndexedDB · localStorage 를 가진 라이브러리 모듈 */
async function makeDevice(): Promise<Device> {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  const db: LibraryModule = await import('@/features/library/lib/libraryDb')
  await db.listScores() // 이 기기의 IndexedDB 로 연결을 열어 둠
  return { db, storage: new MemoryStorage(), settings: structuredClone(DEFAULT_SETTINGS) }
}

/** 그 기기에서 하는 일 (localStorage 를 그 기기 것으로) */
async function on<T>(d: Device, fn: () => Promise<T>): Promise<T> {
  ;(globalThis as { localStorage?: unknown }).localStorage = d.storage
  return fn()
}

const sync = (d: Device) => on(d, () => syncLibrary({ api: server.api(), library: d.db as SyncLibrary }))
const syncSet = (d: Device) =>
  on(d, () =>
    syncSettings({
      api: server.api(),
      getSettings: () => d.settings,
      applyPatch: (p) => (d.settings = { ...d.settings, ...p }),
    }),
  )

const pdf = (name: string, text: string) => new File([text], name, { type: 'application/pdf' })
const thumb = () => new Blob(['thumb'], { type: 'image/webp' })
const tick = (ms = 1000) => (clock += ms)

let A: Device
let B: Device

beforeEach(async () => {
  clock = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  server = new FakeServer()
  A = await makeDevice()
  B = await makeDevice()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('악보 동기화', () => {
  it('A 에서 넣은 악보가 B 로 파일 · 썸네일까지 그대로 옴', async () => {
    const e = await A.db.addScore([pdf('moon.pdf', 'MOON'), pdf('moon-2.pdf', 'P2')], { title: '월광', pageCount: 3, thumb: thumb() })
    tick()
    const ra = await sync(A)
    expect(ra.uploaded).toBe(1)
    expect(server.rows.get(e.id)).toMatchObject({ title: '월광', size: 6, hasThumb: true, fileTypes: ['application/pdf', 'application/pdf'] })

    const rb = await sync(B)
    expect(rb.downloaded).toBe(1)
    const got = await B.db.getEntry(e.id)
    expect(got).toMatchObject({ title: '월광', pageCount: 3, fileNames: ['moon.pdf', 'moon-2.pdf'], updatedAt: e.updatedAt })
    expect(await got!.thumb!.text()).toBe('thumb')
    const files = await B.db.getScoreFiles(e.id)
    expect(await Promise.all(files.map((f) => f.text()))).toEqual(['MOON', 'P2'])
    expect(files.map((f) => f.name)).toEqual(['moon.pdf', 'moon-2.pdf'])

    // 다시 맞춰도 할 일 없음 (파일을 또 오가지 않음)
    server.log = []
    await sync(A)
    await sync(B)
    expect(server.log).toEqual(['listScores', 'listScores'])
  })

  it('보던 쪽 · 배율 · 이름 바꾸기가 나중에 고친 쪽으로 맞춰짐', async () => {
    const e = await A.db.addScore([pdf('a.pdf', 'A')], { title: '소나타', pageCount: 9, thumb: null })
    await sync(A)
    await sync(B)

    tick()
    await A.db.updateScore(e.id, { lastPage: 4 })
    await sync(A)
    await sync(B)
    expect((await B.db.getEntry(e.id))?.lastPage).toBe(4)

    tick()
    await B.db.updateScore(e.id, { zoom: 1.5, title: '소나타 1악장' })
    await sync(B)
    server.log = []
    await sync(A)
    expect(await A.db.getEntry(e.id)).toMatchObject({ zoom: 1.5, title: '소나타 1악장', lastPage: 4 })
    expect(server.log.some((l) => l.startsWith('getFile'))).toBe(false) // 정보만 받고 파일은 그대로

    // 동시에 고치면 더 나중에 고친 쪽이 이김
    tick()
    await A.db.updateScore(e.id, { lastPage: 7 })
    tick()
    await B.db.updateScore(e.id, { lastPage: 2 })
    await sync(A)
    await sync(B)
    await sync(A)
    expect((await A.db.getEntry(e.id))?.lastPage).toBe(2)
    expect((await B.db.getEntry(e.id))?.lastPage).toBe(2)
  })

  it('A 에서 지우면 B 에서도 지워짐', async () => {
    const e = await A.db.addScore([pdf('a.pdf', 'A')], { title: '지울 악보', pageCount: 1, thumb: null })
    await sync(A)
    await sync(B)
    tick()
    await A.db.deleteScore(e.id)
    await sync(A)
    expect(server.rows.get(e.id)).toMatchObject({ deleted: true, title: '', fileNames: [] }) // 기록만 남고 내용은 비움
    expect(server.files.size).toBe(0)
    expect(await A.db.listDeleted()).toEqual([]) // 서버에 전했으니 기록 정리

    const rb = await sync(B)
    expect(rb.removed).toEqual([e.id])
    expect(await B.db.getEntry(e.id)).toBeNull()
    expect(await B.db.listDeleted()).toEqual([]) // 따라 지운 건 기록을 안 남김
  })

  it('지운 뒤에 다른 기기에서 더 나중에 고쳤으면 되살림', async () => {
    const e = await A.db.addScore([pdf('a.pdf', 'A')], { title: '연습곡', pageCount: 2, thumb: null })
    await sync(A)
    await sync(B)
    tick()
    await A.db.deleteScore(e.id)
    tick()
    await B.db.updateScore(e.id, { lastPage: 1 }) // B 는 아직 지운 걸 모르고 계속 연습
    await sync(A)
    const rb = await sync(B)
    expect(rb.uploaded).toBe(1)
    expect(server.rows.get(e.id)).toMatchObject({ deleted: false, lastPage: 1 })
    const ra = await sync(A)
    expect(ra.downloaded).toBe(1)
    expect((await A.db.getEntry(e.id))?.lastPage).toBe(1)
  })

  it('두 기기에서 같은 파일을 따로 넣었으면(샘플 악보 등) 하나로 합침', async () => {
    const a = await A.db.addScore([pdf('sample.pdf', 'SAMPLE')], { title: '샘플', pageCount: 1, thumb: null })
    const b = await B.db.addScore([pdf('sample.pdf', 'SAMPLE')], { title: '샘플', pageCount: 1, thumb: null })
    expect(a.id).not.toBe(b.id)
    await sync(A)
    server.log = []
    const rb = await sync(B)
    expect(rb.rekeyed).toEqual([{ from: b.id, to: a.id }])
    expect(server.log.some((l) => l.startsWith('putFile'))).toBe(false) // 같은 파일을 또 올리지 않음
    expect((await B.db.listScores()).map((x) => x.id)).toEqual([a.id])
    expect([...server.rows.keys()]).toEqual([a.id])
    expect(await B.db.listDeleted()).toEqual([])
  })

  it('서버 공간이 차면 그 악보만 건너뛰고, 이 기기에는 그대로 남음', async () => {
    server.quota = 10
    await A.db.addScore([pdf('small.pdf', '12345')], { title: '작은 것', pageCount: 1, thumb: null })
    tick()
    const big = await A.db.addScore([pdf('big.pdf', '1234567890AB')], { title: '큰 것', pageCount: 1, thumb: null })
    const r = await sync(A)
    expect(r.uploaded).toBe(1)
    expect(r.skippedForQuota).toBe(1)
    expect(server.rows.has(big.id)).toBe(false)
    expect([...server.files.keys()].some((k) => k.startsWith(big.id))).toBe(false)
    expect(await A.db.getEntry(big.id)).not.toBeNull()
  })

  it('서버가 무료 한도에 닿으면 올리기는 쉬고(파일을 보내지도 않음) 받기는 계속', async () => {
    const fromA = await A.db.addScore([pdf('a.pdf', 'A')], { title: '이미 있던 악보', pageCount: 1, thumb: null })
    await sync(A)
    server.uploadsPaused = true
    tick()
    const mine = await B.db.addScore([pdf('b.pdf', 'B')], { title: '새 악보', pageCount: 1, thumb: null })
    server.log = []
    const r = await sync(B)
    expect(r.downloaded).toBe(1)
    expect(r.skippedForQuota).toBe(1)
    expect(server.log.some((l) => l.startsWith('putFile'))).toBe(false)
    expect(await B.db.getEntry(fromA.id)).not.toBeNull()
    expect(await B.db.getEntry(mine.id)).not.toBeNull()
    // 다음 달 (한도 풀림) → 그때 올라감
    server.uploadsPaused = false
    expect((await sync(B)).uploaded).toBe(1)
  })

  it('인터넷이 끊기면 멈추고 오류를 알림 (이 기기 데이터는 그대로)', async () => {
    await A.db.addScore([pdf('a.pdf', 'A')], { title: '오프라인', pageCount: 1, thumb: null })
    server.offline = true
    await expect(sync(A)).rejects.toMatchObject({ status: 0 })
    expect(await A.db.listScores()).toHaveLength(1)
    server.offline = false
    expect((await sync(A)).uploaded).toBe(1)
  })
})

describe('설정 동기화', () => {
  it('취향 설정은 같이 쓰고, 캘리브레이션 · 성능 설정은 기기마다 따로', async () => {
    // A: 처음 로그인 → 서버가 비어 있으니 A 설정을 올림
    A.settings = { ...A.settings, holdMs: 420, viewMode: 'spread', maxFps: 30, modes: { ...A.settings.modes, head: { ...A.settings.modes.head, threshold: 0.33 } } }
    expect(await syncSet(A)).toBe('pushed')

    // B: 처음 로그인 → 계정 설정을 받음. B 기기 설정(fps · 캘리브레이션)은 그대로
    expect(await syncSet(B)).toBe('pulled')
    expect(B.settings.holdMs).toBe(420)
    expect(B.settings.viewMode).toBe('spread')
    expect(B.settings.maxFps).toBe(DEFAULT_SETTINGS.maxFps)
    expect(B.settings.modes.head.threshold).toBe(DEFAULT_SETTINGS.modes.head.threshold)

    // B 에서 고침 → A 로
    tick()
    B.settings = { ...B.settings, cooldownMs: 1100 }
    expect(await syncSet(B)).toBe('pushed')
    expect(await syncSet(A)).toBe('pulled')
    expect(A.settings.cooldownMs).toBe(1100)
    expect(A.settings.maxFps).toBe(30)

    // 바뀐 게 없으면 아무것도 안 함
    expect(await syncSet(A)).toBe('none')
    expect(await syncSet(B)).toBe('none')
  })
})
