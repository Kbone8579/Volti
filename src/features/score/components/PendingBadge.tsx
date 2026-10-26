import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PendingTurn } from '../lib/turnScheduler'

/** 넘김 예약 카운트다운: "▶ 1.4초 뒤 다음 페이지 · 취소" */
export function PendingBadge({ pending, onCancel }: { pending: PendingTurn; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [pending.id])

  const total = Math.max(1, pending.dueAt - pending.startedAt)
  const left = Math.max(0, pending.dueAt - now)
  const isNext = pending.kind === 'next'

  return (
    <div className={`pending ${pending.kind}`} role="timer" aria-live="polite">
      <span className="pending-icon" aria-hidden>
        {isNext ? <ChevronRight size={18} strokeWidth={2.5} /> : <ChevronLeft size={18} strokeWidth={2.5} />}
      </span>
      <span className="pending-text">
        <b className="mono">{(left / 1000).toFixed(1)}초</b> 뒤 {isNext ? '다음' : '이전'} 페이지
      </span>
      <button className="pending-cancel" onClick={onCancel}>
        취소
      </button>
      <span className="pending-bar" aria-hidden>
        <span key={pending.id} style={{ animationDuration: `${total}ms` }} />
      </span>
    </div>
  )
}
