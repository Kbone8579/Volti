/**
 * 악보 확대/축소 · 이동 계산 (순수 함수).
 *
 * - 배율 1 = 화면 맞춤 (페이지 전체가 한눈에). 'width' = 너비 맞춤
 * - View.x, y = 악보(콘텐츠) 왼쪽 위 모서리의 화면 안 위치 (px)
 * - 콘텐츠가 화면보다 작으면 가운데, 크면 빈틈이 생기지 않는 범위에서만 이동
 */
export type Zoom = number | 'width'

export interface Size {
  w: number
  h: number
}
export interface Point {
  x: number
  y: number
}
export interface View {
  z: number
  x: number
  y: number
}

export const MIN_Z = 0.5
export const MAX_Z = 4
/** 화면 가장자리 여백 */
export const PAD = 10
/** 확대·축소 버튼 단계 */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]

export const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z))

/** 배율 1(화면 맞춤)일 때 콘텐츠 크기. aspect = 가로/세로 (펼치기면 두 페이지 합) */
export function fitSize(viewport: Size, aspect: number, pad = PAD): Size {
  const W = Math.max(1, viewport.w - pad * 2)
  const H = Math.max(1, viewport.h - pad * 2)
  const h = Math.min(H, W / Math.max(0.05, aspect))
  return { w: h * aspect, h }
}

/** 'width' 같은 모드를 실제 배율로 */
export function resolveZoom(zoom: Zoom, viewport: Size, fit: Size, pad = PAD): number {
  if (zoom === 'width') return clampZ(Math.max(1, (viewport.w - pad * 2) / Math.max(1, fit.w)))
  return clampZ(zoom)
}

/** 빈틈이 생기지 않게 위치 보정 (작으면 가운데) */
export function clampView(v: View, viewport: Size, fit: Size, pad = PAD): View {
  const cw = fit.w * v.z
  const ch = fit.h * v.z
  const axis = (pos: number, content: number, view: number) =>
    content <= view - pad * 2 + 0.5 ? (view - content) / 2 : Math.min(pad, Math.max(view - pad - content, pos))
  return { z: v.z, x: axis(v.x, cw, viewport.w), y: axis(v.y, ch, viewport.h) }
}

/** 처음 보여줄 위치: 가로는 가운데, 세로는 맨 위 */
export function initialView(z: number, viewport: Size, fit: Size, pad = PAD): View {
  const cw = fit.w * z
  return clampView({ z, x: (viewport.w - cw) / 2, y: pad }, viewport, fit, pad)
}

/** focal(화면 좌표) 아래의 악보 지점이 그대로 있도록 확대/축소 */
export function zoomAt(v: View, newZ: number, focal: Point, viewport: Size, fit: Size, pad = PAD): View {
  const z = clampZ(newZ)
  const px = (focal.x - v.x) / (fit.w * v.z)
  const py = (focal.y - v.y) / (fit.h * v.z)
  return clampView({ z, x: focal.x - px * fit.w * z, y: focal.y - py * fit.h * z }, viewport, fit, pad)
}

/** 두 손가락: 처음 상태(v0, 중심 mid0) 기준으로 배율 scale, 현재 중심 mid 로 */
export function pinchView(v0: View, scale: number, mid0: Point, mid: Point, viewport: Size, fit: Size, pad = PAD): View {
  const z = clampZ(v0.z * scale)
  const px = (mid0.x - v0.x) / (fit.w * v0.z)
  const py = (mid0.y - v0.y) / (fit.h * v0.z)
  return clampView({ z, x: mid.x - px * fit.w * z, y: mid.y - py * fit.h * z }, viewport, fit, pad)
}

export function overflow(v: View, viewport: Size, fit: Size, pad = PAD) {
  return { x: fit.w * v.z > viewport.w - pad * 2 + 0.5, y: fit.h * v.z > viewport.h - pad * 2 + 0.5 }
}

/**
 * 확대 상태에서 "다음/이전": 페이지가 화면보다 길면 먼저 한 화면씩 아래/위로 이동.
 * 이미 끝이면 null → 페이지를 넘김.
 */
export function stepView(v: View, dir: 'next' | 'prev', viewport: Size, fit: Size, pad = PAD, overlap = 0.12): View | null {
  if (viewport.w <= pad * 2 + 1 || viewport.h <= pad * 2 + 1) return null // 아직 크기를 모름
  const ch = fit.h * v.z
  if (ch <= viewport.h - pad * 2 + 0.5) return null
  const minY = viewport.h - pad - ch
  const maxY = pad
  const step = (viewport.h - pad * 2) * (1 - overlap)
  if (dir === 'next') {
    if (v.y <= minY + 1) return null
    return { ...v, y: Math.max(minY, v.y - step) }
  }
  if (v.y >= maxY - 1) return null
  return { ...v, y: Math.min(maxY, v.y + step) }
}

/**
 * 페이지를 넘겨 맞춤 크기(fit)가 달라질 때 보던 위치 그대로 옮기기 (배율 유지).
 * - 위/아래·왼쪽/오른쪽 끝에 붙어 있었으면 새 페이지에서도 그 끝
 * - 중간이면 화면 가운데에 있던 악보 지점(비율)이 계속 가운데
 * 크기가 같으면 위치가 그대로 (픽셀 단위로 같음)
 */
export function carryView(v: View, from: Size, to: Size, viewport: Size, pad = PAD): View {
  const axis = (pos: number, f: number, t: number, view: number) => {
    const cf = f * v.z
    const ct = t * v.z
    if (Math.abs(f - t) < 0.5) return pos // 크기가 같으면 그대로
    if (cf <= view - pad * 2 + 0.5) return pos // 전체가 보이던 축 → clampView가 가운데로
    if (pos >= pad - 1) return pad // 처음 끝
    if (pos <= view - pad - cf + 1) return view - pad - ct // 마지막 끝
    const c = view / 2
    return c - ((c - pos) / cf) * ct
  }
  return clampView(
    { z: v.z, x: axis(v.x, from.w, to.w, viewport.w), y: axis(v.y, from.h, to.h, viewport.h) },
    viewport,
    to,
    pad,
  )
}

/** 페이지를 넘긴 뒤 (「아래로 먼저 이동」을 켰을 때): 다음이면 맨 위, 이전이면 맨 아래 (가로 위치·배율은 유지) */
export function viewAfterTurn(v: View, dir: 'next' | 'prev', viewport: Size, fit: Size, pad = PAD): View {
  const ch = fit.h * v.z
  const y = dir === 'next' ? pad : viewport.h - pad - ch
  return clampView({ ...v, y }, viewport, fit, pad)
}

export function nextStep(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.01) ?? MAX_Z
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.01) ?? MIN_Z
}

export function zoomLabel(zoom: Zoom, resolved: number): string {
  return zoom === 'width' ? `너비 ${Math.round(resolved * 100)}%` : `${Math.round(resolved * 100)}%`
}

/** 휠 한 칸 → 배율 배수 (트랙패드 핀치는 ctrlKey + 작은 delta) */
export function wheelFactor(deltaY: number, deltaMode: number, pinch: boolean): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  const k = pinch ? 0.01 : 0.0018
  return Math.exp(-Math.max(-300, Math.min(300, px)) * k)
}
