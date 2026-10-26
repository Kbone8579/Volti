/**
 * 캘리브레이션 계산 (순수 함수).
 * 1) 중립 자세 → 기준값(baseline) = 중앙값
 * 2) "다음 페이지" 동작 → 방향(direction)과 임계값(threshold) 결정
 */

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx]
}

export interface GestureCalibration {
  direction: 1 | -1
  threshold: number
  /** 측정된 동작 크기 (|편차|의 85퍼센타일) */
  strength: number
}

export const MIN_SAMPLES = 8

/**
 * @param samples 동작 구간에서 모은 원시 신호
 * @param baseline 중립 기준값
 * @param minThreshold 이보다 약한 동작은 실패로 처리
 * @param ratio 측정된 동작 크기의 몇 %를 임계값으로 쓸지 (기본 0.6)
 */
export function calibrateGesture(
  samples: number[],
  baseline: number,
  minThreshold: number,
  maxThreshold: number,
  ratio = 0.6,
): GestureCalibration | null {
  if (samples.length < MIN_SAMPLES) return null
  const dev = samples.map((v) => v - baseline)
  const abs = dev.map(Math.abs)
  const strength = percentile(abs, 85)
  if (strength < minThreshold / ratio) return null

  // 크게 움직인 샘플들(상위 구간)의 부호로 방향 결정
  const cut = strength * 0.5
  const strong = dev.filter((v) => Math.abs(v) >= cut)
  const direction: 1 | -1 = median(strong) >= 0 ? 1 : -1
  const threshold = Math.min(maxThreshold, Math.max(minThreshold, strength * ratio))
  return { direction, threshold, strength }
}
