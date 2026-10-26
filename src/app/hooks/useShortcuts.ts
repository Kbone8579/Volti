import { useEffect, useLayoutEffect, useRef } from 'react'

export interface ShortcutHandlers {
  /** Esc: 지금 열려 있는 것 하나를 닫기 (대기 중 넘김 → 체험 → 라이브러리 → 보정 → 설정 순) */
  onEscape: () => void
  /** + / − */
  onZoomStep: (dir: 1 | -1) => void
  /** 0 */
  onZoomReset: () => void
  /** → ↓ PageDown Space = 다음, ← ↑ PageUp = 이전 (블루투스 페달도 보통 이 키를 보냄) */
  onTurn: (dir: 'next' | 'prev') => void
}

const NEXT_KEYS = ['ArrowRight', 'ArrowDown', 'PageDown', ' ']
const PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp']

/** 키보드 · 블루투스 페달 단축키. 글자 입력 칸에 있을 땐 무시. */
export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers)
  useLayoutEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const h = ref.current
      if (e.key === 'Escape') return h.onEscape()
      if (e.key === '+' || e.key === '=') return h.onZoomStep(1)
      if (e.key === '-' || e.key === '_') return h.onZoomStep(-1)
      if (e.key === '0') return h.onZoomReset()
      if (NEXT_KEYS.includes(e.key)) {
        e.preventDefault()
        h.onTurn('next')
      } else if (PREV_KEYS.includes(e.key)) {
        e.preventDefault()
        h.onTurn('prev')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
