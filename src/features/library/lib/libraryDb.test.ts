// IndexedDB를 메모리로 흉내내서 라이브러리 저장 로직을 확인 (Node 환경: 진짜 Blob/File 사용)
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetLibraryConnection,
  addScore,
  deleteScore,
  fileSignature,
  findBySignature,
  formatBytes,
  forgetDeleted,
  getEntry,
  getScoreFiles,
  listDeleted,
  listScores,
  onLibraryChange,
  rekeyScore,
  relativeTime,
  restoreScore,
  saveScore,
  updateScore,
} from './libraryDb'

const pdf = (name: string, text = '%PDF-1.4 test') => new File([text], name, { type: 'application/pdf', lastModified: 1000 })

beforeEach(async () => {
  await _resetLibraryConnection()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('pageturn-library')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
})

describe('라이브러리', () => {
  it('추가 → 목록 → 파일 다시 꺼내기', async () => {
    const files = [pdf('아리랑.pdf'), new File([new Uint8Array([1, 2, 3])], 'p2.jpg', { type: 'image/jpeg' })]
    const e = await addScore(files, { title: '아리랑', pageCount: 4, thumb: new Blob(['thumb'], { type: 'image/jpeg' }) }, 5000)
    const list = await listScores()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: e.id, title: '아리랑', pageCount: 4, lastPage: 0, fileNames: ['아리랑.pdf', 'p2.jpg'] })
    expect(list[0].thumb).toBeInstanceOf(Blob)

    const back = await getScoreFiles(e.id)
    expect(back.map((f) => f.name)).toEqual(['아리랑.pdf', 'p2.jpg'])
    expect(back[0].type).toBe('application/pdf')
    expect(await back[0].text()).toBe('%PDF-1.4 test')
    expect(new Uint8Array(await back[1].arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('같은 파일은 서명으로 찾음', async () => {
    const files = [pdf('a.pdf'), pdf('b.pdf', 'longer content')]
    await addScore(files, { title: 'A', pageCount: 2, thumb: null })
    expect((await findBySignature(fileSignature([pdf('a.pdf'), pdf('b.pdf', 'longer content')])))?.title).toBe('A')
    expect(await findBySignature(fileSignature([pdf('a.pdf')]))).toBeNull()
  })

  it('최근에 연 순서로 정렬, 이름·마지막 쪽 저장', async () => {
    const a = await addScore([pdf('a.pdf')], { title: 'A', pageCount: 3, thumb: null }, 1000)
    await addScore([pdf('b.pdf')], { title: 'B', pageCount: 3, thumb: null }, 2000)
    expect((await listScores()).map((e) => e.title)).toEqual(['B', 'A'])

    await updateScore(a.id, { openedAt: 3000, lastPage: 2, title: '새 이름' })
    const list = await listScores()
    expect(list.map((e) => e.title)).toEqual(['새 이름', 'B'])
    expect(list[0].lastPage).toBe(2)
    expect(await updateScore('없는-id', { lastPage: 1 })).toBeNull()
  })

  it('삭제하면 파일도 함께 지워짐', async () => {
    const e = await addScore([pdf('a.pdf')], { title: 'A', pageCount: 1, thumb: null })
    await deleteScore(e.id)
    expect(await listScores()).toHaveLength(0)
    await expect(getScoreFiles(e.id)).rejects.toThrow()
  })

  it('삭제 후 되돌리기', async () => {
    const e = await addScore([pdf('a.pdf')], { title: 'A', pageCount: 2, thumb: null })
    await updateScore(e.id, { lastPage: 1 })
    const [entry] = await listScores()
    const files = await getScoreFiles(e.id)
    await deleteScore(e.id)
    await restoreScore(entry, files)
    const back = await listScores()
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ id: e.id, title: 'A', lastPage: 1 })
    expect(await (await getScoreFiles(e.id))[0].text()).toBe('%PDF-1.4 test')
  })

  it('동기화용: 고친 시각 · 지운 기록 · 그대로 저장 · id 바꾸기 · 바뀜 알림', async () => {
    let changes = 0
    const off = onLibraryChange(() => changes++)
    const e = await addScore([pdf('a.pdf')], { title: 'A', pageCount: 1, thumb: null }, 1000)
    expect(e.updatedAt).toBe(1000)
    const u = await updateScore(e.id, { lastPage: 3 })
    expect(u!.updatedAt).toBeGreaterThan(1000) // 고치면 지금 시각
    await updateScore(e.id, { title: '서버 제목', updatedAt: 777 }) // 서버 값을 넣을 땐 그 시각 그대로
    expect((await getEntry(e.id))!.updatedAt).toBe(777)

    // 지우면 기록이 남고, 동기화가 따라 지울 땐(record=false) 안 남음
    const files = await getScoreFiles(e.id)
    const entry = (await getEntry(e.id))!
    await deleteScore(e.id, { at: 5000 })
    expect(await listDeleted()).toEqual([{ id: e.id, at: 5000 }])
    // 되돌리면 기록이 사라지고 고친 시각이 지운 시각보다 나중
    await restoreScore(entry, files)
    expect(await listDeleted()).toEqual([])
    expect((await getEntry(e.id))!.updatedAt).toBeGreaterThan(5000)
    await deleteScore(e.id, { record: false })
    expect(await listDeleted()).toEqual([])
    await deleteScore('없는-id', { at: 1 })
    await forgetDeleted('없는-id')
    expect(await listDeleted()).toEqual([])

    // 서버에서 받은 악보: 준 그대로 저장
    await saveScore({ ...entry, id: 'srv-1', updatedAt: 1234, lastPage: 2 }, files)
    expect(await getEntry('srv-1')).toMatchObject({ id: 'srv-1', updatedAt: 1234, lastPage: 2 })

    // id 바꾸기: 파일까지 옮겨지고 예전 id 는 사라짐 (지운 기록 없이)
    const moved = await rekeyScore('srv-1', 'srv-2')
    expect(moved!.id).toBe('srv-2')
    expect(await getEntry('srv-1')).toBeNull()
    expect(await (await getScoreFiles('srv-2'))[0].text()).toBe('%PDF-1.4 test')
    expect(await listDeleted()).toEqual([])
    expect(await rekeyScore('없음', 'x')).toBeNull()

    expect(changes).toBeGreaterThanOrEqual(8)
    off()
  })

  it('표시용 형식', () => {
    expect(formatBytes(2048)).toBe('2KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB')
    expect(relativeTime(0, 30_000)).toBe('방금')
    expect(relativeTime(0, 5 * 60_000)).toBe('5분 전')
    expect(relativeTime(0, 3 * 3600_000)).toBe('3시간 전')
    expect(relativeTime(0, 2 * 86400_000)).toBe('2일 전')
  })
})
