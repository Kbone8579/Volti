/**
 * 동기화 계획 — 이 기기의 라이브러리와 서버 목록을 비교해서 할 일을 정함 (순수 함수, 실제 작업은 syncEngine).
 *
 * 규칙
 * - 한쪽에만 있으면 다른 쪽으로 복사 (올리기 / 받기)
 * - 둘 다 있으면 고친 시각(updatedAt)이 더 나중인 쪽이 이김 (정보 올리기 / 정보 받기)
 * - 지운 것은 「지운 기록」으로 전달. 지운 시각보다 다른 쪽에서 더 나중에 고쳤으면 지우지 않고 되살림
 * - 서로 다른 기기에서 같은 파일을 따로 넣었으면(서명이 같음) 서버 쪽 id 로 맞춰 하나로 합침
 */
import type { ApiScore } from '@server/api-types'

export interface LocalItem {
  id: string
  signature: string
  updatedAt: number
}

export interface DeletedMark {
  id: string
  at: number
}

export type SyncAction =
  /** 같은 파일 → 이 기기의 id 를 서버 id 로 바꿈 */
  | { kind: 'rekey'; from: string; to: string }
  /** 서버에서 지워짐 → 이 기기에서도 지움 */
  | { kind: 'deleteLocal'; id: string }
  /** 이 기기에서 지움 → 서버에서도 지움 */
  | { kind: 'deleteRemote'; id: string; at: number }
  /** 처리할 것 없는 지운 기록 정리 */
  | { kind: 'forgetDeleted'; id: string }
  /** 서버 정보(제목 · 보던 쪽 · 배율 …)가 더 새것 → 이 기기 정보 바꾸기 */
  | { kind: 'pullMeta'; id: string }
  /** 이 기기 정보가 더 새것 → 서버 정보 바꾸기 */
  | { kind: 'pushMeta'; id: string }
  /** 서버에만 있음 → 파일까지 받기 */
  | { kind: 'download'; id: string }
  /** 이 기기에만 있음 (또는 서버에선 지웠지만 여기서 더 나중에 고침) → 파일까지 올리기 */
  | { kind: 'upload'; id: string }

/** 가벼운 일 먼저, 파일 오가는 일은 나중에 */
const ORDER: Record<SyncAction['kind'], number> = {
  rekey: 0,
  deleteLocal: 1,
  deleteRemote: 1,
  forgetDeleted: 1,
  pullMeta: 2,
  pushMeta: 2,
  download: 3,
  upload: 4,
}

export function planSync(local: LocalItem[], deleted: DeletedMark[], remote: ApiScore[]): SyncAction[] {
  const actions: SyncAction[] = []
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const deletedById = new Map(deleted.map((d) => [d.id, d]))

  // 1) 같은 파일을 기기마다 따로 넣은 경우: 서버 id 로 맞춤
  const localView = new Map<string, LocalItem>()
  const claimed = new Set(local.filter((l) => remoteById.has(l.id)).map((l) => l.id))
  for (const l of local) {
    if (!remoteById.has(l.id)) {
      const twin = remote.find((r) => !r.deleted && r.signature === l.signature && !claimed.has(r.id) && !local.some((x) => x.id === r.id))
      if (twin) {
        claimed.add(twin.id)
        actions.push({ kind: 'rekey', from: l.id, to: twin.id })
        localView.set(twin.id, { ...l, id: twin.id })
        continue
      }
    }
    localView.set(l.id, l)
  }

  // 2) id 별로 비교
  const ids = new Set([...localView.keys(), ...remoteById.keys(), ...deletedById.keys()])
  for (const id of ids) {
    const l = localView.get(id)
    const r = remoteById.get(id)
    const d = deletedById.get(id)
    if (l && d) actions.push({ kind: 'forgetDeleted', id }) // (되돌린 뒤 남은 기록)
    if (l && r) {
      if (r.deleted) actions.push(r.updatedAt >= l.updatedAt ? { kind: 'deleteLocal', id } : { kind: 'upload', id })
      else if (l.updatedAt > r.updatedAt) actions.push(l.signature === r.signature ? { kind: 'pushMeta', id } : { kind: 'upload', id })
      else if (r.updatedAt > l.updatedAt) actions.push(l.signature === r.signature ? { kind: 'pullMeta', id } : { kind: 'download', id })
    } else if (l && !r) {
      actions.push({ kind: 'upload', id })
    } else if (!l && r && !r.deleted) {
      if (d && d.at >= r.updatedAt) actions.push({ kind: 'deleteRemote', id, at: d.at })
      else {
        actions.push({ kind: 'download', id })
        if (d) actions.push({ kind: 'forgetDeleted', id })
      }
    } else if (!l && d) {
      actions.push({ kind: 'forgetDeleted', id })
    }
  }
  return actions.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}
