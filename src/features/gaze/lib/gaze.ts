/**
 * 웹캠 시선 추정 (순수 로직).
 *
 * 얼굴 신호(홍채 위치, 눈 블렌드쉐입, 머리 각도) → 화면 좌표.
 * 9점 캘리브레이션 샘플로 릿지 회귀(선형)를 학습한다.
 * 웹캠 시선은 정밀하지 않으므로 "어느 구역을 보는지" 판정에만 쓰고, 구역은 넉넉하게 잡는다.
 */
import type { FaceSignals } from '@/features/camera'

export const GAZE_FEATURE_NAMES = ['홍채 좌우', '홍채 상하', '시선 좌우', '시선 상하', '고개 좌우', '고개 위아래'] as const

export function gazeFeatures(s: FaceSignals): number[] {
  return [s.irisH, s.irisV, s.lookH, s.lookV, s.yaw, s.pitch]
}

export interface GazeSample {
  f: number[]
  /** 화면(뷰포트) 기준 정규화 좌표 0..1 */
  x: number
  y: number
}

export interface GazeModel {
  mean: number[]
  std: number[]
  /** [bias, w1..wk] — 표준화된 특징에 곱함 */
  wx: number[]
  wy: number[]
  /** 빠른 보정으로 더하는 값 (정규화 좌표) */
  offsetX: number
  offsetY: number
  /** 캘리브레이션 샘플 기준 평균 오차 (px) */
  errorPx: number
  /** 캘리브레이션 당시 화면 크기 */
  viewW: number
  viewH: number
  createdAt: number
}

export type Point = { x: number; y: number }

/** 가우스 소거 (부분 피벗). 특이 행렬이면 null */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c]
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]
    x[r] = s / M[r][r]
  }
  return x
}

const standardize = (f: number[], mean: number[], std: number[]) => f.map((v, i) => (v - mean[i]) / std[i])

function rawPredict(m: Pick<GazeModel, 'mean' | 'std' | 'wx' | 'wy'>, f: number[]): Point {
  const z = standardize(f, m.mean, m.std)
  let x = m.wx[0]
  let y = m.wy[0]
  for (let i = 0; i < z.length; i++) {
    x += m.wx[i + 1] * z[i]
    y += m.wy[i + 1] * z[i]
  }
  return { x, y }
}

/** 정규화 좌표(0..1)로 예측 — 빠른 보정 오프셋 미포함 */
export function predictGazeRaw(m: GazeModel, f: number[]): Point {
  return rawPredict(m, f)
}

/** 정규화 좌표(0..1)로 예측 */
export function predictGaze(m: GazeModel, f: number[]): Point {
  const p = rawPredict(m, f)
  return { x: p.x + m.offsetX, y: p.y + m.offsetY }
}

export const MIN_GAZE_SAMPLES = 30

/**
 * @param view 캘리브레이션 당시 화면 크기 (오차를 px로 계산)
 * @param lambda 릿지 강도 (특징이 서로 비슷하게 움직여도 안정적으로)
 */
export function fitGaze(samples: GazeSample[], view: { w: number; h: number }, lambda = 1, now = Date.now()): GazeModel | null {
  if (samples.length < MIN_GAZE_SAMPLES) return null
  const k = samples[0].f.length
  const n = samples.length

  const mean = new Array<number>(k).fill(0)
  for (const s of samples) s.f.forEach((v, i) => (mean[i] += v / n))
  const std = new Array<number>(k).fill(0)
  for (const s of samples) s.f.forEach((v, i) => (std[i] += (v - mean[i]) ** 2 / n))
  for (let i = 0; i < k; i++) std[i] = Math.sqrt(std[i]) || 1
  for (let i = 0; i < k; i++) if (std[i] < 1e-6) std[i] = 1

  const d = k + 1
  const XtX = Array.from({ length: d }, () => new Array<number>(d).fill(0))
  const Xtx = new Array<number>(d).fill(0)
  const Xty = new Array<number>(d).fill(0)
  for (const s of samples) {
    const z = [1, ...standardize(s.f, mean, std)]
    for (let i = 0; i < d; i++) {
      Xtx[i] += z[i] * s.x
      Xty[i] += z[i] * s.y
      for (let j = 0; j < d; j++) XtX[i][j] += z[i] * z[j]
    }
  }
  for (let i = 1; i < d; i++) XtX[i][i] += lambda

  const wx = solveLinear(XtX, Xtx)
  const wy = solveLinear(XtX, Xty)
  if (!wx || !wy) return null

  const base = { mean, std, wx, wy }
  let err = 0
  for (const s of samples) {
    const p = rawPredict(base, s.f)
    err += Math.hypot((p.x - s.x) * view.w, (p.y - s.y) * view.h)
  }
  return { ...base, offsetX: 0, offsetY: 0, errorPx: err / n, viewW: view.w, viewH: view.h, createdAt: now }
}

/** 빠른 보정: 한 점(target)을 보는 동안의 예측들로 오프셋을 다시 맞춤 */
export function correctOffset(m: GazeModel, rawPreds: Point[], target: Point): GazeModel | null {
  if (rawPreds.length < 5) return null
  const mx = rawPreds.reduce((a, p) => a + p.x, 0) / rawPreds.length
  const my = rawPreds.reduce((a, p) => a + p.y, 0) / rawPreds.length
  return { ...m, offsetX: target.x - mx, offsetY: target.y - my }
}

/* ───────── 캘리브레이션 점 배치 ───────── */

/** 악보 영역 안 3×3 격자. 가운데부터 시작해 가장자리를 한 바퀴 */
export function calibrationPoints(rect: { left: number; top: number; width: number; height: number }, margin = 0.08): Point[] {
  const xs = [margin, 0.5, 1 - margin].map((f) => rect.left + rect.width * f)
  const ys = [margin, 0.5, 1 - margin].map((f) => rect.top + rect.height * f)
  const order: [number, number][] = [
    [1, 1],
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
  ]
  return order.map(([i, j]) => ({ x: xs[i], y: ys[j] }))
}

/* ───────── 구역 판정 ───────── */

export type ZoneSize = 'small' | 'medium' | 'large'
export const ZONE_FRACTION: Record<ZoneSize, number> = { small: 0.2, medium: 0.28, large: 0.38 }

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 악보 영역의 오른쪽 아래 구역을 보고 있는지.
 * 악보 밖으로 살짝 넘어간 시선(오른쪽 20%, 아래 15%)까지는 인정하지만,
 * 그보다 멀리(예: 악기·건반을 내려다봄)는 제외.
 */
export function inNextZone(p: Point, rect: Rect, size: ZoneSize): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false
  const fx = (p.x - rect.left) / rect.width
  const fy = (p.y - rect.top) / rect.height
  const z = ZONE_FRACTION[size]
  return fx >= 1 - z && fy >= 1 - z && fx <= 1.2 && fy <= 1.15
}

/** 지수 이동 평균으로 시선 점 떨림 줄이기 */
export class GazeSmoother {
  private p: Point | null = null
  private lastT = 0
  constructor(private alpha = 0.35, private resetAfterMs = 500) {}
  reset() {
    this.p = null
  }
  update(q: Point, t: number): Point {
    if (!this.p || t - this.lastT > this.resetAfterMs) this.p = { ...q }
    else this.p = { x: this.p.x + this.alpha * (q.x - this.p.x), y: this.p.y + this.alpha * (q.y - this.p.y) }
    this.lastT = t
    return { ...this.p }
  }
}
