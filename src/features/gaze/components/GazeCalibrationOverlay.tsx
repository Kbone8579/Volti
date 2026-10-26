import type { Point } from '../lib/gaze'

/** 시선 보정 중 화면에 보여 줄 것 */
export type GazeCalibUi = { step: 'points'; idx: number; total: number; point: Point } | { step: 'fix'; point: Point }

/**
 * 시선 캘리브레이션 화면 (화면 전체를 덮음)
 * - points: 차례로 나오는 점을 눈으로 따라가기 (9곳)
 * - fix: ▶ 버튼 자리를 2초 바라보며 위치만 다시 맞추기 (빠른 보정)
 */
export function GazeCalibrationOverlay({ ui, progress, onCancel }: { ui: GazeCalibUi; progress: number; onCancel: () => void }) {
  return (
    <div className="gaze-calib" role="dialog" aria-label="시선 캘리브레이션">
      <div className="gc-text">
        {ui.step === 'points' ? (
          <>
            <strong>
              점을 눈으로 따라가 주세요 · {ui.idx + 1} / {ui.total}
            </strong>
            <span>고개는 연주할 때 자세 그대로 두고, 눈만 움직이세요.</span>
          </>
        ) : (
          <>
            <strong>▶ 버튼 자리를 바라봐 주세요</strong>
            <span>2초 동안 그대로 보고 있으면 위치를 다시 맞춰요.</span>
          </>
        )}
        <div className="calib-bar">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <button className="btn small" onClick={onCancel}>
          취소 (Esc)
        </button>
      </div>
      <div key={ui.step === 'points' ? ui.idx : 'fix'} className="gc-dot" style={{ left: ui.point.x, top: ui.point.y }} aria-hidden />
    </div>
  )
}

/** 지금 보고 있다고 추정한 곳에 찍는 점 (▶ 칸 안이면 색이 바뀜) */
export function GazeDot({ point, inZone }: { point: Point; inZone: boolean }) {
  return <div className={`gaze-dot ${inZone ? 'on' : ''}`} style={{ transform: `translate(${point.x}px, ${point.y}px)` }} aria-hidden />
}
