import { useEffect, useRef, useState } from 'react'

/** 요소의 현재 크기(px)를 따라가는 훅. ref 를 요소에 붙이면 크기가 바뀔 때마다 다시 그림. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}
