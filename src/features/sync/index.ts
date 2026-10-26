/**
 * 동기화 — 로그인하면 이 기기의 라이브러리(악보 파일 · 보던 쪽 · 배율)와 설정을 서버 계정과 맞춤
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/sync`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './sync.css'

export { BackupNote, SyncIndicator, syncStatusText } from './components/SyncIndicator'
export { type Sync, type SyncState, type SyncStatus, useSync } from './hooks/useSync'
export type { SyncResult } from './lib/syncEngine'
