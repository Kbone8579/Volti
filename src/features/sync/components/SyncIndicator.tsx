import { useEffect, useState } from 'react'
import { CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { relativeTime } from '@/features/library'
import type { Sync } from '../hooks/useSync'

/** 맞추는 중 표시는 잠깐이면 깜빡이지 않게 조금 늦게 보여 줌 */
function useDelayed(on: boolean, ms = 600) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on) {
      setShown(false)
      return
    }
    const id = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(id)
  }, [on, ms])
  return shown
}

/** 한 줄 상태 글 — 상단 바 버튼의 설명 · 계정 탭에서 같이 씀 */
export function syncStatusText(s: Pick<Sync, 'status' | 'progress' | 'lastSyncedAt' | 'error' | 'notUploaded'>, now = Date.now()): string {
  switch (s.status) {
    case 'syncing':
      return s.progress ? `맞추는 중 · 악보 ${s.progress.done}/${s.progress.total}` : '맞추는 중…'
    case 'offline':
      return '인터넷 연결 없음 · 연결되면 자동으로 맞춰요'
    case 'error':
      return s.error ?? '맞추지 못했어요. 잠시 뒤 다시 시도해요.'
    case 'synced':
      if (s.notUploaded) return `서버 공간이 모자라거나 파일이 너무 커서 악보 ${s.notUploaded}개는 이 기기에만 있어요`
      if (s.error) return s.error
      return `계정과 맞춤 · ${s.lastSyncedAt ? relativeTime(s.lastSyncedAt, now) : '방금'}`
    default:
      return '계정과 맞출 준비 중…'
  }
}

interface Props {
  sync: Sync
  onClick: () => void
}

/** 상단 바의 구름 버튼 — 로그인했을 때만 보임. 누르면 설정 › 계정 */
export function SyncIndicator({ sync, onClick }: Props) {
  const busy = useDelayed(sync.status === 'syncing')
  const warn = sync.status === 'error' || (sync.status === 'synced' && (sync.notUploaded > 0 || !!sync.error))
  const Icon = busy ? RefreshCw : sync.status === 'offline' ? CloudOff : warn ? CloudAlert : CloudCheck
  const label = syncStatusText(sync)
  return (
    <button className={`btn icon sync-ind ${warn ? 'warn' : ''} ${busy ? 'busy' : ''}`} onClick={onClick} aria-label={`계정 동기화: ${label}`} title={label}>
      <Icon size={19} />
    </button>
  )
}

interface NoteProps {
  /** 로그인 기능을 쓸 수 있는 환경인지 (서버가 있고 설정됨) */
  available: boolean
  signedIn: boolean
  sync: Sync
  onLogin: () => void
}

/** 라이브러리 위의 한 줄: 어디에 저장되는지 */
export function BackupNote({ available, signedIn, sync, onLogin }: NoteProps) {
  if (signedIn) return <span className="backup-note on">{syncStatusText(sync)}</span>
  return (
    <span className="backup-note">
      이 브라우저에만 저장돼요
      {available && (
        <>
          {' '}
          <button className="link-btn" onClick={onLogin}>
            로그인하고 계정에 백업하기
          </button>
        </>
      )}
    </span>
  )
}
