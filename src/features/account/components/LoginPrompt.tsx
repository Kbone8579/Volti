import { useEffect, useRef, useState } from 'react'
import { CloudUpload, LogIn } from 'lucide-react'

const OFF_KEY = 'volti/login-prompt-off'

/** 「다시 묻지 않기」를 골랐는지 */
export function loginPromptOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1'
  } catch {
    return false
  }
}

interface Props {
  /** Google 로그인이 켜져 있으면 「Google 계정으로 로그인」, 아니면(개발용 로그인만) 「로그인」 */
  google: boolean
  onLogin: () => void
  /** 로그인 없이 이 기기에만 저장하고 계속 */
  onSkip: () => void
  /** 아무것도 안 하고 닫기 (바깥 · Esc) */
  onClose: () => void
}

/** 로그인 안 한 채로 악보를 넣으려 할 때: 계정에 백업하자고 권유 */
export function LoginPrompt({ google, onLogin, onSkip, onClose }: Props) {
  const [dontAsk, setDontAsk] = useState(false)
  const loginBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => loginBtn.current?.focus(), [])

  const skip = () => {
    if (dontAsk) {
      try {
        localStorage.setItem(OFF_KEY, '1')
      } catch {
        // 저장이 막힌 환경 — 다음에 또 물어봄
      }
    }
    onSkip()
  }

  return (
    <div
      className="login-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="login-prompt" role="dialog" aria-modal="true" aria-labelledby="login-prompt-title">
        <span className="login-prompt-icon" aria-hidden>
          <CloudUpload size={26} strokeWidth={1.75} />
        </span>
        <h2 id="login-prompt-title">악보를 계정에 백업할까요?</h2>
        <p>
          로그인하지 않으면 악보가 <b>이 브라우저에만</b> 저장돼서, 브라우저 데이터(캐시)를 지우면 함께 사라져요. 로그인하면 계정에 저장되고 다른 기기에서도
          그대로 볼 수 있어요.
        </p>
        <div className="login-prompt-actions">
          <button ref={loginBtn} className="btn primary big" onClick={onLogin}>
            <LogIn size={18} /> {google ? 'Google 계정으로 로그인' : '로그인'}
          </button>
          <button className="btn big" onClick={skip}>
            로그인 없이 이 기기에만 저장
          </button>
        </div>
        <p className="login-prompt-legal">
          로그인하면{' '}
          <a href="/terms.html" target="_blank" rel="noopener">
            이용약관
          </a>
          과{' '}
          <a href="/privacy.html" target="_blank" rel="noopener">
            개인정보처리방침
          </a>
          에 동의하게 돼요.
        </p>
        <label className="login-prompt-dontask">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          다시 묻지 않기
        </label>
      </div>
    </div>
  )
}
