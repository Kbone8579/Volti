import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  /** 정규화된 편차 (다음 방향 = +) */
  d: number | null
  threshold: number
  range: number
  holdProgress: number
  side: 0 | 1 | -1
  forwardOnly: boolean
  unit: string
  digits: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 가운데가 중립, 오른쪽 끝 구간이 "다음", 왼쪽 끝 구간이 "이전" */
export function SignalMeter({ d, threshold, range, holdProgress, side, forwardOnly, unit, digits }: Props) {
  const pos = (v: number) => 50 + (clamp(v, -range, range) / range) * 50
  const thrPos = pos(threshold)
  const thrNeg = pos(-threshold)
  const marker = d === null ? null : pos(d)
  const active = side !== 0

  return (
    <div className="meter" aria-label="제스처 게이지">
      <div className="meter-labels">
        <span className={`icon-text ${forwardOnly ? 'muted strike' : 'prev-text'}`}>
          <ChevronLeft size={14} strokeWidth={2.5} /> 이전
        </span>
        <span className="meter-value">{d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(digits)}${unit}`}</span>
        <span className="icon-text next-text">
          다음 <ChevronRight size={14} strokeWidth={2.5} />
        </span>
      </div>
      <div className="meter-track">
        <div className={`meter-zone prev ${forwardOnly ? 'off' : ''}`} style={{ left: 0, width: `${thrNeg}%` }} />
        <div className="meter-zone next" style={{ left: `${thrPos}%`, right: 0 }} />
        <div className="meter-center" />
        {marker !== null && (
          <>
            <div
              className={`meter-fill ${d! >= 0 ? 'pos' : 'neg'}`}
              style={d! >= 0 ? { left: '50%', width: `${marker - 50}%` } : { left: `${marker}%`, width: `${50 - marker}%` }}
            />
            <div className={`meter-marker ${active ? 'hot' : ''}`} style={{ left: `${marker}%` }} />
          </>
        )}
      </div>
      <div className="hold-track" aria-label="유지 진행도">
        <div
          className={`hold-fill ${side === -1 ? 'prev' : 'next'}`}
          style={{ width: `${Math.round(holdProgress * 100)}%`, opacity: active ? 1 : 0 }}
        />
      </div>
    </div>
  )
}
