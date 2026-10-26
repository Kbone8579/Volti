import { describe, expect, it } from 'vitest'
import { BLEND_NAMES, customValue, FEATURE_LABELS, rebaseCustom, trainCustom, withGesture } from './customGesture'

describe('내 동작 (커스텀 제스처)', () => {
  const K = BLEND_NAMES.length + 3
  const idx = (name: string) => BLEND_NAMES.indexOf(name as (typeof BLEND_NAMES)[number])
  let r = 5
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5) * 2

  /** 평소 연주: 눈동자는 악보를 따라 크게 움직이고, 고개는 조금 흔들림 */
  const playing = () => {
    const f = new Array<number>(K).fill(0).map(() => 0.03 + 0.02 * rand())
    f[idx('eyeLookDownLeft')] = 0.4 + 0.3 * rand()
    f[idx('eyeLookOutRight')] = 0.3 + 0.3 * rand()
    f[idx('jawOpen')] = 0.1 + 0.08 * rand() // 관악기면 입이 조금씩 움직임
    f[K - 3] = 0.15 * rand() // 고개 좌우 ±4.5°
    f[K - 2] = 0.1 * rand()
    return f
  }
  const with_ = (base: number[], changes: Record<string, number>) => {
    const f = [...base]
    for (const [k, v] of Object.entries(changes)) f[idx(k)] = v + 0.05 * rand()
    return f
  }
  const many = (n: number, make: () => number[]) => Array.from({ length: n }, make)

  it('눈썹 올리기를 다음, 볼 부풀리기를 이전으로 학습', () => {
    const neutral = many(70, playing)
    const next = many(45, () => with_(playing(), { browInnerUp: 0.75, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 }))
    const prev = many(45, () => with_(playing(), { cheekPuff: 0.7 }))
    const m = trainCustom(neutral, next, prev)!
    expect(m).not.toBeNull()
    expect(m.next.quality.ok).toBe(true)
    expect(m.next.summary[0]).toMatch(/눈썹/)
    expect(m.prev!.summary[0]).toBe('볼 부풀리기 ↑')
    expect(m.confusable).toBe(false)

    // 새로 연주하는 동안의 점수는 임계값 아래
    const fresh = many(200, playing).map((f) => customValue(m, f).d)
    expect(Math.max(...fresh)).toBeLessThan(m.next.quality.suggested)
    // 동작을 하면 임계값 위 (+ / −)
    expect(customValue(m, with_(playing(), { browInnerUp: 0.75, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 })).d).toBeGreaterThan(0.7)
    expect(customValue(m, with_(playing(), { cheekPuff: 0.7 })).d).toBeLessThan(-0.7)
  })

  it('이전 동작 없이 학습하면 음수가 나오지 않음', () => {
    const m = trainCustom(many(60, playing), many(40, () => with_(playing(), { mouthPucker: 0.8 })), null)!
    expect(m.prev).toBeNull()
    expect(customValue(m, with_(playing(), { mouthPucker: 0 })).d).toBeGreaterThanOrEqual(0)
  })

  it('평소 움직임과 같은 동작(악보 읽는 눈동자)은 구분 불가로 표시', () => {
    const m = trainCustom(many(60, playing), many(40, () => with_(playing(), { eyeLookDownLeft: 0.75 })), null)
    expect(m === null || !m.next.quality.ok).toBe(true)
  })

  it('녹화가 너무 짧으면 실패', () => {
    expect(trainCustom(many(5, playing), many(40, playing), null)).toBeNull()
  })

  it('고개 동작도 학습 · 설명', () => {
    const nod = () => {
      const f = playing()
      f[K - 2] = 0.6 + 0.05 * rand()
      return f
    }
    const m = trainCustom(many(60, playing), many(40, nod), null)!
    expect(m.next.summary[0]).toBe(FEATURE_LABELS[K - 2])
  })

  it('다음만 녹화한 뒤 이전 동작만 따로 추가 · 다음 동작만 다시 녹화', () => {
    const brows = () => with_(playing(), { browInnerUp: 0.75, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 })
    const m = trainCustom(many(70, playing), many(45, brows), null)!
    expect(m.prev).toBeNull()

    // 이전 동작(볼 부풀리기)만 추가 — 평소 자세를 다시 녹화하지 않아도 됨
    const added = withGesture(m, 'prev', many(45, () => with_(playing(), { cheekPuff: 0.7 })))!
    expect(added.prev!.summary[0]).toBe('볼 부풀리기 ↑')
    expect(added.prev!.quality.ok).toBe(true)
    expect(added.next).toBe(m.next) // 다음 동작은 그대로
    expect(added.confusable).toBe(false)
    expect(customValue(added, with_(playing(), { cheekPuff: 0.7 })).d).toBeLessThan(-0.7)
    expect(customValue(added, brows()).d).toBeGreaterThan(0.7)
    const fresh = many(200, playing).map((f) => Math.abs(customValue(added, f).d))
    expect(Math.max(...fresh)).toBeLessThan(added.prev!.quality.suggested)

    // 다음 동작만 입 내밀기로 다시 녹화 → 이전 동작은 그대로
    const redone = withGesture(added, 'next', many(45, () => with_(playing(), { mouthPucker: 0.8 })))!
    expect(redone.next.summary[0]).toMatch(/입 내밀기/)
    expect(redone.prev).toBe(added.prev)

    // 이전 동작을 다음 동작과 똑같이 하면 헷갈림 표시
    expect(withGesture(m, 'prev', many(45, brows))!.confusable).toBe(true)
    // 너무 짧거나 평소와 같으면 실패
    expect(withGesture(m, 'prev', many(3, brows))).toBeNull()
  })

  it('평소 자세 다시 녹화', () => {
    const m = trainCustom(many(60, playing), many(40, () => with_(playing(), { cheekPuff: 0.7 })), null)!
    const shifted = many(60, () => {
      const f = playing()
      f[K - 3] += 0.3 // 몸 방향이 바뀜
      return f
    })
    const re = rebaseCustom(m, shifted)!
    expect(re.neutral.mean[K - 3]).toBeGreaterThan(0.2)
    expect(re.next.summary[0]).toBe('볼 부풀리기 ↑')
  })
})
