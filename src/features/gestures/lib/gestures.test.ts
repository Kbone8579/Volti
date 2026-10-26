import { describe, expect, it } from 'vitest'
import { GestureDetector, type DetectorParams } from './gestureDetector'
import { calibrateGesture, median } from './calibration'

const P: DetectorParams = { threshold: 10, holdMs: 300, cooldownMs: 1000, forwardOnly: false }

/** 33ms 간격(약 30fps)으로 값 시퀀스를 흘려보내고 발생한 이벤트를 모은다 */
function run(det: GestureDetector, values: (number | null)[], params = P, start = 0) {
  const events: string[] = []
  values.forEach((v, i) => {
    const r = det.update(v, start + i * 33, params)
    if (r.event) events.push(r.event.kind)
  })
  return events
}

const repeat = (v: number | null, n: number) => Array<number | null>(n).fill(v)

describe('GestureDetector', () => {
  it('임계값 아래 움직임은 무시', () => {
    expect(run(new GestureDetector(), repeat(9, 60))).toEqual([])
  })

  it('임계값을 holdMs 이상 유지하면 한 번 넘김', () => {
    expect(run(new GestureDetector(), [...repeat(0, 5), ...repeat(15, 15)])).toEqual(['next'])
  })

  it('유지 시간 전에 풀리면 넘기지 않음', () => {
    expect(run(new GestureDetector(), [...repeat(15, 5), ...repeat(0, 10), ...repeat(15, 5)])).toEqual([])
  })

  it('계속 돌린 채로 있어도 한 번만 넘김 (중립 복귀 필요)', () => {
    expect(run(new GestureDetector(), repeat(15, 200))).toEqual(['next'])
  })

  it('쿨다운 후 중립으로 돌아왔다가 다시 하면 또 넘김', () => {
    const seq = [...repeat(15, 12), ...repeat(0, 40), ...repeat(15, 12)]
    expect(run(new GestureDetector(), seq)).toEqual(['next', 'next'])
  })

  it('쿨다운 중에는 중립 복귀해도 넘기지 않음', () => {
    const seq = [...repeat(15, 12), ...repeat(0, 3), ...repeat(15, 12)]
    expect(run(new GestureDetector(), seq)).toEqual(['next'])
  })

  it('앞으로만 모드에선 반대 방향 무시', () => {
    expect(run(new GestureDetector(), repeat(-15, 30), { ...P, forwardOnly: true })).toEqual([])
    expect(run(new GestureDetector(), repeat(-15, 30))).toEqual(['prev'])
  })

  it('얼굴을 놓치면 유지 취소', () => {
    const seq = [...repeat(15, 6), null, ...repeat(15, 6)]
    expect(run(new GestureDetector(), seq)).toEqual([])
  })

  it('유지 중 약간의 떨림(85%까지)은 허용', () => {
    const seq = [15, 15, 9, 15, 9, 15, 15, 15, 15, 15, 15, 15]
    expect(run(new GestureDetector(), seq)).toEqual(['next'])
  })
})

describe('calibrateGesture', () => {
  it('중앙값', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })

  it('왼쪽(음수)으로 한 동작은 direction -1', () => {
    const samples = [...repeat(2, 20), ...repeat(-28, 50)] as number[]
    const c = calibrateGesture(samples, 2, 5, 40)
    expect(c?.direction).toBe(-1)
    expect(c!.threshold).toBeCloseTo(18, 0)
  })

  it('동작이 너무 작으면 실패', () => {
    expect(calibrateGesture(repeat(3, 60) as number[], 0, 5, 40)).toBeNull()
  })

  it('샘플이 부족하면 실패', () => {
    expect(calibrateGesture([30, 30], 0, 5, 40)).toBeNull()
  })
})
