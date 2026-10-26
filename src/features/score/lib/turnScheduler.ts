/**
 * 넘김 예약: 제스처를 인식한 뒤 정해둔 시간만큼 기다렸다가 넘긴다.
 * 마지막 마디를 연주하는 동안 미리 동작해 두는 용도.
 *
 * - 대기 시간 0 → 바로 넘김
 * - 기다리는 중 같은 방향 제스처 → 무시 (이미 예약됨)
 * - 기다리는 중 반대 방향 제스처 → 예약 취소
 * - cancel(): 화면의 취소 버튼 · Esc · 손으로 넘김 · 라이브러리 열기 등
 */
export type TurnKind = 'next' | 'prev'

export interface PendingTurn {
  id: number
  kind: TurnKind
  startedAt: number
  dueAt: number
  /** 이 예약을 만든 테스트 기록 항목 */
  logId: number | null
}

export type RequestResult = 'turned' | 'scheduled' | 'ignored' | 'cancelled'

interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  now: () => number
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
}

export class TurnScheduler {
  private current: PendingTurn | null = null
  private handle: unknown = null
  private seq = 0

  constructor(
    private onTurn: (kind: TurnKind) => void,
    private onChange: (p: PendingTurn | null) => void,
    private timers: Timers = defaultTimers,
  ) {}

  get pending(): PendingTurn | null {
    return this.current
  }

  request(kind: TurnKind, delayMs: number, logId: number | null = null): RequestResult {
    if (this.current) {
      if (this.current.kind === kind) return 'ignored'
      this.cancel()
      return 'cancelled'
    }
    if (delayMs <= 0) {
      this.onTurn(kind)
      return 'turned'
    }
    const now = this.timers.now()
    const p: PendingTurn = { id: ++this.seq, kind, startedAt: now, dueAt: now + delayMs, logId }
    this.current = p
    this.handle = this.timers.setTimeout(() => {
      if (this.current?.id !== p.id) return
      this.current = null
      this.handle = null
      this.onChange(null)
      this.onTurn(kind)
    }, delayMs)
    this.onChange(p)
    return 'scheduled'
  }

  /** 예약을 취소하고, 취소한 예약을 돌려줌 (없으면 null) */
  cancel(): PendingTurn | null {
    const p = this.current
    if (!p) return null
    this.timers.clearTimeout(this.handle)
    this.current = null
    this.handle = null
    this.onChange(null)
    return p
  }
}
