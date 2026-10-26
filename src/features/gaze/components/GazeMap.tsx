import type { Point, Rect } from '../lib/gaze'

interface Props {
  point: Point | null
  rect: Rect | null
  /** 오른쪽 아래 구역 크기 (악보 영역 대비 비율) */
  zone: number
  inZone: boolean
  holdProgress: number
  active: boolean
  hasModel: boolean
  errorPx: number | null
  dwellMs: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 화면 전체를 축소한 지도 위에 악보 영역 · 넘김 구역 · 현재 시선을 표시 */
export function GazeMap({ point, rect, zone, inZone, holdProgress, active, hasModel, errorPx, dwellMs }: Props) {
  const vw = Math.max(1, window.innerWidth)
  const vh = Math.max(1, window.innerHeight)
  const pct = (v: number, total: number) => `${(v / total) * 100}%`

  return (
    <div className="meter">
      <div className="meter-labels">
        <span className="muted">시선 위치</span>
        <span className={`meter-value ${inZone ? 'next-text' : ''}`}>{!hasModel ? '보정 필요' : point ? (inZone ? '▶ 구역' : '악보') : '—'}</span>
        <span className="muted">{hasModel && errorPx !== null ? `오차 ~${Math.round(errorPx)}px` : ''}</span>
      </div>

      <div className="gaze-map" style={{ aspectRatio: `${vw} / ${vh}` }}>
        {rect && (
          <div
            className="gm-score"
            style={{ left: pct(rect.left, vw), top: pct(rect.top, vh), width: pct(rect.width, vw), height: pct(rect.height, vh) }}
          >
            <div className={`gm-zone ${inZone ? 'on' : ''}`} style={{ width: `${zone * 100}%`, height: `${zone * 100}%` }} />
          </div>
        )}
        {point && <div className="gm-dot" style={{ left: pct(clamp(point.x, 0, vw), vw), top: pct(clamp(point.y, 0, vh), vh) }} />}
        {!hasModel && <div className="gm-empty">아래 「시선 캘리브레이션」을 먼저 해 주세요</div>}
      </div>

      <div className="hold-track" aria-label="머무름 진행도">
        <div className="hold-fill next" style={{ width: `${Math.round(holdProgress * 100)}%`, opacity: active ? 1 : 0 }} />
      </div>
      <p className="muted small hint">
        오른쪽 아래 칸을 {(dwellMs / 1000).toFixed(1)}초 바라보면 다음 페이지로 넘어가요. 자세가 바뀌면 「빠른 보정」을 눌러 주세요.
      </p>
    </div>
  )
}
