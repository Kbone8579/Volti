import type { RefObject } from 'react'
import { ArrowLeftRight, Plus, RotateCcw } from 'lucide-react'
import type { TrackerStatus } from '../hooks/useFaceTracker'
import { MODE_META, type GestureMode } from '@/features/settings'
import type { Point, Rect } from '@/features/gaze'
import { SignalMeter } from './SignalMeter'
import { SignalChart, type ChartPoint } from './SignalChart'
import { GazeMap } from '@/features/gaze'

export type CalibStep = 'idle' | 'neutral' | 'gesture' | 'gaze' | 'cNeutral' | 'cNext' | 'cPrev'

export interface GazePanelInfo {
  point: Point | null
  rect: Rect | null
  zone: number
  inZone: boolean
  hasModel: boolean
  errorPx: number | null
  dwellMs: number
}

export interface CustomPanelInfo {
  next: { summary: string[]; ok: boolean } | null
  prev: { summary: string[]; ok: boolean } | null
  hasModel: boolean
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  status: TrackerStatus
  error: string | null
  perf: { fps: number; inferMs: number }
  mirror: boolean
  faceVisible: boolean
  mode: GestureMode
  onModeChange: (m: GestureMode) => void
  d: number | null
  threshold: number
  holdProgress: number
  side: 0 | 1 | -1
  forwardOnly: boolean
  onForwardOnly: (v: boolean) => void
  turnDelayMs: number
  onTurnDelay: (ms: number) => void
  chartRef: RefObject<ChartPoint[]>
  gaze: GazePanelInfo
  custom: CustomPanelInfo
  calibStep: CalibStep
  calibProgress: number
  onStart: () => void
  onStop: () => void
  onCalibrate: () => void
  onRebaseline: () => void
  onFlip: () => void
  /** 내 동작: 다음 또는 이전 동작 하나만 (다시) 녹화 */
  onRecordOnly: (kind: 'next' | 'prev') => void
}

const DELAY_CHOICES: [number, string][] = [
  [0, '바로'],
  [500, '0.5초'],
  [1000, '1초'],
  [2000, '2초'],
  [3000, '3초'],
]

export function CameraPanel(p: Props) {
  const meta = MODE_META[p.mode]
  const running = p.status === 'running'
  const calibrating = p.calibStep !== 'idle'
  const isGaze = p.mode === 'gaze'
  const isCustom = p.mode === 'custom'

  const CALIB_TEXT: Record<Exclude<CalibStep, 'idle'>, [string, string]> = {
    neutral: ['1/2 · 연주 자세로 편하게', '움직이지 말고 화면을 보세요'],
    gesture: [`2/2 · ${meta.howTo}`, '"다음 페이지"로 쓸 동작을 해 주세요'],
    gaze: ['시선 보정 중', '화면에 나오는 점을 눈으로 따라가세요'],
    cNeutral: ['● 녹화 중 · 평소 자세', '평소처럼 연주하세요'],
    cNext: ['● 녹화 중 · 다음 동작', '동작을 하고 유지하세요'],
    cPrev: ['● 녹화 중 · 이전 동작', '동작을 하고 유지하세요'],
  }
  const [calibTitle, calibSub] = p.calibStep === 'idle' ? ['', ''] : CALIB_TEXT[p.calibStep]

  return (
    <aside className="panel">
      <div className="cam" data-mirror={p.mirror}>
        <video ref={p.videoRef} playsInline muted autoPlay className="cam-video" />
        <canvas ref={p.canvasRef} className="cam-overlay" />

        {!running && (
          <div className="cam-idle">
            {p.status === 'loading' ? (
              <>
                <span className="spinner" />
                <p>얼굴 인식 모델 불러오는 중…</p>
              </>
            ) : (
              <>
                <button className="btn primary" onClick={p.onStart}>
                  카메라 켜기
                </button>
                <p className="muted small">영상은 이 기기 안에서만 처리되고 저장·전송되지 않아요.</p>
                {p.error && <p className="error small">{p.error}</p>}
              </>
            )}
          </div>
        )}

        {running && (
          <div className="cam-hud">
            <span className={`chip ${p.faceVisible ? 'ok' : 'warn'}`}>{p.faceVisible ? '● 인식 중' : '얼굴이 안 보여요'}</span>
            <span className="chip ghost">
              {p.perf.fps}fps · {p.perf.inferMs.toFixed(0)}ms
            </span>
          </div>
        )}

        {calibrating && (
          <div className="cam-calib">
            <strong>{calibTitle}</strong>
            <span>{calibSub}</span>
            <div className="calib-bar">
              <div style={{ width: `${Math.round(p.calibProgress * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="seg" role="tablist" aria-label="제스처 종류">
        {(Object.keys(MODE_META) as GestureMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={p.mode === m}
            className={p.mode === m ? 'on' : ''}
            onClick={() => p.onModeChange(m)}
            disabled={calibrating}
            title={MODE_META[m].label}
          >
            {MODE_META[m].short}
          </button>
        ))}
      </div>
      <p className="muted small hint">
        <b>{meta.label}</b> · {meta.howTo} · <span className="dim">{meta.goodFor}</span>
      </p>

      <div className="delay-row">
        <span className="delay-label" id="delay-label">
          넘기기 전 대기
        </span>
        <div className="seg small" role="group" aria-labelledby="delay-label">
          {DELAY_CHOICES.map(([ms, label]) => (
            <button key={ms} className={p.turnDelayMs === ms ? 'on' : ''} onClick={() => p.onTurnDelay(ms)} aria-pressed={p.turnDelayMs === ms}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isGaze ? (
        <GazeMap
          point={p.gaze.point}
          rect={p.gaze.rect}
          zone={p.gaze.zone}
          inZone={p.gaze.inZone}
          holdProgress={p.holdProgress}
          active={p.side === 1}
          hasModel={p.gaze.hasModel}
          errorPx={p.gaze.errorPx}
          dwellMs={p.gaze.dwellMs}
        />
      ) : (
        <>
          <label className="toggle compact">
            <span>
              이전 페이지 제스처
              <small className="muted">
                {!isCustom
                  ? '반대 방향으로 같은 동작을 하면 이전 페이지'
                  : p.custom.prev
                    ? '녹화한 이전 동작을 하면 이전 페이지'
                    : p.custom.hasModel
                      ? '아래 「이전 동작 녹화」로 언제든 추가할 수 있어요'
                      : '켜고 「동작 녹화」를 하면 이전 동작도 함께 녹화해요'}
              </small>
            </span>
            <input type="checkbox" checked={!p.forwardOnly} onChange={(e) => p.onForwardOnly(!e.target.checked)} />
          </label>
          <SignalMeter
            d={p.d}
            threshold={p.threshold}
            range={meta.range}
            holdProgress={p.holdProgress}
            side={p.side}
            forwardOnly={p.forwardOnly}
            unit={meta.unit}
            digits={meta.digits}
          />
          <SignalChart bufferRef={p.chartRef} threshold={p.threshold} range={meta.range} forwardOnly={p.forwardOnly} />
          {isCustom && (
            <div className="learned">
              {p.custom.next ? (
                <>
                  <div className="learned-row">
                    <b className="next-text">다음</b>
                    <span>{p.custom.next.summary.join(' · ') || '여러 부위의 작은 변화'}</span>
                    <span className={`tag ${p.custom.next.ok ? 'good' : 'bad'}`}>{p.custom.next.ok ? '구분 잘 됨' : '애매함'}</span>
                    <button
                      className="btn ghost small learned-redo"
                      onClick={() => p.onRecordOnly('next')}
                      disabled={!running || calibrating}
                      aria-label="다음 동작만 다시 녹화"
                      title={running ? '다음 동작만 다시 녹화 (평소 자세·이전 동작은 그대로)' : '카메라를 켜면 녹화할 수 있어요'}
                    >
                      <RotateCcw size={14} /> 다시
                    </button>
                  </div>
                  {p.custom.prev ? (
                    <div className="learned-row">
                      <b className="prev-text">이전</b>
                      <span>{p.custom.prev.summary.join(' · ') || '여러 부위의 작은 변화'}</span>
                      <span className={`tag ${p.custom.prev.ok ? 'good' : 'bad'}`}>{p.custom.prev.ok ? '구분 잘 됨' : '애매함'}</span>
                      <button
                        className="btn ghost small learned-redo"
                        onClick={() => p.onRecordOnly('prev')}
                        disabled={!running || calibrating}
                        aria-label="이전 동작만 다시 녹화"
                        title={running ? '이전 동작만 다시 녹화 (평소 자세·다음 동작은 그대로)' : '카메라를 켜면 녹화할 수 있어요'}
                      >
                        <RotateCcw size={14} /> 다시
                      </button>
                    </div>
                  ) : (
                    <div className={`learned-row learned-add ${p.forwardOnly ? '' : 'wanted'}`}>
                      <b className="prev-text">이전</b>
                      <span className="muted">{p.forwardOnly ? '없음' : '아직 없어요'}</span>
                      <button
                        className={`btn small ${p.forwardOnly ? '' : 'primary'}`}
                        onClick={() => p.onRecordOnly('prev')}
                        disabled={!running || calibrating}
                        title={running ? '이전 페이지 동작만 녹화해서 추가 (처음부터 다시 녹화하지 않아도 돼요)' : '카메라를 켜면 녹화할 수 있어요'}
                      >
                        <Plus size={14} strokeWidth={2.5} /> 이전 동작 녹화
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="muted small">
                  「동작 녹화」를 누르고 ① 평소처럼 연주 5초 → ② 넘길 때 쓸 동작 3초를 녹화하세요. 눈썹 올리기, 볼 부풀리기, 입 내밀기, 고개
                  끄덕이기 등 무엇이든 돼요. 이전 페이지 동작은 나중에 따로 추가해도 돼요.
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="row gap">
        <button className="btn primary grow" onClick={p.onCalibrate} disabled={!running || calibrating}>
          {isGaze ? '시선 캘리브레이션' : isCustom ? '동작 녹화' : '캘리브레이션'}
        </button>
        <button
          className="btn"
          onClick={p.onRebaseline}
          disabled={!running || calibrating || (isGaze && !p.gaze.hasModel) || (isCustom && !p.custom.hasModel)}
          title={
            isGaze
              ? '▶ 버튼을 잠깐 바라보며 위치를 다시 맞춤'
              : isCustom
                ? '평소 연주 자세만 3초 다시 녹화 (동작은 그대로)'
                : '지금 자세를 중립으로 다시 저장'
          }
        >
          {isGaze ? '빠른 보정' : '기준 다시'}
        </button>
        {!isGaze && !isCustom && (
          <button className="btn" onClick={p.onFlip} disabled={calibrating} title="다음/이전 방향 바꾸기" aria-label="다음/이전 방향 바꾸기">
            <ArrowLeftRight size={18} />
          </button>
        )}
      </div>
      {running && (
        <button className="btn ghost small" onClick={p.onStop}>
          카메라 끄기
        </button>
      )}
    </aside>
  )
}
