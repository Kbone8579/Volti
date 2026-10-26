/**
 * 내 동작(커스텀 제스처) — 녹화한 동작을 학습해서 판별 (순수 로직).
 *
 * 특징: 얼굴 표정 수치(블렌드쉐입) 51개 + 고개 각도 3개.
 * "평소 자세(악보를 읽으며 연주하는 모습)"와 "녹화한 동작"의 평균·분산으로
 * 대각 선형판별(diagonal LDA) 방향을 구한다.
 *   점수 = 평소 자세 0, 녹화한 동작 1 이 되도록 정규화
 * 평소에 많이 움직이는 부위(예: 악보 읽는 눈동자)는 분산이 커서 자동으로 덜 반영된다.
 */
import type { FaceSignals } from '@/features/camera'

export const BLEND_NAMES = [
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const

/** MediaPipe 이름의 Left/Right는 연주자 본인 기준 */
const BLEND_KO: Record<(typeof BLEND_NAMES)[number], string> = {
  browDownLeft: '왼쪽 눈썹 내림',
  browDownRight: '오른쪽 눈썹 내림',
  browInnerUp: '눈썹 안쪽 올림',
  browOuterUpLeft: '왼쪽 눈썹 바깥 올림',
  browOuterUpRight: '오른쪽 눈썹 바깥 올림',
  cheekPuff: '볼 부풀리기',
  cheekSquintLeft: '왼쪽 볼 올림',
  cheekSquintRight: '오른쪽 볼 올림',
  eyeBlinkLeft: '왼쪽 눈 감기',
  eyeBlinkRight: '오른쪽 눈 감기',
  eyeLookDownLeft: '시선 아래(왼눈)',
  eyeLookDownRight: '시선 아래(오른눈)',
  eyeLookInLeft: '왼눈 안쪽 보기',
  eyeLookInRight: '오른눈 안쪽 보기',
  eyeLookOutLeft: '왼눈 바깥 보기',
  eyeLookOutRight: '오른눈 바깥 보기',
  eyeLookUpLeft: '시선 위(왼눈)',
  eyeLookUpRight: '시선 위(오른눈)',
  eyeSquintLeft: '왼쪽 눈 찡그림',
  eyeSquintRight: '오른쪽 눈 찡그림',
  eyeWideLeft: '왼쪽 눈 크게',
  eyeWideRight: '오른쪽 눈 크게',
  jawForward: '턱 내밀기',
  jawLeft: '턱 왼쪽으로',
  jawOpen: '입 벌리기',
  jawRight: '턱 오른쪽으로',
  mouthClose: '입 다물기',
  mouthDimpleLeft: '왼쪽 보조개',
  mouthDimpleRight: '오른쪽 보조개',
  mouthFrownLeft: '왼쪽 입꼬리 내림',
  mouthFrownRight: '오른쪽 입꼬리 내림',
  mouthFunnel: '입 오므려 벌리기',
  mouthLeft: '입 왼쪽으로',
  mouthLowerDownLeft: '아랫입술 내림(왼)',
  mouthLowerDownRight: '아랫입술 내림(오)',
  mouthPressLeft: '입술 누르기(왼)',
  mouthPressRight: '입술 누르기(오)',
  mouthPucker: '입 내밀기(뽀뽀)',
  mouthRight: '입 오른쪽으로',
  mouthRollLower: '아랫입술 말기',
  mouthRollUpper: '윗입술 말기',
  mouthShrugLower: '아랫입술 올림',
  mouthShrugUpper: '윗입술 올림',
  mouthSmileLeft: '왼쪽 미소',
  mouthSmileRight: '오른쪽 미소',
  mouthStretchLeft: '입 옆으로 당김(왼)',
  mouthStretchRight: '입 옆으로 당김(오)',
  mouthUpperUpLeft: '윗입술 들기(왼)',
  mouthUpperUpRight: '윗입술 들기(오)',
  noseSneerLeft: '코 찡그림(왼)',
  noseSneerRight: '코 찡그림(오)',
}

const HEAD_KO = ['고개 좌우 돌리기', '고개 끄덕이기(위아래)', '고개 기울이기'] as const
const HEAD_SCALE = 30 // 30° ≈ 블렌드쉐입 1.0 정도의 크기로 맞춤

export const FEATURE_LABELS: string[] = [...BLEND_NAMES.map((n) => BLEND_KO[n]), ...HEAD_KO]

export function blendVector(scores: Record<string, number>): number[] {
  return BLEND_NAMES.map((n) => scores[n] ?? 0)
}

export function customFeatures(sig: FaceSignals): number[] {
  return [...sig.blend, sig.yaw / HEAD_SCALE, sig.pitch / HEAD_SCALE, sig.roll / HEAD_SCALE]
}

/* ───────── 통계 ───────── */

export interface Stats {
  mean: number[]
  std: number[]
  n: number
}

export function stats(samples: number[][]): Stats {
  const n = samples.length
  const k = samples[0]?.length ?? 0
  const mean = new Array<number>(k).fill(0)
  for (const s of samples) for (let i = 0; i < k; i++) mean[i] += s[i] / n
  const v = new Array<number>(k).fill(0)
  for (const s of samples) for (let i = 0; i < k; i++) v[i] += (s[i] - mean[i]) ** 2 / n
  return { mean, std: v.map(Math.sqrt), n }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))]
}

/** 분산 하한: 평소에 거의 안 움직인 부위가 과하게 민감해지지 않도록 */
const VAR_FLOOR = 0.0015

export interface Direction {
  w: number[]
  norm: number
}

export function direction(neutral: Stats, gesture: Stats): Direction | null {
  const w = neutral.mean.map((m, i) => (gesture.mean[i] - m) / (neutral.std[i] ** 2 + gesture.std[i] ** 2 + VAR_FLOOR))
  const norm = w.reduce((a, wi, i) => a + wi * (gesture.mean[i] - neutral.mean[i]), 0)
  return norm > 1e-3 ? { w, norm } : null
}

/** 평소 자세 = 0, 녹화한 동작 = 1 */
export function scoreOf(f: number[], neutralMean: number[], dir: Direction): number {
  let s = 0
  for (let i = 0; i < f.length; i++) s += (f[i] - neutralMean[i]) * dir.w[i]
  return s / dir.norm
}

/* ───────── 학습 ───────── */

export interface Quality {
  /** 평소 자세 점수의 95퍼센타일 (낮을수록 좋음) */
  neutralP95: number
  /** 동작 점수의 25퍼센타일 (높을수록 좋음) */
  gestureP25: number
  /** 추천 임계값 */
  suggested: number
  /** 평소 움직임과 충분히 구분되는지 */
  ok: boolean
}

export interface LearnedGesture {
  stats: Stats
  dir: Direction
  quality: Quality
  /** 사람이 읽을 수 있는 설명: 가장 크게 달라진 부위들 */
  summary: string[]
}

export interface CustomModel {
  neutral: Stats
  next: LearnedGesture
  prev: LearnedGesture | null
  /** 이전 동작이 다음 동작으로 잘못 읽힐 위험 */
  confusable: boolean
  createdAt: number
}

export const MIN_NEUTRAL = 15
export const MIN_GESTURE = 8
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function describe(neutral: Stats, g: Stats, dir: Direction, top = 3): string[] {
  const contrib = dir.w.map((wi, i) => ({ i, c: (wi * (g.mean[i] - neutral.mean[i])) / dir.norm, delta: g.mean[i] - neutral.mean[i] }))
  return contrib
    .filter((x) => x.c > 0.08)
    .sort((a, b) => b.c - a.c)
    .slice(0, top)
    .map((x) => {
      const head = x.i >= BLEND_NAMES.length
      return head ? FEATURE_LABELS[x.i] : `${FEATURE_LABELS[x.i]} ${x.delta >= 0 ? '↑' : '↓'}`
    })
}

function learn(neutralSamples: number[][], neutral: Stats, gestureSamples: number[][]): LearnedGesture | null {
  if (gestureSamples.length < MIN_GESTURE) return null
  // 1차 방향으로 점수를 매겨, 아직 동작에 들어가기 전/풀린 프레임은 버림
  const first = direction(neutral, stats(gestureSamples))
  if (!first) return null
  const kept = gestureSamples.filter((f) => scoreOf(f, neutral.mean, first) >= 0.5)
  const use = kept.length >= MIN_GESTURE ? kept : gestureSamples
  const g = stats(use)
  const dir = direction(neutral, g)
  if (!dir) return null

  const nScores = neutralSamples.map((f) => scoreOf(f, neutral.mean, dir))
  const gScores = use.map((f) => scoreOf(f, neutral.mean, dir))
  const neutralP95 = percentile(nScores, 95)
  const gestureP25 = percentile(gScores, 25)
  const suggested = clamp((neutralP95 + gestureP25) / 2, 0.35, 0.8)
  return {
    stats: g,
    dir,
    quality: { neutralP95, gestureP25, suggested, ok: gestureP25 - neutralP95 >= 0.35 },
    summary: describe(neutral, g, dir),
  }
}

export function trainCustom(neutralSamples: number[][], nextSamples: number[][], prevSamples: number[][] | null, now = Date.now()): CustomModel | null {
  if (neutralSamples.length < MIN_NEUTRAL) return null
  const neutral = stats(neutralSamples)
  const next = learn(neutralSamples, neutral, nextSamples)
  if (!next) return null
  const prev = prevSamples && prevSamples.length ? learn(neutralSamples, neutral, prevSamples) : null
  // 이전 동작을 했을 때 "다음" 점수가 높게 나오면 헷갈릴 수 있음 (그 반대도)
  let confusable = false
  if (prev) {
    const prevOnNext = percentile(prevSamples!.map((f) => scoreOf(f, neutral.mean, next.dir)), 75)
    const nextOnPrev = percentile(nextSamples.map((f) => scoreOf(f, neutral.mean, prev.dir)), 75)
    confusable = prevOnNext > next.quality.suggested * 0.8 || nextOnPrev > prev.quality.suggested * 0.8
  }
  return { neutral, next, prev, confusable, createdAt: now }
}

/** 평소 자세만 다시 녹화했을 때: 동작 통계는 그대로 두고 방향·품질만 다시 계산 */
export function rebaseCustom(model: CustomModel, neutralSamples: number[][]): CustomModel | null {
  if (neutralSamples.length < MIN_NEUTRAL) return null
  const neutral = stats(neutralSamples)
  const redo = (g: LearnedGesture): LearnedGesture | null => {
    const dir = direction(neutral, g.stats)
    if (!dir) return null
    const neutralP95 = percentile(
      neutralSamples.map((f) => scoreOf(f, neutral.mean, dir)),
      95,
    )
    const gestureP25 = g.quality.gestureP25
    return {
      stats: g.stats,
      dir,
      quality: { neutralP95, gestureP25, suggested: clamp((neutralP95 + gestureP25) / 2, 0.35, 0.8), ok: gestureP25 - neutralP95 >= 0.35 },
      summary: describe(neutral, g.stats, dir),
    }
  }
  const next = redo(model.next)
  if (!next) return null
  return { ...model, neutral, next, prev: model.prev ? redo(model.prev) : null }
}

/** 평소 자세 점수의 퍼짐 (가우스 근사) — 원본 평소 자세 프레임 없이 동작 하나만 다시 학습할 때 */
function spreadOf(dir: Direction, s: Stats): number {
  let v = 0
  for (let i = 0; i < dir.w.length; i++) v += (dir.w[i] * s.std[i]) ** 2
  return Math.sqrt(v) / dir.norm
}

/**
 * 동작 하나만 (다시) 녹화해서 모델에 넣기 — 평소 자세·다른 동작은 그대로.
 * 예: 처음엔 다음 동작만 녹화했다가 나중에 이전 동작을 추가, 또는 다음 동작만 다시 녹화.
 * 평소 자세는 저장해 둔 통계(평균·분산)로 점수 분포를 근사한다.
 */
export function withGesture(model: CustomModel, kind: 'next' | 'prev', samples: number[][]): CustomModel | null {
  if (samples.length < MIN_GESTURE) return null
  const neutral = model.neutral
  const first = direction(neutral, stats(samples))
  if (!first) return null
  const kept = samples.filter((f) => scoreOf(f, neutral.mean, first) >= 0.5)
  const use = kept.length >= MIN_GESTURE ? kept : samples
  const g = stats(use)
  const dir = direction(neutral, g)
  if (!dir) return null
  const neutralP95 = 1.645 * spreadOf(dir, neutral)
  const gestureP25 = percentile(
    use.map((f) => scoreOf(f, neutral.mean, dir)),
    25,
  )
  const learned: LearnedGesture = {
    stats: g,
    dir,
    quality: { neutralP95, gestureP25, suggested: clamp((neutralP95 + gestureP25) / 2, 0.35, 0.8), ok: gestureP25 - neutralP95 >= 0.35 },
    summary: describe(neutral, g, dir),
  }
  const next = kind === 'next' ? learned : model.next
  const prev = kind === 'prev' ? learned : model.prev
  let confusable = false
  if (prev) {
    // a 동작을 했을 때 b 점수의 75퍼센타일 (가우스 근사)
    const cross = (a: LearnedGesture, b: LearnedGesture) => scoreOf(a.stats.mean, neutral.mean, b.dir) + 0.674 * spreadOf(b.dir, a.stats)
    confusable = cross(prev, next) > next.quality.suggested * 0.8 || cross(next, prev) > prev.quality.suggested * 0.8
  }
  return { ...model, next, prev, confusable }
}

/**
 * 판정기에 넣을 1차원 값: 다음 동작이면 +점수, 이전 동작이면 −점수.
 * 이전 동작을 녹화하지 않았으면 항상 0 이상.
 */
export function customValue(model: CustomModel, f: number[]): { d: number; next: number; prev: number | null } {
  const next = scoreOf(f, model.neutral.mean, model.next.dir)
  const prev = model.prev ? scoreOf(f, model.neutral.mean, model.prev.dir) : null
  if (prev !== null && prev > next && prev > 0) return { d: -prev, next, prev }
  return { d: Math.max(0, next), next, prev }
}
