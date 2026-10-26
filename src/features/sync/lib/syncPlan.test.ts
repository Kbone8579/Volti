import { describe, expect, it } from 'vitest'
import type { ApiScore } from '@server/api-types'
import { planSync, type SyncAction } from './syncPlan'

const R = (id: string, updatedAt: number, extra: Partial<ApiScore> = {}): ApiScore => ({
  id,
  title: id,
  signature: `sig-${id}`,
  fileNames: ['a.pdf'],
  fileTypes: ['application/pdf'],
  size: 10,
  pageCount: 1,
  createdAt: 1,
  openedAt: 1,
  lastPage: 0,
  zoom: null,
  hasThumb: false,
  updatedAt,
  deleted: false,
  ...extra,
})
const L = (id: string, updatedAt: number, signature = `sig-${id}`) => ({ id, updatedAt, signature })
const kinds = (a: SyncAction[]) => a.map((x) => ('id' in x ? `${x.kind}:${x.id}` : `${x.kind}:${x.from}>${x.to}`))

describe('동기화 계획', () => {
  it('한쪽에만 있으면 복사, 같으면 아무것도 안 함', () => {
    expect(kinds(planSync([L('a', 5)], [], []))).toEqual(['upload:a'])
    expect(kinds(planSync([], [], [R('b', 5)]))).toEqual(['download:b'])
    expect(planSync([L('c', 5)], [], [R('c', 5)])).toEqual([])
  })

  it('둘 다 있으면 더 나중에 고친 쪽', () => {
    expect(kinds(planSync([L('a', 9)], [], [R('a', 5)]))).toEqual(['pushMeta:a'])
    expect(kinds(planSync([L('a', 5)], [], [R('a', 9)]))).toEqual(['pullMeta:a'])
    // 파일 자체가 바뀌었으면 정보만이 아니라 파일까지
    expect(kinds(planSync([L('a', 9, 'new-files')], [], [R('a', 5)]))).toEqual(['upload:a'])
    expect(kinds(planSync([L('a', 5, 'old-files')], [], [R('a', 9)]))).toEqual(['download:a'])
  })

  it('이 기기에서 지움 → 서버에서도 지움 (서버가 더 나중에 고쳤으면 되살림)', () => {
    expect(planSync([], [{ id: 'a', at: 10 }], [R('a', 5)])).toEqual([{ kind: 'deleteRemote', id: 'a', at: 10 }])
    expect(kinds(planSync([], [{ id: 'a', at: 10 }], [R('a', 20)]))).toEqual(['forgetDeleted:a', 'download:a'])
    // 서버에 없거나 이미 지워졌으면 기록만 정리
    expect(kinds(planSync([], [{ id: 'x', at: 10 }], []))).toEqual(['forgetDeleted:x'])
    expect(kinds(planSync([], [{ id: 'x', at: 10 }], [R('x', 8, { deleted: true })]))).toEqual(['forgetDeleted:x'])
  })

  it('서버에서 지워짐 → 여기서도 지움 (여기서 더 나중에 고쳤으면 다시 올림)', () => {
    expect(kinds(planSync([L('a', 5)], [], [R('a', 9, { deleted: true })]))).toEqual(['deleteLocal:a'])
    expect(kinds(planSync([L('a', 12)], [], [R('a', 9, { deleted: true })]))).toEqual(['upload:a'])
    // 이 기기에 없는 지운 기록은 무시
    expect(planSync([], [], [R('z', 9, { deleted: true })])).toEqual([])
  })

  it('두 기기에서 같은 파일을 따로 넣으면(예: 샘플) 서버 id 로 맞춰 하나로', () => {
    const plan = planSync([L('local-sample', 3, 'sample-sig')], [], [R('server-sample', 7, { signature: 'sample-sig' })])
    expect(kinds(plan)).toEqual(['rekey:local-sample>server-sample', 'pullMeta:server-sample'])
    // 여기서 더 나중에 고쳤으면 맞춘 뒤 정보 올리기
    expect(kinds(planSync([L('mine', 9, 'S')], [], [R('theirs', 7, { signature: 'S' })]))).toEqual(['rekey:mine>theirs', 'pushMeta:theirs'])
    // 서버 쪽 같은 파일이 이미 이 기기에 있으면 맞추지 않고 따로 올림 (사용자가 일부러 두 번 넣은 경우)
    expect(kinds(planSync([L('a', 5, 'S'), L('b', 5, 'S')], [], [R('a', 5, { signature: 'S' })]))).toEqual(['upload:b'])
    // 지운 서버 항목과는 합치지 않음
    expect(kinds(planSync([L('n', 5, 'S')], [], [R('old', 7, { signature: 'S', deleted: true })]))).toEqual(['upload:n'])
  })

  it('가벼운 일부터: 지우기 · 정보 → 받기 → 올리기', () => {
    const plan = planSync([L('up', 5), L('push', 9)], [{ id: 'gone', at: 10 }], [R('push', 5), R('down', 5), R('gone', 1)])
    expect(kinds(plan)).toEqual(['deleteRemote:gone', 'pushMeta:push', 'download:down', 'upload:up'])
  })
})
