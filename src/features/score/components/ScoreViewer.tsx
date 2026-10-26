import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Play } from 'lucide-react'
import { getPageUrl, peekPageUrl, type ScorePage } from '../lib/scoreFiles'
import {
  clampView,
  fitSize,
  carryView,
  initialView,
  overflow,
  pinchView,
  resolveZoom,
  stepView,
  viewAfterTurn,
  wheelFactor,
  zoomAt,
  type Point,
  type View,
  type Zoom,
} from '../lib/zoom'

/** ▶ 목표 버튼 중심이 악보 영역 오른쪽·아래 끝에서 떨어진 거리(px). 빠른 보정 때 이 점을 보게 함 */
export const NEXT_TARGET_INSET = 44
const RING_R = 28
const RING_C = 2 * Math.PI * RING_R
/** 페이지 비율을 아직 모를 때 (세로 A4) */
const DEFAULT_ASPECT = 1 / Math.SQRT2

export interface NextTarget {
  /** 0..1 머무름 진행도 */
  progress: number
  inZone: boolean
  /** 오른쪽 아래 구역 크기 (영역 대비 비율) */
  zone: number
  showZone: boolean
}

export type FlashKind = 'next' | 'prev' | 'edge' | 'down' | 'up'

export interface ViewerHandle {
  /** 확대 상태에서 한 화면 아래/위로. 이동했으면 true (페이지는 그대로) */
  step(dir: 'next' | 'prev'): boolean
  /** 페이지를 넘긴 직후 위치: 맨 위 또는 맨 아래 (배율·가로 위치는 유지) */
  afterTurn(align: 'top' | 'bottom'): void
}

export interface ViewInfo {
  /** 실제 배율 (화면 맞춤 = 1) */
  z: number
  overflowY: boolean
}

interface Props {
  ref?: Ref<ViewerHandle>
  pages: ScorePage[]
  /** 화면에 보일 페이지 인덱스들 (1개 또는 펼치기 2개) */
  visible: number[]
  /** 미리 그려둘 페이지 인덱스들 */
  prefetch: number[]
  holdSide: 0 | 1 | -1
  holdProgress: number
  flash: { kind: FlashKind; key: number } | null
  onTapPrev: () => void
  onTapNext: () => void
  /** 화면 맞춤 상태에서 손가락으로 좌우로 밀기 */
  onSwipe: (dir: 'next' | 'prev') => void
  empty?: ReactNode
  /** 시선 모드일 때 오른쪽 아래 ▶ 목표 */
  nextTarget?: NextTarget | null
  zoom: Zoom
  /** 휠 · 핀치 · 두 번 탭으로 배율이 바뀜 */
  onZoomChange: (z: Zoom) => void
  onViewInfo?: (info: ViewInfo) => void
  /** 확대·위치 고정: 휠·핀치·끌기·두 번 탭 무시 */
  locked: boolean
  wheelMode: 'zoom' | 'scroll'
  /** 바뀌면 위치를 처음(맨 위)으로 */
  resetKey: string
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (width: number, height: number) =>
      setSize((s) => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }))
    const r = el.getBoundingClientRect()
    set(r.width, r.height)
    const ro = new ResizeObserver(([e]) => set(e.contentRect.width, e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

function PageImage({ page, boxW, boxH, onAspect }: { page: ScorePage; boxW: number; boxH: number; onAspect: (a: number) => void }) {
  const [url, setUrl] = useState<string | null>(() => peekPageUrl(page))
  const [failed, setFailed] = useState(false)
  // 확대·축소하는 동안에는 지금 이미지를 늘려 보여주고, 멈추면 그 크기로 다시 그림
  const [target, setTarget] = useState({ w: boxW, h: boxH })
  useEffect(() => {
    const id = setTimeout(() => setTarget({ w: boxW, h: boxH }), url ? 220 : 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxW, boxH])

  useEffect(() => {
    if (target.w < 2 || target.h < 2) return
    let alive = true
    setFailed(false)
    const dpr = window.devicePixelRatio || 1
    getPageUrl(page, target.w * dpr, target.h * dpr)
      .then((u) => alive && setUrl(u))
      .catch((err) => {
        console.error(err)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [page, target])

  if (failed) return <div className="page-msg">이 페이지를 그리지 못했어요</div>
  if (!url) return <div className="page-msg"><span className="spinner" /></div>
  return (
    <img
      className="page-img"
      src={url}
      alt={page.label}
      draggable={false}
      onLoad={(e) => {
        const im = e.currentTarget
        if (im.naturalWidth && im.naturalHeight) onAspect(im.naturalWidth / im.naturalHeight)
      }}
    />
  )
}

type Gesture =
  | { mode: 'pending' | 'pan' | 'swipe' | 'done'; start: Point; t0: number; v0: View; type: string }
  | { mode: 'pinch'; d0: number; mid0: Point; v0: View }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const round3 = (z: number) => Math.round(z * 1000) / 1000

export function ScoreViewer(p: Props) {
  const { pages, visible, prefetch, holdSide, holdProgress, flash, empty, nextTarget } = p
  const [ref, size] = useSize<HTMLDivElement>()
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const setAspect = (id: string, a: number) =>
    setAspects((m) => (Math.abs((m[id] ?? 0) - a) < 0.002 ? m : { ...m, [id]: a }))

  const visPages = visible.map((i) => pages[i]).filter(Boolean) as ScorePage[]
  const visKey = visPages.map((pg) => pg.id).join('|')
  const totalAspect = visPages.reduce((s, pg) => s + (aspects[pg.id] ?? DEFAULT_ASPECT), 0) || DEFAULT_ASPECT
  const fit = useMemo(() => fitSize(size, totalAspect), [size, totalAspect])
  const resolved = resolveZoom(p.zoom, size, fit)

  const [view, setViewState] = useState<View>(() => initialView(resolved, size, fit))
  const viewRef = useRef(view)
  const [animating, setAnimating] = useState(false)
  const setView = (v: View, animate = false) => {
    viewRef.current = v
    setViewState(v)
    if (animate) {
      setAnimating(true)
      window.setTimeout(() => setAnimating(false), 260)
    }
  }

  // 최신 값을 이벤트 처리기에서 쓰기 위한 참조
  const live = useRef({ size, fit, props: p })
  live.current = { size, fit, props: p }

  // 배율·화면 크기·페이지가 바뀌면 위치 다시 맞추기
  const resetKeyRef = useRef(p.resetKey)
  const alignRef = useRef<'next' | 'prev' | null>(null)
  const lastFit = useRef({ fit, size })
  useLayoutEffect(() => {
    if (size.w < 2) return
    let v = viewRef.current
    const prev = lastFit.current
    lastFit.current = { fit, size }
    const sameViewport = prev.size.w === size.w && prev.size.h === size.h
    const fitChanged = Math.abs(prev.fit.w - fit.w) > 0.5 || Math.abs(prev.fit.h - fit.h) > 0.5
    if (resetKeyRef.current !== p.resetKey) {
      resetKeyRef.current = p.resetKey
      v = initialView(resolved, size, fit)
    } else if (Math.abs(v.z - resolved) > 1e-3) {
      // 버튼·메뉴로 배율을 바꿀 때: 페이지 전체가 보이던 상태면 윗부분을 기준으로 (악보는 위에서부터 읽으니까)
      const wasWhole = !overflow(v, size, fit).y
      v = zoomAt(v, resolved, { x: size.w / 2, y: wasWhole ? v.y : size.h / 2 }, size, fit)
    } else if (sameViewport && fitChanged) {
      // 페이지를 넘겼는데 새 페이지 비율이 조금 다를 때: 보던 위치(위아래·좌우)를 비율로 옮김
      v = carryView(v, prev.fit, fit, size)
    } else {
      // 페이지 크기가 같으면 보던 위치 그대로
      v = clampView(v, size, fit)
    }
    if (alignRef.current) {
      v = viewAfterTurn(v, alignRef.current, size, fit)
      alignRef.current = null
    }
    if (v.x !== viewRef.current.x || v.y !== viewRef.current.y || v.z !== viewRef.current.z) setView(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, size.w, size.h, fit.w, fit.h, p.resetKey, visKey])

  const ov = overflow(view, size, fit)
  useEffect(() => {
    p.onViewInfo?.({ z: view.z, overflowY: ov.y })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.z, ov.y])

  useImperativeHandle(
    p.ref,
    () => ({
      step(dir) {
        const { size: s, fit: f } = live.current
        const v = stepView(viewRef.current, dir, s, f)
        if (!v) return false
        setView(v, true)
        return true
      },
      afterTurn(align) {
        alignRef.current = align === 'top' ? 'next' : 'prev'
      },
    }),
    [],
  )

  // 다음 페이지들을 미리 렌더 → 넘길 때 바로 보이고, 페이지 비율도 미리 앎
  useEffect(() => {
    if (size.w < 2) return
    const dpr = window.devicePixelRatio || 1
    const h = fit.h * view.z
    for (const i of prefetch) {
      const pg = pages[i]
      if (!pg) continue
      const a = aspects[pg.id] ?? DEFAULT_ASPECT
      getPageUrl(pg, h * a * dpr, h * dpr)
        .then((u) => {
          const im = new Image()
          im.src = u
          return im.decode().then(() => im.naturalWidth && setAspect(pg.id, im.naturalWidth / im.naturalHeight))
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, prefetch, size.w, size.h, Math.round(view.z * 10)])

  /* ───────── 휠: 확대·축소 (또는 이동) ───────── */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { size: s, fit: f, props } = live.current
      if (props.pages.length === 0) return
      e.preventDefault()
      if (props.locked) return
      const r = el.getBoundingClientRect()
      const focal = { x: e.clientX - r.left, y: e.clientY - r.top }
      const v0 = viewRef.current
      const wantZoom = props.wheelMode === 'zoom' || e.ctrlKey || e.metaKey
      if (wantZoom) {
        if (Math.abs(e.deltaY) < 0.5) return // 가로로만 움직인 트랙패드 등: 배율 그대로
        const v = zoomAt(v0, v0.z * wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), focal, s, f)
        setView(v)
        props.onZoomChange(round3(v.z))
      } else {
        const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? s.h : 1
        setView(clampView({ ...v0, x: v0.x - e.deltaX * k, y: v0.y - e.deltaY * k }, s, f))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ───────── 터치 · 마우스: 끌어서 이동, 두 손가락 확대, 탭, 밀어서 넘기기 ───────── */
  const ptrs = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<{ t: number; p: Point } | null>(null)
  const local = (e: React.PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pages.length === 0) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input')) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // jsdom 등에서 지원 안 함
    }
    const pt = local(e)
    ptrs.current.set(e.pointerId, pt)
    if (ptrs.current.size === 1) {
      gesture.current = { mode: 'pending', start: pt, t0: performance.now(), v0: viewRef.current, type: e.pointerType }
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()]
      gesture.current = p.locked ? null : { mode: 'pinch', d0: Math.max(10, dist(a, b)), mid0: mid(a, b), v0: viewRef.current }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return
    const pt = local(e)
    ptrs.current.set(e.pointerId, pt)
    const g = gesture.current
    if (!g) return
    if (g.mode === 'pinch') {
      if (ptrs.current.size < 2) return
      const [a, b] = [...ptrs.current.values()]
      setView(pinchView(g.v0, dist(a, b) / g.d0, g.mid0, mid(a, b), size, fit))
      return
    }
    if (ptrs.current.size !== 1) return
    const dx = pt.x - g.start.x
    const dy = pt.y - g.start.y
    if (g.mode === 'pending' && Math.hypot(dx, dy) > 8) {
      const o = overflow(viewRef.current, size, fit)
      if (!p.locked && (o.x || o.y)) g.mode = 'pan'
      else g.mode = g.type === 'mouse' ? 'done' : 'swipe'
    }
    if (g.mode === 'pan') setView(clampView({ ...g.v0, x: g.v0.x + dx, y: g.v0.y + dy }, size, fit))
  }

  const tap = (pt: Point) => {
    const fx = pt.x / Math.max(1, size.w)
    if (fx < 0.3) return p.onTapPrev()
    if (fx > 0.7) return p.onTapNext()
    // 가운데를 두 번 탭(클릭): 화면 맞춤 ↔ 2배
    const now = performance.now()
    const last = lastTap.current
    if (last && now - last.t < 350 && dist(last.p, pt) < 40) {
      lastTap.current = null
      if (p.locked) return
      const v0 = viewRef.current
      const v = Math.abs(v0.z - 1) < 0.05 ? zoomAt(v0, 2, pt, size, fit) : initialView(1, size, fit)
      setView(v, true)
      p.onZoomChange(round3(v.z))
    } else {
      lastTap.current = { t: now, p: pt }
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ptrs.current.has(e.pointerId)) return
    const pt = local(e)
    ptrs.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.mode === 'pinch') {
      if (ptrs.current.size === 0) {
        gesture.current = null
        p.onZoomChange(round3(viewRef.current.z))
      }
      return
    }
    if (ptrs.current.size > 0 || !g) return
    gesture.current = null
    if (g.mode === 'pending') tap(pt)
    else if (g.mode === 'swipe') {
      const dx = pt.x - g.start.x
      const dy = pt.y - g.start.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - g.t0 < 800) p.onSwipe(dx < 0 ? 'next' : 'prev')
    }
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size === 0) {
      if (gesture.current?.mode === 'pinch') p.onZoomChange(round3(viewRef.current.z))
      gesture.current = null
    }
  }

  const ch = fit.h * view.z
  const panning = ov.x || ov.y

  return (
    <div
      className={`score ${panning && !p.locked ? 'can-pan' : ''}`}
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {pages.length === 0 ? (
        empty
      ) : (
        <div
          className={`stage ${animating ? 'animating' : ''}`}
          style={{ width: fit.w * view.z, height: ch, transform: `translate3d(${view.x}px, ${view.y}px, 0)` }}
          data-zoom={view.z.toFixed(3)}
          data-x={Math.round(view.x)}
          data-y={Math.round(view.y)}
        >
          {visPages.map((pg) => {
            const w = ch * (aspects[pg.id] ?? DEFAULT_ASPECT)
            return (
              <div className="page-box" key={pg.id} style={{ width: w, height: ch }}>
                <PageImage page={pg} boxW={w} boxH={ch} onAspect={(a) => setAspect(pg.id, a)} />
              </div>
            )
          })}
        </div>
      )}

      {/* 제스처 유지 중 → 가장자리 게이지 */}
      <div className={`edge-hold right ${holdSide === 1 ? 'on' : ''}`}>
        <div style={{ height: `${holdSide === 1 ? holdProgress * 100 : 0}%` }} />
      </div>
      <div className={`edge-hold left ${holdSide === -1 ? 'on' : ''}`}>
        <div style={{ height: `${holdSide === -1 ? holdProgress * 100 : 0}%` }} />
      </div>

      {nextTarget && pages.length > 0 && (
        <>
          {nextTarget.showZone && (
            <div
              className={`gaze-zone ${nextTarget.inZone ? 'on' : ''}`}
              style={{ width: `${nextTarget.zone * 100}%`, height: `${nextTarget.zone * 100}%` }}
              aria-hidden
            />
          )}
          <div className={`next-target ${nextTarget.inZone ? 'look' : ''}`} aria-hidden>
            <svg viewBox="0 0 64 64">
              <circle className="nt-bg" cx="32" cy="32" r={RING_R} />
              <circle
                className="nt-ring"
                cx="32"
                cy="32"
                r={RING_R}
                style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - nextTarget.progress) }}
              />
            </svg>
            <span>
              <Play size={22} fill="currentColor" strokeWidth={1.5} />
            </span>
          </div>
        </>
      )}

      {flash && (
        <div key={flash.key} className={`flash ${flash.kind}`} aria-hidden>
          {flash.kind === 'next' ? (
            <ChevronRight size={64} strokeWidth={2.5} />
          ) : flash.kind === 'prev' ? (
            <ChevronLeft size={64} strokeWidth={2.5} />
          ) : flash.kind === 'down' ? (
            <ChevronDown size={36} strokeWidth={2.75} />
          ) : flash.kind === 'up' ? (
            <ChevronUp size={36} strokeWidth={2.75} />
          ) : (
            '끝'
          )}
        </div>
      )}
    </div>
  )
}
