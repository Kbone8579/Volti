import { useEffect, useRef, useState } from 'react'
import { Lock, LockOpen, Minus, Plus } from 'lucide-react'
import { zoomLabel, type Zoom } from '../lib/zoom'

interface Props {
  zoom: Zoom
  /** 실제 배율 (너비 맞춤일 때 계산된 값) */
  resolved: number
  disabled: boolean
  locked: boolean
  onZoom: (z: Zoom) => void
  onStep: (dir: 1 | -1) => void
  onLock: (v: boolean) => void
}

const PRESETS: { value: Zoom; label: string; hint?: string }[] = [
  { value: 1, label: '화면 맞춤', hint: '페이지 전체' },
  { value: 'width', label: '너비 맞춤', hint: '가로를 꽉 채움' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 3, label: '300%' },
]

/** 툴바의 확대/축소: [−] [배율 ▾] [+] [고정] */
export function ZoomControl({ zoom, resolved, disabled, locked, onZoom, onStep, onLock }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="zoom" ref={box}>
      <div className="zoom-group" role="group" aria-label="확대/축소">
        <button className="btn icon" onClick={() => onStep(-1)} disabled={disabled || locked} aria-label="축소" title="축소 (−)">
          <Minus size={18} />
        </button>
        <button
          className="btn zoom-label mono"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`배율 고르기, 지금 ${zoomLabel(zoom, resolved)}`}
          title="배율 고르기"
        >
          {zoomLabel(zoom, resolved)}
        </button>
        <button className="btn icon" onClick={() => onStep(1)} disabled={disabled || locked} aria-label="확대" title="확대 (+)">
          <Plus size={18} />
        </button>
        <button
          className={`btn icon ${locked ? 'active' : ''}`}
          onClick={() => onLock(!locked)}
          disabled={disabled}
          aria-pressed={locked}
          aria-label={locked ? '확대·위치 고정 풀기' : '확대·위치 고정'}
          title={locked ? '고정됨 — 휠·핀치·끌기로 바뀌지 않아요' : '지금 배율·위치 고정'}
        >
          {locked ? <Lock size={17} /> : <LockOpen size={17} />}
        </button>
      </div>
      {open && (
        <div className="zoom-menu" role="menu">
          {PRESETS.map((p) => {
            const on = zoom === p.value
            return (
              <button
                key={String(p.value)}
                role="menuitemradio"
                aria-checked={on}
                className={on ? 'on' : ''}
                disabled={locked}
                onClick={() => {
                  onZoom(p.value)
                  setOpen(false)
                }}
              >
                <span>{p.label}</span>
                {p.hint && <small>{p.hint}</small>}
              </button>
            )
          })}
          <p className="zoom-tip">
            {locked
              ? '고정을 풀면 배율을 바꿀 수 있어요.'
              : '휠·두 손가락으로도 조절돼요. 정한 배율은 악보마다 저장되고 페이지를 넘겨도 유지돼요.'}
          </p>
        </div>
      )}
    </div>
  )
}
