import { MODE_META, formatValue, type GestureMode, type Settings } from './settings'

const ZONE_LABEL = { small: '작게', medium: '보통', large: '크게' } as const

export interface LogEntry {
  id: number
  /** 세션 시작 기준 ms */
  at: number
  kind: 'next' | 'prev'
  peak: number
  mode: GestureMode
  falsePositive: boolean
  /** 대기 중에 취소돼서 실제로는 넘기지 않음 */
  cancelled?: boolean
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function summarize(log: LogEntry[], sessionMs: number) {
  const next = log.filter((e) => e.kind === 'next').length
  const prev = log.filter((e) => e.kind === 'prev').length
  const wrong = log.filter((e) => e.falsePositive).length
  const cancelled = log.filter((e) => e.cancelled).length
  const minutes = sessionMs / 60000
  return { total: log.length, next, prev, wrong, cancelled, perMinute: minutes > 0 ? wrong / minutes : 0 }
}

/** 테스터에게 받은 결과를 모으기 쉽게 텍스트로 */
export function buildReport(opts: {
  log: LogEntry[]
  sessionMs: number
  settings: Settings
  tester: string
  scoreTitle: string
  now?: Date
}): string {
  const { log, sessionMs, settings, tester, scoreTitle } = opts
  const now = opts.now ?? new Date()
  const s = summarize(log, sessionMs)
  const m = settings.mode
  const cfg = settings.modes[m]
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return [
    '[Volti 테스트 결과]',
    `날짜: ${date}`,
    `악기·테스터: ${tester || '(미입력)'}`,
    `악보: ${scoreTitle || '(없음)'}`,
    m === 'custom'
      ? `제스처: 내 동작 (다음: ${settings.customModel?.next.summary.join(', ') || '없음'}${settings.customModel?.prev ? `, 이전: ${settings.customModel.prev.summary.join(', ')}` : ''} / 임계값 ${formatValue(m, cfg.threshold)}, 유지 ${settings.holdMs}ms, 쿨다운 ${settings.cooldownMs}ms)`
      : m === 'gaze'
      ? `제스처: 시선 (바라보는 시간 ${settings.gazeDwellMs}ms, 넘김 칸 ${ZONE_LABEL[settings.gazeZone]}, 쿨다운 ${settings.cooldownMs}ms, 보정 오차 ${settings.gazeModel ? Math.round(settings.gazeModel.errorPx) + 'px' : '없음'})`
      : `제스처: ${MODE_META[m].label} (임계값 ${formatValue(m, cfg.threshold)}, 유지 ${settings.holdMs}ms, 쿨다운 ${settings.cooldownMs}ms${settings.forwardOnly ? ', 앞으로만' : ''})`,
    `테스트 시간: ${formatDuration(sessionMs)}`,
    `넘기기 전 대기: ${settings.turnDelayMs > 0 ? `${settings.turnDelayMs / 1000}초` : '없음 (바로)'}`,
    `넘김: 다음 ${s.next}회 / 이전 ${s.prev}회${s.cancelled ? ` (대기 중 취소 ${s.cancelled}회)` : ''}`,
    `오작동 표시: ${s.wrong}회 (분당 ${s.perMinute.toFixed(2)}회)`,
    '메모: ',
  ].join('\n')
}
