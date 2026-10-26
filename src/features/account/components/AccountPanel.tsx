import { useState } from 'react'
import { CloudUpload, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { formatBytes } from '@/features/library'
import { type Sync, syncStatusText } from '@/features/sync'
import type { Account } from '../hooks/useAccount'

interface Props {
  account: Account
  sync: Sync
}

function Avatar({ name, picture }: { name: string; picture: string | null }) {
  const [broken, setBroken] = useState(false)
  if (picture && !broken) return <img className="acct-avatar" src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  return (
    <span className="acct-avatar" aria-hidden>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

function LegalLinks({ signedOut }: { signedOut?: boolean }) {
  return (
    <p className="muted small acct-legal">
      {signedOut ? '로그인하면 ' : ''}
      <a href="/terms.html" target="_blank" rel="noopener">
        이용약관
      </a>
      {signedOut ? '과 ' : ' · '}
      <a href="/privacy.html" target="_blank" rel="noopener">
        개인정보처리방침
      </a>
      {signedOut ? '에 동의하게 돼요.' : ''}
    </p>
  )
}

function WhatSyncs() {
  return (
    <>
      <h3>무엇이 맞춰지나요</h3>
      <ul className="acct-list">
        <li>
          <b>같이 써요</b> 악보 파일 · 제목 · 보던 쪽 · 악보별 배율, 제스처 종류 · 유지·대기 시간 · 이전 페이지 사용 · 보기 방식, 녹화한 「내 동작」
        </li>
        <li>
          <b>기기마다 따로</b> 고개·입·윙크 기준값(캘리브레이션) · 시선 보정 · 카메라 해상도·fps — 카메라 위치와 기기 성능에 따라 달라서요
        </li>
        <li>여러 기기에서 같은 악보를 고치면 나중에 고친 쪽으로 맞춰져요.</li>
      </ul>
    </>
  )
}

function DevLogin({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState('dev@localhost')
  return (
    <form
      className="acct-dev"
      onSubmit={(e) => {
        e.preventDefault()
        onLogin(email.trim() || 'dev@localhost')
      }}
    >
      <small className="muted">개발용 로그인 (내 컴퓨터에서만 · 배포된 사이트에는 없음)</small>
      <div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="개발용 이메일" />
        <button className="btn small" type="submit">
          테스트 계정으로 로그인
        </button>
      </div>
    </form>
  )
}

/** 설정 › 계정 탭 */
export function AccountPanel({ account, sync }: Props) {
  const { state } = account
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (state.status === 'loading') return <p className="muted small acct-msg">계정 정보를 확인하는 중…</p>
  if (state.status === 'unavailable')
    return <p className="muted small acct-msg">이 주소에서는 계정 기능을 쓸 수 없어요. 악보는 이 브라우저에만 저장돼요.</p>
  if (state.status === 'disabled')
    return (
      <p className="muted small acct-msg">
        서버에 Google 로그인이 아직 설정되지 않았어요. 관리자라면 README 의 「계정 · 동기화 설정」을 따라 클라이언트 ID 를 넣어 주세요.
      </p>
    )

  if (state.status === 'signedOut')
    return (
      <>
        <div className="acct-hero">
          <CloudUpload size={28} strokeWidth={1.75} aria-hidden />
          <strong>악보를 계정에 백업하세요</strong>
          <p className="muted small">
            지금은 이 브라우저에만 저장돼서, 브라우저 데이터를 지우면 함께 사라져요. 로그인하면 악보와 설정이 계정에 저장되고, 다른 태블릿 · 컴퓨터에서도 그대로
            이어서 볼 수 있어요.
          </p>
          {state.config.google && (
            <button className="btn primary" onClick={() => account.signInWithGoogle()}>
              <LogIn size={18} /> Google 계정으로 로그인
            </button>
          )}
          {state.config.devLogin && <DevLogin onLogin={account.signInForDev} />}
        </div>
        <WhatSyncs />
        <LegalLinks signedOut />
      </>
    )

  const { user, offline } = state
  const status = offline ? '인터넷 연결 없음 · 연결되면 자동으로 맞춰요' : syncStatusText(sync)
  const warn = !offline && (sync.status === 'error' || sync.notUploaded > 0 || !!sync.error)
  const pct = sync.usage !== null && sync.quota ? Math.min(100, (sync.usage / sync.quota) * 100) : null

  return (
    <>
      <div className="acct-card">
        <Avatar name={user.name || user.email} picture={user.picture} />
        <div className="acct-who">
          <strong>{user.name || user.email}</strong>
          <small className="muted">{user.email}</small>
        </div>
      </div>

      <div className={`acct-status ${warn ? 'warn' : ''}`} role="status">
        {status}
      </div>

      {pct !== null && (
        <div className="acct-usage">
          <div className="field-head">
            <span>서버 저장 공간</span>
            <strong>
              {formatBytes(sync.usage!)} / {formatBytes(sync.quota!)}
            </strong>
          </div>
          <div className="acct-meter" aria-hidden>
            <span style={{ width: `${Math.max(pct, 1)}%` }} />
          </div>
        </div>
      )}

      <div className="acct-actions">
        <button className="btn" onClick={() => void sync.syncNow()} disabled={offline || sync.status === 'syncing'}>
          <RefreshCw size={16} /> 지금 맞추기
        </button>
        <button className="btn" onClick={() => void account.signOut()}>
          <LogOut size={16} /> 로그아웃
        </button>
      </div>
      <p className="muted small">로그아웃해도 이 기기에 받아 둔 악보는 그대로 남아요.</p>

      <WhatSyncs />

      <h3>계정 삭제</h3>
      <p className="muted small">서버에 저장된 악보 · 설정과 계정을 모두 지워요. 이 기기의 악보는 지우지 않아요.</p>
      {confirmDelete ? (
        <div className="acct-actions">
          <button className="btn danger" onClick={() => void account.deleteAccount()} disabled={offline}>
            정말 지우기
          </button>
          <button className="btn" onClick={() => setConfirmDelete(false)}>
            취소
          </button>
        </div>
      ) : (
        <div className="acct-actions">
          <button className="btn danger-ghost" onClick={() => setConfirmDelete(true)} disabled={offline}>
            계정 삭제…
          </button>
        </div>
      )}
      <LegalLinks />
    </>
  )
}
