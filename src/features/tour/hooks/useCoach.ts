import { useEffect, useState, type RefObject } from 'react'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}
/**
 * 안내 카드 위치
 * - side: 오른쪽 패널의 해당 부분 바로 왼쪽, 같은 높이 (화살표가 가리킴)
 * - below: 툴바 버튼 바로 아래
 * - top: 좁은 화면(패널이 아래) — 악보 영역 맨 위
 */
export type Place =
  | { mode: 'side'; top: number; right: number; maxW: number; maxH: number; arrow: number }
  | { mode: 'below'; top: number; left: number; arrow: number }
  | { mode: 'top' }

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.max(lo, Math.min(hi, v)))
const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1)
const samePlace = (a: Place, b: Place) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 안내 카드를 붙일 위치 계산 — 대상 요소(selector)의 위치를 매 프레임 읽어서
 * 테두리(ring) 위치와 카드 위치(place)를 돌려줌. 대상이 바뀌면 화면 안으로 스크롤.
 */
export function useCoach(selector: string | null, card: RefObject<HTMLDivElement | null>) {
  const [ring, setRing] = useState<Box | null>(null)
  const [place, setPlace] = useState<Place>({ mode: 'top' })
  useEffect(() => {
    setRing(null)
    if (!selector) return
    document.querySelector(selector)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    let lastRing: Box | null = null
    let lastPlace: Place = { mode: 'top' }
    let id = 0
    const raf = typeof window.requestAnimationFrame === 'function'
    const tick = () => {
      const r = document.querySelector(selector)?.getBoundingClientRect()
      const box = r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
      if (!sameBox(box, lastRing)) setRing((lastRing = box))

      const vw = window.innerWidth
      const vh = window.innerHeight
      const ch = card.current?.offsetHeight || 300
      const cw = card.current?.offsetWidth || 380
      const barBottom = document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 56
      const panel = document.querySelector('.panel-wrap')?.getBoundingClientRect()
      const tab = document.querySelector('.panel-tab')?.getBoundingClientRect()
      let next: Place = { mode: 'top' }
      if (box && panel && vw > 760 && panel.width > 40 && panel.left > vw * 0.35 && box.left >= panel.left - 1) {
        // 패널(오른쪽) 안의 요소 → 그 왼쪽에, 같은 높이로
        const edge = Math.min(panel.left, tab && tab.width > 0 ? tab.left : panel.left)
        const cy = box.top + box.height / 2
        const maxH = vh - barBottom - 24
        const h = Math.min(ch, maxH)
        const top = clamp(cy - h / 2, barBottom + 12, vh - h - 12)
        next = { mode: 'side', top: Math.round(top), right: Math.round(vw - edge + 14), maxW: Math.round(edge - 28), maxH: Math.round(maxH), arrow: Math.round(clamp(cy - top, 22, h - 22)) }
      } else if (box && box.top + box.height < barBottom + 4 && vw > 480) {
        // 툴바 버튼 → 바로 아래
        const cx = box.left + box.width / 2
        const left = clamp(cx - cw / 2, 12, vw - cw - 12)
        next = { mode: 'below', top: Math.round(box.top + box.height + 14), left: Math.round(left), arrow: Math.round(clamp(cx - left, 22, cw - 22)) }
      }
      if (!samePlace(next, lastPlace)) setPlace((lastPlace = next))
      id = raf ? requestAnimationFrame(tick) : window.setTimeout(tick, 150)
    }
    tick()
    return () => (raf ? cancelAnimationFrame(id) : clearTimeout(id))
  }, [selector, card])
  return { ring, place: selector ? place : ({ mode: 'top' } as Place) }
}
