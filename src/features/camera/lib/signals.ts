import type { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { GestureMode } from '@/features/settings'
import { blendVector } from '@/features/custom-gesture'

/**
 * 한 프레임에서 뽑아낸 얼굴 신호.
 * 부호 규칙: 모든 좌우 신호는 "연주자 본인 기준 오른쪽 = +" 로 맞춤.
 * (실제 방향은 캘리브레이션이 다시 정해주므로 부호가 틀려도 동작에는 문제 없음)
 */
export interface FaceSignals {
  yaw: number // 고개 좌우 회전 (도)
  pitch: number // 고개 위아래 (도, 위 = +)
  roll: number // 고개 기울기 (도)
  mouthSide: number // mouthRight - mouthLeft (-1..1)
  wink: number // eyeBlinkRight - eyeBlinkLeft (-1..1)
  blinkL: number
  blinkR: number
  mouthL: number
  mouthR: number
  jawOpen: number
  /** 시선용: 눈 안에서 홍채의 가로 위치 (눈 가운데 = 0, 영상 오른쪽 = +) */
  irisH: number
  /** 시선용: 눈 가로선 기준 홍채의 세로 위치 (아래 = +) */
  irisV: number
  /** 시선용 블렌드쉐입: 연주자 기준 오른쪽을 보면 + */
  lookH: number
  /** 시선용 블렌드쉐입: 위를 보면 + */
  lookV: number
  /** 표정 수치 51개 (customGesture.BLEND_NAMES 순서) — 내 동작 학습용 */
  blend: number[]
}

const RAD = 180 / Math.PI

/**
 * MediaPipe 얼굴 변환 행렬(4x4, column-major)에서 머리 각도를 계산.
 * 얼굴의 정면 벡터 = 회전행렬의 3번째 열.
 */
export function anglesFromMatrix(data: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
  const at = (row: number, col: number) => data[col * 4 + row]
  const fx = at(0, 2)
  const fy = at(1, 2)
  const fz = at(2, 2)
  // 카메라 좌표계: x = 영상 오른쪽(= 연주자의 왼쪽). 연주자가 자기 오른쪽으로 돌면 fx < 0 → yaw > 0
  const yaw = -Math.atan2(fx, fz) * RAD
  const pitch = Math.atan2(fy, Math.hypot(fx, fz)) * RAD
  const roll = Math.atan2(at(1, 0), at(0, 0)) * RAD
  return { yaw, pitch, roll }
}

/** 행렬이 없을 때의 대략적인 고개 각도 (코끝이 양 볼 사이 어디에 있는지로 추정) */
export function yawFromLandmarks(lm: NormalizedLandmark[]): number {
  const nose = lm[1]
  const left = lm[234] // 영상 기준 왼쪽 볼 (연주자의 오른쪽)
  const right = lm[454]
  if (!nose || !left || !right) return 0
  const half = (right.x - left.x) / 2
  if (Math.abs(half) < 1e-6) return 0
  const mid = (left.x + right.x) / 2
  const ratio = Math.max(-1, Math.min(1, (nose.x - mid) / half / 0.75))
  // 연주자가 오른쪽으로 돌면 코끝이 영상 왼쪽으로 → ratio < 0 → yaw > 0
  return -Math.asin(ratio) * RAD
}

/**
 * 한쪽 눈에서 홍채가 어디 있는지. a→b 는 영상 기준 왼쪽 눈꼬리 → 오른쪽 눈꼬리.
 * h: 눈꼬리 사이에서의 위치(0..1), v: 눈 가로선에서 수직으로 떨어진 정도(눈 너비 대비)
 * aspect: 영상 가로/세로 비 (랜드마크 x, y가 각각 0..1로 정규화돼 있어서 보정)
 */
export function irisInEye(lm: NormalizedLandmark[], a: number, b: number, iris: number, aspect: number) {
  const ax = lm[a].x * aspect
  const ay = lm[a].y
  const ex = lm[b].x * aspect - ax
  const ey = lm[b].y - ay
  const len2 = ex * ex + ey * ey
  if (len2 < 1e-9) return { h: 0.5, v: 0 }
  const ix = lm[iris].x * aspect - ax
  const iy = lm[iris].y - ay
  return { h: (ix * ex + iy * ey) / len2, v: (ex * iy - ey * ix) / len2 }
}

export function extractSignals(result: FaceLandmarkerResult, aspect = 4 / 3): FaceSignals | null {
  const lm = result.faceLandmarks?.[0]
  if (!lm || lm.length === 0) return null

  const scores: Record<string, number> = {}
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) scores[c.categoryName] = c.score
  const s = (name: string) => scores[name] ?? 0

  const matrix = result.facialTransformationMatrixes?.[0]
  const angles =
    matrix && matrix.data.length >= 16
      ? anglesFromMatrix(matrix.data)
      : { yaw: yawFromLandmarks(lm), pitch: 0, roll: 0 }

  // 홍채 랜드마크(468~477)가 있을 때만. 연주자의 오른눈(영상 왼쪽): 33→133, 홍채 468 / 왼눈: 362→263, 홍채 473
  let irisH = 0
  let irisV = 0
  if (lm.length >= 478) {
    const r = irisInEye(lm, 33, 133, 468, aspect)
    const l = irisInEye(lm, 362, 263, 473, aspect)
    irisH = (r.h + l.h) / 2 - 0.5
    irisV = (r.v + l.v) / 2
  }

  return {
    ...angles,
    irisH,
    irisV,
    lookH: (s('eyeLookOutRight') + s('eyeLookInLeft') - s('eyeLookInRight') - s('eyeLookOutLeft')) / 2,
    lookV: (s('eyeLookUpLeft') + s('eyeLookUpRight') - s('eyeLookDownLeft') - s('eyeLookDownRight')) / 2,
    blend: blendVector(scores),
    mouthSide: s('mouthRight') - s('mouthLeft'),
    wink: s('eyeBlinkRight') - s('eyeBlinkLeft'),
    blinkL: s('eyeBlinkLeft'),
    blinkR: s('eyeBlinkRight'),
    mouthL: s('mouthLeft'),
    mouthR: s('mouthRight'),
    jawOpen: s('jawOpen'),
  }
}

/** 현재 모드가 보는 원시 신호 하나 */
export function modeValue(sig: FaceSignals, mode: GestureMode): number {
  switch (mode) {
    case 'head':
      return sig.yaw
    case 'mouth':
      return sig.mouthSide
    case 'wink':
      return sig.wink
    case 'gaze':
      // 시선은 1차원 값이 아니라 화면 좌표로 판정 (gaze.ts). 표시용으로 가로 시선만 돌려줌
      return sig.lookH
    case 'custom':
      // 내 동작은 학습된 모델이 필요 (customGesture.customValue)
      return 0
  }
}
