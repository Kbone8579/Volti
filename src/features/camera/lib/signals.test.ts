import { describe, expect, it } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { anglesFromMatrix, extractSignals, modeValue } from './signals'

describe('anglesFromMatrix', () => {
  /** column-major 4x4: y축 기준 회전 (theta, 라디안) */
  const rotY = (theta: number) => {
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    // 행렬 [[c,0,s],[0,1,0],[-s,0,c]] 을 열 우선으로
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1]
  }

  it('정면은 0도', () => {
    const a = anglesFromMatrix(rotY(0))
    expect(a.yaw).toBeCloseTo(0)
    expect(a.pitch).toBeCloseTo(0)
  })

  it('y축 회전 크기를 각도로 복원', () => {
    expect(Math.abs(anglesFromMatrix(rotY((25 * Math.PI) / 180)).yaw)).toBeCloseTo(25)
    // 반대로 돌리면 부호가 반대
    const a = anglesFromMatrix(rotY(0.3)).yaw
    const b = anglesFromMatrix(rotY(-0.3)).yaw
    expect(Math.sign(a)).toBe(-Math.sign(b))
  })
})


describe('extractSignals', () => {
  const fakeResult = (theta: number, scores: Record<string, number>): FaceLandmarkerResult => {
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    return {
      faceLandmarks: [Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))],
      faceBlendshapes: [
        {
          headIndex: 0,
          headName: '',
          categories: Object.entries(scores).map(([categoryName, score], index) => ({ categoryName, score, index, displayName: '' })),
        },
      ],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1] }],
    }
  }

  it('얼굴이 없으면 null', () => {
    expect(extractSignals({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] })).toBeNull()
  })

  it('블렌드쉐입 이름을 모드 신호로 매핑', () => {
    const sig = extractSignals(fakeResult(0.4, { mouthRight: 0.7, mouthLeft: 0.1, eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05 }))!
    expect(Math.abs(modeValue(sig, 'head'))).toBeCloseTo((0.4 * 180) / Math.PI)
    expect(modeValue(sig, 'mouth')).toBeCloseTo(0.6)
    expect(modeValue(sig, 'wink')).toBeCloseTo(-0.85)
  })

  it('양쪽 눈을 같이 감는 깜빡임은 윙크 신호가 0 근처', () => {
    const sig = extractSignals(fakeResult(0, { eyeBlinkLeft: 0.95, eyeBlinkRight: 0.9 }))!
    expect(Math.abs(modeValue(sig, 'wink'))).toBeLessThan(0.1)
  })
})
