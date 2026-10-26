import { describe, expect, it } from 'vitest'
import {
  carryView,
  clampView,
  fitSize,
  initialView,
  nextStep,
  overflow,
  pinchView,
  resolveZoom,
  stepView,
  viewAfterTurn,
  wheelFactor,
  zoomAt,
  zoomLabel,
  type View,
} from './zoom'

const VP = { w: 1000, h: 800 }
const A4 = 1 / Math.SQRT2 // 세로 악보 한 장
const fit = fitSize(VP, A4) // 높이에 맞춤: h = 780

describe('확대/축소 계산', () => {
  it('화면 맞춤 크기', () => {
    expect(fit.h).toBeCloseTo(780)
    expect(fit.w).toBeCloseTo(780 * A4)
    // 펼치기(두 장)는 가로가 길어서 너비에 맞춤
    expect(fitSize(VP, A4 * 2).w).toBeCloseTo(980)
  })

  it('너비 맞춤 배율', () => {
    const z = resolveZoom('width', VP, fit)
    expect(fit.w * z).toBeCloseTo(980)
    expect(resolveZoom(9, VP, fit)).toBe(4) // 최대 400%
    expect(resolveZoom(0.1, VP, fit)).toBe(0.5)
  })

  it('작으면 가운데, 크면 빈틈 없게', () => {
    const small = clampView({ z: 1, x: 0, y: 0 }, VP, fit)
    expect(small.x).toBeCloseTo((1000 - fit.w) / 2)
    expect(small.y).toBeCloseTo(10)
    const big = clampView({ z: 2, x: 500, y: -5000 }, VP, fit)
    expect(big.y).toBeCloseTo(800 - 10 - fit.h * 2) // 맨 아래까지만
    expect(big.x).toBeLessThanOrEqual(10)
  })

  it('커서 위치를 기준으로 확대', () => {
    const v = initialView(1, VP, fit)
    const focal = { x: v.x + fit.w * 0.5, y: v.y + fit.h * 0.4 }
    const z2 = zoomAt(v, 2, focal, VP, fit)
    // 같은 악보 지점(가로 50%, 세로 40%)이 여전히 커서 아래
    expect((focal.x - z2.x) / (fit.w * 2)).toBeCloseTo(0.5, 2)
    expect((focal.y - z2.y) / (fit.h * 2)).toBeCloseTo(0.4, 2)
    // 가장자리 근처에서 확대하면 빈틈이 생기지 않게 보정됨
    const edge = zoomAt(v, 2, { x: v.x + 5, y: v.y + 5 }, VP, fit)
    expect(edge.x).toBeLessThanOrEqual(10)
    expect(edge.y).toBeLessThanOrEqual(10)
  })

  it('두 손가락 핀치: 벌리면 커지고, 중심을 따라 이동', () => {
    const v0 = zoomAt(initialView(1, VP, fit), 2, { x: 500, y: 400 }, VP, fit)
    const v = pinchView(v0, 1.5, { x: 500, y: 400 }, { x: 450, y: 380 }, VP, fit)
    expect(v.z).toBeCloseTo(3)
    expect(v.x).toBeLessThan(v0.x)
  })

  it('확대 상태에서 다음: 아래로 이동 → 끝이면 null (페이지 넘김)', () => {
    let v: View | null = initialView(2, VP, fit)
    expect(overflow(v, VP, fit).y).toBe(true)
    let moves = 0
    while ((v = stepView(v!, 'next', VP, fit))) {
      moves++
      if (moves > 10) break
    }
    expect(moves).toBe(2) // 1560px 페이지를 780px 화면으로 → 두 번 내려가면 끝
  })

  it('이전: 위로 이동 → 맨 위면 null', () => {
    const bottom = viewAfterTurn(initialView(2, VP, fit), 'prev', VP, fit)
    expect(bottom.y).toBeCloseTo(800 - 10 - fit.h * 2)
    expect(stepView(bottom, 'prev', VP, fit)).not.toBeNull()
    expect(stepView(initialView(2, VP, fit), 'prev', VP, fit)).toBeNull()
  })

  it('화면 맞춤이면 이동 없이 바로 넘김', () => {
    expect(stepView(initialView(1, VP, fit), 'next', VP, fit)).toBeNull()
  })

  it('넘긴 뒤 위치: 다음은 맨 위, 가로 위치는 유지', () => {
    const v = clampView({ z: 2.5, x: -300, y: -900 }, VP, fit)
    const after = viewAfterTurn(v, 'next', VP, fit)
    expect(after.y).toBeCloseTo(10)
    expect(after.x).toBeCloseTo(v.x)
  })

  it('넘긴 뒤 위치 유지: 같은 크기면 그대로, 비율이 다르면 보던 부분을 비율로', () => {
    const v = clampView({ z: 2, x: -200, y: -500 }, VP, fit)
    // 같은 크기 페이지 → 픽셀까지 그대로
    expect(carryView(v, fit, fit, VP)).toEqual(v)
    // 세로가 조금 짧은 페이지 → 화면 가운데에 있던 지점(비율)이 계속 가운데
    const tall = { w: fit.w, h: 700 }
    const c = carryView(v, fit, tall, VP)
    expect(c.y).not.toBeCloseTo(v.y)
    const ratio = (vv: View, f: typeof fit) => ((VP.h / 2 - vv.y) / (f.h * vv.z))
    expect(ratio(c, tall)).toBeCloseTo(ratio(v, fit), 3)
    expect(c.z).toBe(2)
    // 맨 아래에 붙어 있었으면 새 페이지에서도 맨 아래
    const bottom = clampView({ z: 2, x: -200, y: -9999 }, VP, fit)
    const cb = carryView(bottom, fit, tall, VP)
    expect(cb.y).toBeCloseTo(VP.h - 10 - tall.h * 2)
    // 맨 위면 맨 위
    expect(carryView(initialView(2, VP, fit), fit, tall, VP).y).toBeCloseTo(10)
  })

  it('버튼 단계 · 표시 · 휠', () => {
    expect(nextStep(1, 1)).toBe(1.1)
    expect(nextStep(1, -1)).toBe(0.9)
    expect(nextStep(1.3, 1)).toBe(1.5)
    expect(nextStep(4, 1)).toBe(4)
    expect(zoomLabel(1.5, 1.5)).toBe('150%')
    expect(zoomLabel('width', 1.38)).toBe('너비 138%')
    expect(wheelFactor(-100, 0, false)).toBeGreaterThan(1)
    expect(wheelFactor(100, 0, false)).toBeLessThan(1)
    expect(wheelFactor(-3, 1, false)).toBeCloseTo(wheelFactor(-48, 0, false))
  })
})
