/**
 * 설정 동기화 — 어떤 설정을 기기끼리 같이 쓰는지와, 어느 쪽이 더 새것인지 판단.
 *
 * 같이 쓰는 것: 사람의 취향 (제스처 종류, 유지·대기 시간, 이전 페이지 사용, 보기 방식, 확대 방식, 시선 칸, 내 동작 녹화)
 * 기기마다 따로: 카메라 위치에 따라 달라지는 것 (고개·입·윙크 캘리브레이션 기준값, 시선 보정) 과
 *               기기 성능 설정 (해상도 · fps · GPU), 패널 열림 상태
 */
import type { ApiSettings } from '@server/api-types'
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings'

export const SYNCED_KEYS = [
  'mode',
  'holdMs',
  'cooldownMs',
  'turnDelayMs',
  'forwardOnly',
  'viewMode',
  'spreadStep',
  'zoomLocked',
  'wheelMode',
  'zoomScrollFirst',
  'gazeDwellMs',
  'gazeZone',
  'showGazeDot',
  'mirror',
  'customModel',
] as const satisfies readonly (keyof Settings)[]

type SyncedKey = (typeof SYNCED_KEYS)[number]
export type SyncedSettings = Pick<Settings, SyncedKey>

export function pickSynced(s: Settings): SyncedSettings {
  const out = {} as Record<SyncedKey, unknown>
  for (const k of SYNCED_KEYS) out[k] = s[k]
  return out as SyncedSettings
}

/** 서버에서 온 값 중 아는 항목 · 맞는 형태만 */
export function syncedPatch(data: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {}
  for (const k of SYNCED_KEYS) {
    if (!(k in data)) continue
    const v = data[k]
    const def = DEFAULT_SETTINGS[k]
    if (k === 'customModel') {
      if (v === null || (typeof v === 'object' && v !== null && 'next' in v)) out[k] = v
    } else if (typeof v === typeof def) out[k] = v
  }
  return out as Partial<Settings>
}

/* ───────── 이 기기 설정의 「고친 시각」 기록 ───────── */

export interface SettingsStamp {
  /** 마지막으로 기록한 같이 쓰는 설정 (JSON) */
  json: string
  /** 그 설정을 고친 시각 (0 = 이 기기에서 고친 적 없음 → 서버 값이 이김) */
  at: number
}

const KEY = 'volti/sync/settings'

export function readStamp(): SettingsStamp | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SettingsStamp) : null
  } catch {
    return null
  }
}

export function writeStamp(s: SettingsStamp): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 저장이 막힌 환경 — 다음 동기화 때 서버 값을 따름
  }
}

/**
 * 설정이 바뀔 때마다 부름. 같이 쓰는 설정이 바뀌었으면 고친 시각을 지금으로 하고 true.
 * 처음 부를 땐 시각 0 으로 기록 (아직 고친 적 없음).
 */
export function noteLocalSettings(s: Settings, now = Date.now()): boolean {
  const json = JSON.stringify(pickSynced(s))
  const prev = readStamp()
  if (!prev) {
    writeStamp({ json, at: 0 })
    return false
  }
  if (prev.json === json) return false
  writeStamp({ json, at: now })
  return true
}

export type SettingsDecision =
  | { kind: 'none' }
  | { kind: 'push'; body: ApiSettings }
  | { kind: 'pull'; patch: Partial<Settings>; stamp: SettingsStamp }

export function decideSettings(local: Settings, stamp: SettingsStamp, remote: ApiSettings, now = Date.now()): SettingsDecision {
  if (!remote.data) return { kind: 'push', body: { data: pickSynced(local) as unknown as Record<string, unknown>, updatedAt: stamp.at || now } }
  if (remote.updatedAt > stamp.at) {
    const patch = syncedPatch(remote.data)
    return { kind: 'pull', patch, stamp: { json: JSON.stringify(pickSynced({ ...local, ...patch })), at: remote.updatedAt } }
  }
  if (stamp.at > remote.updatedAt) return { kind: 'push', body: { data: pickSynced(local) as unknown as Record<string, unknown>, updatedAt: stamp.at } }
  return { kind: 'none' }
}
