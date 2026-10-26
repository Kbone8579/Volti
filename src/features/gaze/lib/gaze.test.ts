import { describe, expect, it } from 'vitest'
import { calibrationPoints, correctOffset, fitGaze, GazeSmoother, inNextZone, predictGaze, solveLinear, type GazeSample } from './gaze'

describe('gaze', () => {
  it('연립방정식 풀이', () => {
    const x = solveLinear(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    )!
    expect(x[0]).toBeCloseTo(1)
    expect(x[1]).toBeCloseTo(3)
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })

  /** 시선(정규화 좌표) → 특징을 선형으로 만들고 노이즈를 섞은 가짜 캘리브레이션 데이터 */
  function synth(noise = 0.004, seed = 3) {
    let r = seed
    const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5) * 2
    const pts = calibrationPoints({ left: 0, top: 0, width: 1, height: 1 })
    const samples: GazeSample[] = []
    const feat = (x: number, y: number) => [
      0.12 * (x - 0.5) + noise * rand(), // 홍채 좌우
      0.05 * (y - 0.5) + noise * rand(), // 홍채 상하
      -0.6 * (x - 0.5) + noise * 5 * rand(), // 블렌드 좌우 (부호 반대여도 OK)
      -0.4 * (y - 0.5) + noise * 5 * rand(),
      2 * rand(), // 머리는 시선과 무관하게 조금 흔들림
      2 * rand(),
    ]
    for (const p of pts) for (let k = 0; k < 15; k++) samples.push({ f: feat(p.x, p.y), x: p.x, y: p.y })
    return { samples, feat }
  }

  it('9점 캘리브레이션으로 시선을 복원', () => {
    const { samples, feat } = synth()
    const m = fitGaze(samples, { w: 1440, h: 900 })!
    expect(m).not.toBeNull()
    expect(m.errorPx).toBeLessThan(60)
    const p = predictGaze(m, feat(0.85, 0.9))
    expect(p.x).toBeCloseTo(0.85, 1)
    expect(p.y).toBeCloseTo(0.9, 1)
  })

  it('샘플이 부족하면 실패', () => {
    expect(fitGaze(synth().samples.slice(0, 10), { w: 100, h: 100 })).toBeNull()
  })

  it('빠른 보정은 오프셋만 바꿈', () => {
    const { samples } = synth()
    const m = fitGaze(samples, { w: 1440, h: 900 })!
    const fixed = correctOffset(m, Array(10).fill({ x: 0.7, y: 0.8 }), { x: 0.9, y: 0.95 })!
    expect(fixed.offsetX).toBeCloseTo(0.2)
    expect(fixed.offsetY).toBeCloseTo(0.15)
    expect(fixed.wx).toBe(m.wx)
  })

  it('오른쪽 아래 구역 판정', () => {
    const rect = { left: 0, top: 50, width: 1000, height: 800 }
    expect(inNextZone({ x: 950, y: 800 }, rect, 'medium')).toBe(true)
    expect(inNextZone({ x: 500, y: 800 }, rect, 'medium')).toBe(false) // 마지막 줄 가운데
    expect(inNextZone({ x: 950, y: 300 }, rect, 'medium')).toBe(false) // 오른쪽 위
    expect(inNextZone({ x: 1100, y: 860 }, rect, 'medium')).toBe(true) // 살짝 바깥
    expect(inNextZone({ x: 950, y: 1200 }, rect, 'medium')).toBe(false) // 한참 아래 (악기 보기)
    expect(inNextZone({ x: 780, y: 700 }, rect, 'small')).toBe(false)
    expect(inNextZone({ x: 780, y: 700 }, rect, 'large')).toBe(true)
  })

  it('스무딩: 튀는 값을 누그러뜨리고, 오래 끊기면 새로 시작', () => {
    const s = new GazeSmoother(0.5, 500)
    s.update({ x: 0, y: 0 }, 0)
    expect(s.update({ x: 100, y: 0 }, 66).x).toBeCloseTo(50)
    expect(s.update({ x: 100, y: 0 }, 2000).x).toBe(100)
  })
})
