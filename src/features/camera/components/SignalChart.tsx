import { useEffect, useRef, type RefObject } from 'react'

export interface ChartPoint {
  t: number
  d: number | null
  ev?: 'next' | 'prev'
}

interface Props {
  bufferRef: RefObject<ChartPoint[]>
  threshold: number
  range: number
  forwardOnly: boolean
  windowMs?: number
}

/** 최근 몇 초간의 신호 흐름. 연주 중 자연스러운 움직임이 임계선에 얼마나 가까운지 보는 용도 */
export function SignalChart({ bufferRef, threshold, range, forwardOnly, windowMs = 8000 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ threshold, range, forwardOnly, windowMs })
  propsRef.current = { threshold, range, forwardOnly, windowMs }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let colors = readColors(canvas)
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      colors = readColors(canvas)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => (colors = readColors(canvas))
    mq.addEventListener('change', onScheme)

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const { threshold: thr, range: rng, forwardOnly: fwd, windowMs: win } = propsRef.current
      const W = canvas.width
      const H = canvas.height
      const dpr = window.devicePixelRatio || 1
      const now = performance.now()
      const buf = bufferRef.current ?? []
      const y = (v: number) => H / 2 - (Math.max(-rng, Math.min(rng, v)) / rng) * (H / 2 - 4 * dpr)
      const x = (t: number) => W - ((now - t) / win) * W

      ctx.clearRect(0, 0, W, H)

      // 넘김 구간
      ctx.fillStyle = colors.nextZone
      ctx.fillRect(0, 0, W, y(thr))
      if (!fwd) {
        ctx.fillStyle = colors.prevZone
        ctx.fillRect(0, y(-thr), W, H - y(-thr))
      }

      // 중앙선 · 임계선
      ctx.lineWidth = 1 * dpr
      ctx.strokeStyle = colors.grid
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.setLineDash([4 * dpr, 4 * dpr])
      ctx.strokeStyle = colors.next
      ctx.beginPath()
      ctx.moveTo(0, y(thr))
      ctx.lineTo(W, y(thr))
      ctx.stroke()
      if (!fwd) {
        ctx.strokeStyle = colors.prev
        ctx.beginPath()
        ctx.moveTo(0, y(-thr))
        ctx.lineTo(W, y(-thr))
        ctx.stroke()
      }
      ctx.setLineDash([])

      // 넘김 이벤트 표시
      for (const p of buf) {
        if (!p.ev || now - p.t > win) continue
        ctx.strokeStyle = p.ev === 'next' ? colors.next : colors.prev
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.moveTo(x(p.t), 0)
        ctx.lineTo(x(p.t), H)
        ctx.stroke()
      }

      // 신호선 (얼굴 놓친 구간은 끊김)
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 2 * dpr
      ctx.lineJoin = 'round'
      ctx.beginPath()
      let pen = false
      for (const p of buf) {
        if (now - p.t > win) continue
        if (p.d === null) {
          pen = false
          continue
        }
        if (pen) ctx.lineTo(x(p.t), y(p.d))
        else ctx.moveTo(x(p.t), y(p.d))
        pen = true
      }
      ctx.stroke()
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mq.removeEventListener('change', onScheme)
    }
  }, [bufferRef])

  return <canvas ref={canvasRef} className="chart" aria-label="최근 8초 신호 그래프" />
}

function readColors(el: Element) {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    line: v('--text', '#e8eaed'),
    grid: v('--line', '#333'),
    next: v('--next', '#2dd4bf'),
    prev: v('--prev', '#a78bfa'),
    nextZone: v('--next-zone', 'rgba(45,212,191,0.12)'),
    prevZone: v('--prev-zone', 'rgba(167,139,250,0.12)'),
  }
}
