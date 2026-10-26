import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnScheduler, type PendingTurn } from './turnScheduler'

describe('넘김 예약 (대기 시간)', () => {
  function setup() {
    vi.useFakeTimers()
    const turns: string[] = []
    const changes: (PendingTurn | null)[] = []
    const s = new TurnScheduler(
      (k) => turns.push(k),
      (p) => changes.push(p),
    )
    return { s, turns, changes }
  }
  afterEach(() => vi.useRealTimers())

  it('대기 0이면 바로 넘김', () => {
    const { s, turns } = setup()
    expect(s.request('next', 0)).toBe('turned')
    expect(turns).toEqual(['next'])
  })

  it('정한 시간 뒤에 넘김', () => {
    const { s, turns, changes } = setup()
    expect(s.request('next', 1500, 7)).toBe('scheduled')
    expect(s.pending).toMatchObject({ kind: 'next', logId: 7 })
    vi.advanceTimersByTime(1499)
    expect(turns).toEqual([])
    vi.advanceTimersByTime(1)
    expect(turns).toEqual(['next'])
    expect(s.pending).toBeNull()
    expect(changes.at(-1)).toBeNull()
  })

  it('기다리는 중 같은 방향 제스처는 무시 (한 번만 넘김)', () => {
    const { s, turns } = setup()
    s.request('next', 1000)
    vi.advanceTimersByTime(500)
    expect(s.request('next', 1000)).toBe('ignored')
    vi.advanceTimersByTime(600)
    expect(turns).toEqual(['next'])
  })

  it('반대 방향 제스처로 취소', () => {
    const { s, turns } = setup()
    s.request('next', 1000)
    expect(s.request('prev', 1000)).toBe('cancelled')
    vi.advanceTimersByTime(2000)
    expect(turns).toEqual([])
  })

  it('취소 버튼 · Esc', () => {
    const { s, turns } = setup()
    s.request('prev', 1000, 3)
    expect(s.cancel()?.logId).toBe(3)
    expect(s.cancel()).toBeNull()
    vi.advanceTimersByTime(2000)
    expect(turns).toEqual([])
  })
})
