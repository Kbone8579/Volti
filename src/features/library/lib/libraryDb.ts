import type { Zoom } from '@/features/score'

/**
 * 내 악보 라이브러리 — 브라우저 IndexedDB에 저장.
 *
 * - scores : 목록에 보일 정보 (제목, 쪽수, 썸네일, 마지막으로 본 쪽, 열어본 시각, 고친 시각)
 * - files  : 원본 파일들 (PDF · 이미지). 목록을 불러올 때는 읽지 않아 가볍게 유지
 * - deleted: 지운 악보 기록 (로그인해서 동기화할 때 다른 기기·서버에서도 지우도록). 동기화되면 지워짐
 *
 * 로그인하지 않으면 이 브라우저에만 저장되며, "사이트 데이터 삭제"를 하면 함께 지워진다.
 * 로그인하면 features/sync 가 이 저장소와 서버를 맞춘다. 바뀔 때마다 onLibraryChange 로 알림.
 */

export interface LibraryEntry {
  id: string
  title: string
  /** 같은 파일을 다시 추가했는지 알아보는 값 (파일 이름 + 크기) */
  signature: string
  fileNames: string[]
  /** 원본 파일 크기 합 (byte) */
  size: number
  pageCount: number
  createdAt: number
  openedAt: number
  /** 마지막으로 보던 쪽 (0부터) */
  lastPage: number
  /** 이 악보에 정해 둔 배율 (없으면 화면 맞춤) */
  zoom?: Zoom
  thumb: Blob | null
  /** 마지막으로 바뀐 시각 — 기기끼리 맞출 때 더 나중 것을 씀 (예전 항목엔 없음 → entryUpdatedAt) */
  updatedAt?: number
}

/** 지운 악보 기록 */
export interface DeletedRecord {
  id: string
  at: number
}

export const entryUpdatedAt = (e: LibraryEntry): number => e.updatedAt ?? Math.max(e.openedAt, e.createdAt)

/* ───────── 바뀜 알림 (동기화가 듣고 있음) ───────── */
const listeners = new Set<() => void>()
/** 라이브러리가 바뀔 때마다 부를 함수 등록. 해제 함수를 돌려줌 */
export function onLibraryChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = () => listeners.forEach((fn) => fn())

interface StoredFile {
  name: string
  type: string
  lastModified: number
  data: Blob
}

interface StoredFiles {
  id: string
  files: StoredFile[]
}

const DB_NAME = 'pageturn-library'
const DB_VERSION = 2
const SCORES = 'scores'
const FILES = 'files'
const DELETED = 'deleted'

let dbPromise: Promise<IDBDatabase> | null = null

export function libraryAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  if (!libraryAvailable()) return Promise.reject(new Error('IndexedDB를 쓸 수 없는 환경이에요.'))
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SCORES)) db.createObjectStore(SCORES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(DELETED)) db.createObjectStore(DELETED, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('다른 탭이 라이브러리를 쓰고 있어요. 다른 탭을 닫고 새로고침해 주세요.'))
  }).catch((err) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

/** 테스트용: 연결을 끊고 다음 호출 때 새로 연다 */
export async function _resetLibraryConnection(): Promise<void> {
  if (dbPromise) (await dbPromise.catch(() => null))?.close()
  dbPromise = null
}

const done = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('저장이 취소됐어요.'))
  })

export function fileSignature(files: File[]): string {
  return files.map((f) => `${f.name}:${f.size}`).join('|')
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** 최근에 연 순서 */
export async function listScores(): Promise<LibraryEntry[]> {
  const db = await openDb()
  const all = await done(db.transaction(SCORES).objectStore(SCORES).getAll() as IDBRequest<LibraryEntry[]>)
  return all.sort((a, b) => b.openedAt - a.openedAt)
}

export async function findBySignature(signature: string): Promise<LibraryEntry | null> {
  return (await listScores()).find((e) => e.signature === signature) ?? null
}

export async function addScore(
  files: File[],
  meta: { title: string; pageCount: number; thumb: Blob | null },
  now = Date.now(),
): Promise<LibraryEntry> {
  const db = await openDb()
  const entry: LibraryEntry = {
    id: newId(),
    title: meta.title,
    signature: fileSignature(files),
    fileNames: files.map((f) => f.name),
    size: files.reduce((a, f) => a + f.size, 0),
    pageCount: meta.pageCount,
    createdAt: now,
    openedAt: now,
    lastPage: 0,
    thumb: meta.thumb,
    updatedAt: now,
  }
  const tx = db.transaction([SCORES, FILES], 'readwrite')
  tx.objectStore(SCORES).put(entry)
  tx.objectStore(FILES).put(toStored(entry.id, files))
  await finished(tx)
  changed()
  return entry
}

const toStored = (id: string, files: File[]): StoredFiles => ({
  id,
  files: files.map((f) => ({ name: f.name, type: f.type, lastModified: f.lastModified, data: f })),
})

export async function getEntry(id: string): Promise<LibraryEntry | null> {
  const db = await openDb()
  return (await done(db.transaction(SCORES).objectStore(SCORES).get(id) as IDBRequest<LibraryEntry | undefined>)) ?? null
}

export async function getScoreFiles(id: string): Promise<File[]> {
  const db = await openDb()
  const stored = await done(db.transaction(FILES).objectStore(FILES).get(id) as IDBRequest<StoredFiles | undefined>)
  if (!stored) throw new Error('파일을 찾지 못했어요.')
  return stored.files.map((f) => new File([f.data], f.name, { type: f.type, lastModified: f.lastModified }))
}

/** 일부 고치기. 고친 시각(updatedAt)은 지금으로 — 동기화가 서버 값을 넣을 때만 updatedAt 을 직접 줌 */
export async function updateScore(
  id: string,
  patch: Partial<Pick<LibraryEntry, 'title' | 'lastPage' | 'openedAt' | 'thumb' | 'pageCount' | 'zoom' | 'updatedAt'>>,
): Promise<LibraryEntry | null> {
  const db = await openDb()
  const tx = db.transaction(SCORES, 'readwrite')
  const store = tx.objectStore(SCORES)
  const cur = await done(store.get(id) as IDBRequest<LibraryEntry | undefined>)
  if (!cur) {
    await finished(tx)
    return null
  }
  const next = { ...cur, ...patch, updatedAt: patch.updatedAt ?? Date.now() }
  store.put(next)
  await finished(tx)
  changed()
  return next
}

/** 그대로 저장 (같은 id 가 있으면 덮어씀). 서버에서 받은 악보를 넣을 때 */
export async function saveScore(entry: LibraryEntry, files: File[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([SCORES, FILES, DELETED], 'readwrite')
  tx.objectStore(SCORES).put(entry)
  tx.objectStore(FILES).put(toStored(entry.id, files))
  tx.objectStore(DELETED).delete(entry.id)
  await finished(tx)
  changed()
}

/** 되돌리기: 지운 항목을 같은 id로 다시 넣음 (지운 기록보다 나중이 되도록 고친 시각을 지금으로) */
export async function restoreScore(entry: LibraryEntry, files: File[]): Promise<void> {
  await saveScore({ ...entry, updatedAt: Date.now() }, files)
}

/**
 * 지우기. record=true(기본)면 「지운 기록」을 남겨서 동기화 때 서버·다른 기기에서도 지움.
 * 동기화가 서버의 삭제를 따라 지울 때는 record=false.
 */
export async function deleteScore(id: string, opts: { record?: boolean; at?: number } = {}): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([SCORES, FILES, DELETED], 'readwrite')
  tx.objectStore(SCORES).delete(id)
  tx.objectStore(FILES).delete(id)
  if (opts.record ?? true) tx.objectStore(DELETED).put({ id, at: opts.at ?? Date.now() } satisfies DeletedRecord)
  await finished(tx)
  changed()
}

export async function listDeleted(): Promise<DeletedRecord[]> {
  const db = await openDb()
  return done(db.transaction(DELETED).objectStore(DELETED).getAll() as IDBRequest<DeletedRecord[]>)
}

/** 지운 기록을 서버에 반영했으면 지움 */
export async function forgetDeleted(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(DELETED, 'readwrite')
  tx.objectStore(DELETED).delete(id)
  await finished(tx)
}

/**
 * id 바꾸기 — 두 기기에서 같은 파일을 따로 넣었을 때(예: 샘플 악보) 서버 쪽 id 로 맞춰 하나로 합침.
 * 파일은 그대로 옮기고, 지운 기록은 남기지 않음.
 */
export async function rekeyScore(fromId: string, toId: string): Promise<LibraryEntry | null> {
  const db = await openDb()
  const tx = db.transaction([SCORES, FILES], 'readwrite')
  const scores = tx.objectStore(SCORES)
  const filesStore = tx.objectStore(FILES)
  const entry = await done(scores.get(fromId) as IDBRequest<LibraryEntry | undefined>)
  const stored = await done(filesStore.get(fromId) as IDBRequest<StoredFiles | undefined>)
  if (!entry || !stored) {
    await finished(tx)
    return null
  }
  const moved = { ...entry, id: toId }
  scores.put(moved)
  filesStore.put({ ...stored, id: toId })
  scores.delete(fromId)
  filesStore.delete(fromId)
  await finished(tx)
  changed()
  return moved
}

/** 브라우저가 공간이 부족할 때 임의로 지우지 않도록 요청 (지원하는 브라우저만) */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export async function storageUsage(): Promise<number | null> {
  try {
    const est = await navigator.storage?.estimate?.()
    return est?.usage ?? null
  } catch {
    return null
  }
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`
}

export function relativeTime(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`
  const d = new Date(t)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}
