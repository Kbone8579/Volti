import type { Notice } from '../hooks/useNotice'
import './toast.css'

/** 화면 아래 짧은 알림. 「되돌리기」 같은 버튼을 하나 달 수 있음. */
export function Toast({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null
  return (
    <div key={notice.key} className={`toast ${notice.tone} ${notice.action ? 'has-action' : ''}`} role="status">
      <span>{notice.text}</span>
      {notice.action && (
        <button
          className="toast-action"
          onClick={() => {
            const run = notice.action!.run
            onDismiss()
            run()
          }}
        >
          {notice.action.label}
        </button>
      )}
    </div>
  )
}
