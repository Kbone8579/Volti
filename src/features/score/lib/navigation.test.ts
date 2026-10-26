import { describe, expect, it } from 'vitest'
import { maxStart, nextIndex, normalizeIndex, pageLabel, prevIndex } from './navigation'

describe('navigation', () => {
  const single = { pageCount: 5, spread: false, spreadStep: 2 as const }
  const book = { pageCount: 5, spread: true, spreadStep: 2 as const }
  const slide = { pageCount: 5, spread: true, spreadStep: 1 as const }

  it('한 페이지: 1장씩, 끝에서 멈춤', () => {
    expect(nextIndex(0, single)).toBe(1)
    expect(nextIndex(4, single)).toBe(4)
    expect(prevIndex(0, single)).toBe(0)
  })

  it('펼치기 2장씩: 1-2 → 3-4 → 5', () => {
    expect(maxStart(book)).toBe(4)
    expect(nextIndex(0, book)).toBe(2)
    expect(nextIndex(2, book)).toBe(4)
    expect(nextIndex(4, book)).toBe(4)
    expect(pageLabel(2, book)).toBe('3–4 / 5')
    expect(pageLabel(4, book)).toBe('5 / 5')
  })

  it('펼치기 1장씩: 1-2 → 2-3 … 4-5에서 멈춤', () => {
    expect(nextIndex(0, slide)).toBe(1)
    expect(nextIndex(3, slide)).toBe(3)
    expect(prevIndex(3, slide)).toBe(2)
  })

  it('펼치기 2장씩으로 바꾸면 짝수로 정렬', () => {
    expect(normalizeIndex(3, book)).toBe(2)
    expect(normalizeIndex(3, single)).toBe(3)
  })
})
