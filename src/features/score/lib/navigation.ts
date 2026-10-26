/** 페이지 이동 계산 (순수 함수). index = 화면에 보이는 첫 페이지(0부터). */

export interface NavState {
  pageCount: number
  spread: boolean
  /** 펼치기에서 한 번에 넘길 장 수 */
  spreadStep: 1 | 2
}

export function stepOf(s: NavState): number {
  return s.spread ? s.spreadStep : 1
}

/** 보일 수 있는 마지막 시작 인덱스 */
export function maxStart(s: NavState): number {
  if (s.pageCount <= 0) return 0
  if (!s.spread) return s.pageCount - 1
  if (s.spreadStep === 2) return Math.floor((s.pageCount - 1) / 2) * 2
  return Math.max(0, s.pageCount - 2)
}

/** 펼치기(두 장씩)일 때는 짝수 인덱스(1-2, 3-4 …)로 맞춤 */
export function normalizeIndex(index: number, s: NavState): number {
  let i = Math.max(0, Math.min(index, maxStart(s)))
  if (s.spread && s.spreadStep === 2) i -= i % 2
  return i
}

export function nextIndex(index: number, s: NavState): number {
  return normalizeIndex(Math.min(index + stepOf(s), maxStart(s)), s)
}

export function prevIndex(index: number, s: NavState): number {
  return normalizeIndex(Math.max(0, index - stepOf(s)), s)
}

export function visibleIndices(index: number, s: NavState): number[] {
  if (s.pageCount <= 0) return []
  const out = [index]
  if (s.spread && index + 1 < s.pageCount) out.push(index + 1)
  return out
}

export function pageLabel(index: number, s: NavState): string {
  if (s.pageCount <= 0) return '–'
  const vis = visibleIndices(index, s)
  const range = vis.length === 2 ? `${vis[0] + 1}–${vis[1] + 1}` : `${vis[0] + 1}`
  return `${range} / ${s.pageCount}`
}
