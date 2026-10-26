/**
 * 제스처 판정 상태머신 (UI·카메라와 무관한 순수 로직).
 *
 * 입력 d = (신호 - 기준값) × 방향. d가 +threshold 이상이면 "다음", -threshold 이하면 "이전" 쪽.
 *
 *   armed ──(임계값 넘음)──▶ holding ──(holdMs 유지)──▶ 트리거! ──▶ cooldown
 *     ▲                          │                                    │
 *     │                  (중간에 풀림/얼굴 사라짐)                   (cooldownMs 경과)
 *     │                          ▼                                    ▼
 *     └────────────────────── armed ◀──(중립으로 돌아옴)────────── waitNeutral
 *
 * - 유지 시간: 스치듯 지나가는 움직임 무시
 * - 쿨다운 + 중립 복귀: 고개를 돌린 채로 있어도 한 번만 넘어감
 * - 히스테리시스: 유지 중엔 threshold×holdRatio 까지 살짝 내려가도 봐줌 (떨림 대응)
 */

export type Side = 1 | -1
export type DetectorPhase = 'armed' | 'holding' | 'cooldown' | 'waitNeutral'

export interface DetectorParams {
  threshold: number
  holdMs: number
  cooldownMs: number
  forwardOnly: boolean
  /** 이 비율 아래로 돌아와야 다시 무장 (기본 0.5) */
  rearmRatio?: number
  /** 유지 중 허용하는 하한 비율 (기본 0.85) */
  holdRatio?: number
}

export interface GestureEvent {
  kind: 'next' | 'prev'
  at: number
  /** 유지 구간 중 가장 크게 움직인 값 (|d|) */
  peak: number
}

export interface DetectorUpdate {
  phase: DetectorPhase
  side: Side | 0
  /** 0..1 유지 진행도 */
  holdProgress: number
  event: GestureEvent | null
}

export class GestureDetector {
  private phase: DetectorPhase = 'armed'
  private side: Side | 0 = 0
  private holdStart = 0
  private peak = 0
  private cooldownUntil = 0

  reset(): void {
    this.phase = 'armed'
    this.side = 0
    this.holdStart = 0
    this.peak = 0
    this.cooldownUntil = 0
  }

  get currentPhase(): DetectorPhase {
    return this.phase
  }

  /**
   * @param d 정규화된 편차. 얼굴이 안 보이면 null
   * @param t 타임스탬프(ms)
   */
  update(d: number | null, t: number, p: DetectorParams): DetectorUpdate {
    const rearm = p.threshold * (p.rearmRatio ?? 0.5)
    const holdFloor = p.threshold * (p.holdRatio ?? 0.85)
    let event: GestureEvent | null = null

    if (d === null) {
      // 얼굴을 놓치면 진행 중이던 유지는 취소 (쿨다운 타이머는 계속 흐름)
      if (this.phase === 'holding') this.toArmed()
      if (this.phase === 'cooldown' && t >= this.cooldownUntil) this.phase = 'waitNeutral'
      return this.snapshot(t, p, null)
    }

    if (this.phase === 'cooldown' && t >= this.cooldownUntil) {
      this.phase = 'waitNeutral'
    }

    if (this.phase === 'waitNeutral' && Math.abs(d) < rearm) {
      this.toArmed()
    }

    if (this.phase === 'armed') {
      let side: Side | 0 = d >= p.threshold ? 1 : d <= -p.threshold ? -1 : 0
      if (side === -1 && p.forwardOnly) side = 0
      if (side !== 0) {
        this.phase = 'holding'
        this.side = side
        this.holdStart = t
        this.peak = Math.abs(d)
      }
    }

    if (this.phase === 'holding') {
      const along = d * this.side
      if (along >= holdFloor) {
        this.peak = Math.max(this.peak, Math.abs(d))
        if (t - this.holdStart >= p.holdMs) {
          event = { kind: this.side === 1 ? 'next' : 'prev', at: t, peak: this.peak }
          this.phase = 'cooldown'
          this.cooldownUntil = t + p.cooldownMs
        }
      } else {
        this.toArmed()
      }
    }

    return this.snapshot(t, p, event)
  }

  private toArmed() {
    this.phase = 'armed'
    this.side = 0
    this.peak = 0
  }

  private snapshot(t: number, p: DetectorParams, event: GestureEvent | null): DetectorUpdate {
    const holdProgress =
      this.phase === 'holding' ? (p.holdMs <= 0 ? 1 : Math.min(1, (t - this.holdStart) / p.holdMs)) : 0
    return { phase: this.phase, side: this.phase === 'holding' ? this.side : 0, holdProgress, event }
  }
}
