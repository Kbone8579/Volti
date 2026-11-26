import { useCallback, useEffect, useRef, useState } from 'react'

/** 브라우저마다 있을 수도 없을 수도 있어서 선택 항목으로 */
type FsElement = {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
  webkitRequestFullscreen?: () => Promise<void> | void
}
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }

const fullscreenElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null

/**
 * 전체보기 — 상단 바 · 카메라 패널을 숨기고 악보만 화면 가득 (카메라 인식은 계속).
 * 브라우저가 지원하면 진짜 전체 화면(주소창 · 탭까지 숨김)도 같이 켬:
 *   - 데스크톱 · 안드로이드 · 아이패드(iPadOS 16.4+): 전체 화면
 *   - 아이폰 사파리: 전체 화면 API 가 없어서 앱 안에서만 꽉 차게 (홈 화면 앱이면 원래 주소창이 없음)
 * 사용자가 브라우저 쪽에서 전체 화면을 끄면(Esc · 아래로 밀기) 전체보기도 같이 끝남.
 */
export function useFocusMode() {
  const [on, setOn] = useState(false)
  /** 우리가 브라우저 전체 화면을 켰는지 (그게 풀리면 전체보기도 끝내려고) */
  const requested = useRef(false)

  const enter = useCallback(() => {
    setOn(true)
    if (fullscreenElement()) return
    const el = document.documentElement as unknown as FsElement
    try {
      const p = el.requestFullscreen ? el.requestFullscreen.call(document.documentElement, { navigationUI: 'hide' }) : el.webkitRequestFullscreen?.call(document.documentElement)
      if (el.requestFullscreen || el.webkitRequestFullscreen) requested.current = true
      Promise.resolve(p).catch(() => {
        requested.current = false // 막힌 환경 → 앱 안에서만 꽉 차게
      })
    } catch {
      requested.current = false
    }
  }, [])

  const exit = useCallback(() => {
    setOn(false)
    requested.current = false
    if (!fullscreenElement()) return
    try {
      const d = document as FsDocument
      const p = document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen?.()
      Promise.resolve(p).catch(() => {})
    } catch {
      // 이미 풀렸음
    }
  }, [])

  useEffect(() => {
    const onChange = () => {
      if (!fullscreenElement() && requested.current) {
        requested.current = false
        setOn(false)
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  const toggle = useCallback(() => (on ? exit() : enter()), [on, enter, exit])
  return { on, enter, exit, toggle }
}
