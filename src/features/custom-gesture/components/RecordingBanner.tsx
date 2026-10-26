/** 녹화 중인 단계 (App 의 녹화 진행 상태에서 화면에 필요한 것만) */
export interface RecordingUi {
  step: 'neutral' | 'next' | 'prev'
  /** false = 평소 자세만 다시 녹화 */
  full: boolean
  withPrev: boolean
  /** 동작 하나만 (다시) 녹화 */
  only?: 'next' | 'prev'
}

/** 「내 동작」 녹화 중 악보 위에 뜨는 배너: 지금 할 일 + 진행 막대 + 취소 */
export function RecordingBanner({ ui, progress, onCancel }: { ui: RecordingUi; progress: number; onCancel: () => void }) {
  const total = ui.withPrev ? 3 : 2
  return (
    <div className="rec-banner" aria-live="polite">
      <div className="rec-head">
        <span className="rec-dot" />
        <strong>
          {ui.only
            ? `${ui.only === 'prev' ? '이전' : '다음'} 페이지 동작${ui.only === 'next' ? ' 다시' : ''} 녹화`
            : !ui.full
              ? '평소 연주 자세 다시 녹화 (3초)'
              : ui.step === 'neutral'
                ? `1/${total} · 평소 연주 자세 (5초)`
                : ui.step === 'next'
                  ? `2/${total} · 다음 페이지 동작`
                  : `3/${total} · 이전 페이지 동작`}
        </strong>
      </div>
      <span>
        {ui.step === 'neutral'
          ? '악기를 들고 악보를 읽듯이 평소처럼 연주하세요. 일부러 멈추지 않아도 돼요.'
          : ui.step === 'next'
            ? '넘길 때 쓸 동작을 하고, 이 막대가 끝날 때까지 유지하세요.'
            : '다음 동작과 다른 동작을 하고, 이 막대가 끝날 때까지 유지하세요.'}
      </span>
      <div className="calib-bar">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <button className="btn small" onClick={onCancel}>
        취소 (Esc)
      </button>
    </div>
  )
}
