import { Camera, ChevronRight, CircleCheck, Hand, ScanFace, Settings, ShieldCheck, Smile, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { DetectorPhase } from '@/features/gestures'
import type { TrackerStatus } from '@/features/camera'
import { useCoach } from '../hooks/useCoach'
import type { Tour, TourStep } from '../lib/tourState'
import { GestureDemo } from './GestureDemo'

/**
 * 30초 체험 화면: 처음 열면 뜨는 환영 창 + 단계별 안내 카드(해당 부분 옆에 화살표로 붙음).
 * 체험 진행(단계 넘기기·제스처 판정)은 App 이 하고, 여기서는 지금 단계에 맞는 안내만 그림.
 */
interface Props {
  tour: Tour
  /** 라이브러리·설정 등이 위에 덮여 있으면 안내 카드를 잠깐 숨김 */
  covered: boolean
  status: TrackerStatus
  error: string | null
  faceVisible: boolean
  calibProgress: number
  d: number | null
  threshold: number
  holdProgress: number
  side: 0 | 1 | -1
  phase: DetectorPhase
  holdMs: number
  /** 지금 「다음」으로 정해진 고개 방향 */
  turnSide: '오른쪽' | '왼쪽'
  onStart: () => void
  onClose: () => void
  onCamera: () => void
  onNoCam: () => void
  onBackToCamera: () => void
  onRetry: () => void
  onSkipTry: () => void
  onLibrary: () => void
  /** 「내 동작」으로 바꾸고 녹화 안내 */
  onCustom: () => void
}

/** 단계별로 테두리를 표시하고 안내 카드를 붙일 화면 요소 */
const RING_TARGET: Partial<Record<TourStep, string>> = {
  camera: '#camera-panel .cam',
  neutral: '#camera-panel .cam',
  try: '#camera-panel .meter',
  nocam: '.tb-center',
  done: '#camera-panel .seg[role="tablist"]',
}

/** 맨 위 작은 줄: 「3/3 · 넘겨 보기」 + 진행 막대 */
function Kicker({ at, label }: { at?: 1 | 2 | 3; label: string }) {
  return (
    <div className="tour-kicker">
      <span>{at ? `${at}/3 · ${label}` : label}</span>
      {at && (
        <span className="tour-progress" aria-hidden>
          {[1, 2, 3].map((i) => (
            <i key={i} className={i < at ? 'done' : i === at ? 'on' : ''} />
          ))}
        </span>
      )}
    </div>
  )
}

export function TourLayer(p: Props) {
  const step = p.tour.step
  const showCard = step !== 'off' && step !== 'welcome' && !p.covered
  const cardRef = useRef<HTMLDivElement>(null)
  const { ring, place } = useCoach(showCard ? (RING_TARGET[step] ?? null) : null, cardRef)

  // 「넘겨 보기」에서 한참 안 되면 도움말
  const [slow, setSlow] = useState(false)
  const tryStart = p.tour.step === 'try' && p.tour.turns === 0
  useEffect(() => {
    setSlow(false)
    if (!tryStart) return
    const id = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(id)
  }, [tryStart])

  const startBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (step === 'welcome') startBtn.current?.focus()
  }, [step])

  if (step === 'off') return null

  if (step === 'welcome') {
    return (
      <div className="tour-backdrop">
        <div className="tour-welcome" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <img className="tour-mark" src="/brand/volti-mark.svg" alt="" aria-hidden />
          <h2 id="tour-title">30초 만에 직접 넘겨 볼까요?</h2>
          <p className="tour-lead">
            카메라로 작은 동작을 알아보고 악보를 넘겨요.
            <br />
            샘플 악보로 <b>고개 동작 한 번</b>만 해 보면 바로 감이 와요.
          </p>
          <GestureDemo />
          <ol className="tour-preview">
            <li>
              <b>1</b>카메라 켜기
            </li>
            <li>
              <b>2</b>정면 보기
            </li>
            <li>
              <b>3</b>고개 돌려 넘기기
            </li>
          </ol>
          <div className="tour-actions">
            <button ref={startBtn} className="btn primary big" onClick={p.onStart}>
              체험 시작
            </button>
            <button className="btn big" onClick={p.onClose}>
              건너뛰기
            </button>
          </div>
          <p className="tour-also">
            고개 말고도 입·윙크·시선, 그리고 <b>직접 녹화한 나만의 동작</b>으로도 넘길 수 있어요
          </p>
          <p className="tour-foot">
            <span className="icon-text">
              <ShieldCheck size={14} /> 영상은 이 기기 밖으로 나가지 않아요
            </span>{' '}
            ·{' '}
            <span className="icon-text">
              <Settings size={14} /> 설정에서 다시 볼 수 있어요
            </span>
          </p>
        </div>
      </div>
    )
  }

  if (!showCard) return null

  const hold = Math.round(p.holdMs / 100) / 10
  const dir = <em className="tour-dir">{p.turnSide}</em>
  let body: ReactNode
  if (step === 'camera') {
    const loading = p.status === 'loading'
    const running = p.status === 'running'
    body = (
      <>
        <Kicker at={1} label="카메라" />
        <h3 className="tour-title">{running ? '얼굴을 찾는 중이에요' : '카메라를 켜 주세요'}</h3>
        {running ? (
          <p className="tour-lead">
            <span className="spinner tiny" /> 카메라 화면 안에 <b>얼굴이 들어오게</b> 해 주세요.
          </p>
        ) : loading ? (
          <p className="tour-lead">
            <span className="spinner tiny" /> 얼굴 인식을 준비하고 있어요. 처음엔 몇 초 걸려요.
          </p>
        ) : (
          <p className="tour-lead">얼굴이 화면에 보이게 기기를 놓고 켜면 돼요.</p>
        )}
        {p.error && !running && !loading && <p className="tour-note error">{p.error}</p>}
        {!running && !p.error && (
          <p className="tour-note icon-text">
            <ShieldCheck size={15} /> 영상은 이 기기 안에서만 처리돼요
          </p>
        )}
        <div className="tour-actions">
          {!running && (
            <button className="btn primary" onClick={p.onCamera} disabled={loading}>
              {p.error ? '다시 켜 보기' : '카메라 켜기'}
            </button>
          )}
          <button className="btn" onClick={p.onNoCam}>
            카메라 없이 둘러보기
          </button>
        </div>
      </>
    )
  } else if (p.tour.step === 'neutral') {
    body = (
      <>
        <Kicker at={2} label="기준 잡기" />
        {p.tour.failed ? (
          <>
            <h3 className="tour-title">얼굴이 잘 안 보였어요</h3>
            <p className="tour-lead">카메라 정면에서 다시 해 볼까요?</p>
            <div className="tour-actions">
              <button className="btn primary" onClick={p.onRetry}>
                다시 하기
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="tour-title">편하게 화면을 바라보세요</h3>
            <p className="tour-lead">
              지금 자세를 <b>기준</b>으로 잡아요. 잠깐만 그대로!
            </p>
            <div className="tour-bar" role="progressbar" aria-label="기준 잡는 중" aria-valuenow={Math.round(p.calibProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.round(p.calibProgress * 100)}%` }} />
            </div>
          </>
        )}
      </>
    )
  } else if (p.tour.step === 'try') {
    const { turns, flipped } = p.tour
    const amount = p.d === null ? 0 : Math.min(1, Math.abs(p.d) / Math.max(1e-6, p.threshold))
    const holding = p.side !== 0
    const resting = p.phase === 'cooldown' || p.phase === 'waitNeutral'
    const [cue, tone] =
      p.d === null
        ? ['얼굴이 안 보여요', 'warn']
        : holding
          ? ['좋아요, 그대로!', 'ok']
          : resting
            ? amount > 0.5
              ? ['이제 정면으로 돌아오세요', 'ok']
              : ['', '']
            : amount > 0.45
              ? ['조금만 더 돌려요', '']
              : ['', '']
    body = (
      <>
        <Kicker at={3} label="넘겨 보기" />
        {turns === 0 ? (
          <>
            <h3 className="tour-title">
              고개를 {dir}으로 돌리고
              <br />
              잠깐 멈추세요
            </h3>
            <div className="tour-visual">
              <GestureDemo side={p.turnSide === '왼쪽' ? 'left' : 'right'} />
              <p className="tour-lead">
                막대가 <b>끝까지 차면</b> 넘어가요
                <span className="tour-sub">{hold}초쯤 멈추면 돼요</span>
              </p>
            </div>
          </>
        ) : (
          <>
            <h3 className="tour-title with-icon">
              <CircleCheck className="tour-ok" size={24} strokeWidth={2.25} />
              넘어갔어요! 한 번 더
            </h3>
            <p className="tour-lead">
              <b>정면으로 돌아왔다가</b> 다시 {dir}으로 돌려요.
            </p>
          </>
        )}
        <div className="tour-live">
          <div className="tour-meter" aria-hidden>
            <div className="tm-amount" style={{ width: `${Math.round(amount * 100)}%` }} />
            <div className="tm-hold" style={{ width: `${holding ? Math.round(p.holdProgress * 100) : 0}%` }} />
          </div>
          <div className={`tour-cue ${tone}`} aria-live="polite">
            {cue}
          </div>
        </div>
        {turns === 0 ? (
          <p className="tour-note">반대쪽이 편하면 그쪽으로 해도 돼요.</p>
        ) : (
          <p className="tour-note">
            {flipped ? `${p.turnSide}으로 돌리는 걸 「다음」으로 정했어요. ` : ''}돌린 채로 있으면 한 번만 넘어가서 여러 장이 넘어가지 않아요.
          </p>
        )}
        {slow && <p className="tour-note">잘 안 되나요? 조금 더 크게 돌려 보세요. 패널의 「캘리브레이션」으로 내 동작 크기에 맞출 수도 있어요.</p>}
        <div className="tour-actions">
          <button className="btn ghost small" onClick={p.onSkipTry}>
            {turns === 0 ? '건너뛰기' : '이제 됐어요'}
          </button>
        </div>
      </>
    )
  } else if (step === 'nocam') {
    body = (
      <>
        <Kicker label="카메라 없이 둘러보기" />
        <h3 className="tour-title">이렇게 넘어가요</h3>
        <div className="tour-visual">
          <GestureDemo />
          <p className="tour-lead">
            카메라를 켜면 고개를 돌린 채 <b>잠깐 멈추는 것</b>만으로 넘어가요
          </p>
        </div>
        <p className="tour-lead">지금은 손으로 넘겨 보세요</p>
        <ul className="tour-keys">
          <li>악보 오른쪽 탭</li>
          <li>옆으로 밀기</li>
          <li>→ 키</li>
          <li className="icon-text">
            <ChevronRight size={15} strokeWidth={2.5} /> 버튼
          </li>
        </ul>
        <div className="tour-actions">
          <button className="btn small" onClick={p.onBackToCamera}>
            카메라로 해 보기
          </button>
          <button className="btn ghost small" onClick={p.onClose}>
            그만하기
          </button>
        </div>
      </>
    )
  } else if (p.tour.step === 'done') {
    const cam = p.tour.viaCamera
    body = (
      <>
        <Kicker label="체험 완료" />
        <h3 className="tour-title with-icon">
          <CircleCheck className="tour-ok" size={24} strokeWidth={2.25} />
          {cam ? '준비 끝!' : '잘했어요!'}
        </h3>
        <p className="tour-lead">{cam ? '이제 손 대지 않고 넘길 수 있어요.' : '이렇게 넘겨요. 알아 두면 좋은 것들:'}</p>
        <ul className="tour-tips">
          <li className="tt-main">
            <span className="tt-icon" aria-hidden>
              <ScanFace size={20} />
            </span>
            <span>
              <b>나만의 동작 만들기</b>
              <small>「내 동작」 탭에서 녹화하면 눈썹 올리기, 볼 부풀리기, 입 내밀기 등 원하는 동작으로 넘겨요. 이전 페이지 동작은 나중에 따로 추가해도 돼요</small>
            </span>
          </li>
          <li>
            <span className="tt-icon" aria-hidden>
              <Smile size={20} />
            </span>
            <span>
              <b>다른 동작으로 바꾸기</b>
              <small>입 옆으로·윙크·시선 — 악기에 맞게 고르세요</small>
            </span>
          </li>
          <li>
            <span className="tt-icon" aria-hidden>
              <Timer size={20} />
            </span>
            <span>
              <b>넘기기 전 대기</b>
              <small>동작하고 몇 초 뒤에 넘기기</small>
            </span>
          </li>
          {cam ? (
            <li>
              <span className="tt-icon" aria-hidden>
                <Hand size={20} />
              </span>
              <span>
                <b>손으로도 넘기기</b>
                <small>화면 양옆 탭·밀기, ←/→ 키, 블루투스 페달</small>
              </span>
            </li>
          ) : (
            <li>
              <span className="tt-icon" aria-hidden>
                <Camera size={20} />
              </span>
              <span>
                <b>카메라로 해 보기</b>
                <small>설정 → 30초 체험</small>
              </span>
            </li>
          )}
        </ul>
        <div className="tour-actions">
          <button className="btn primary" onClick={p.onLibrary}>
            내 악보 추가하기
          </button>
          <button className="btn" onClick={p.onCustom}>
            나만의 동작 만들기
          </button>
          <button className="btn ghost" onClick={p.onClose}>
            샘플로 더 연습
          </button>
        </div>
      </>
    )
  }

  const style: CSSProperties =
    place.mode === 'side'
      ? ({ top: place.top, right: place.right, maxWidth: place.maxW, '--arrow': `${place.arrow}px` } as CSSProperties)
      : place.mode === 'below'
        ? ({ top: place.top, left: place.left, '--arrow': `${place.arrow}px` } as CSSProperties)
        : {}
  const bodyStyle: CSSProperties | undefined = place.mode === 'side' ? { maxHeight: place.maxH } : undefined

  return (
    <>
      {ring && (
        <div className="tour-ring" aria-hidden style={{ left: ring.left - 6, top: ring.top - 6, width: ring.width + 12, height: ring.height + 12 }} />
      )}
      <div ref={cardRef} className={`tour-card at-${place.mode}`} style={style} role="region" aria-label="Volti 체험 안내">
        {place.mode !== 'top' && <span className="tour-arrow" aria-hidden />}
        <div className="tour-body" style={bodyStyle} key={step}>
          {step !== 'done' && step !== 'nocam' && (
            <button className="tour-x btn ghost icon" onClick={p.onClose} aria-label="체험 그만하기" title="체험 그만하기 (Esc)">
              <X size={18} />
            </button>
          )}
          {body}
        </div>
      </div>
    </>
  )
}
