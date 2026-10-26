/**
 * 계정 — Google 로그인 · 로그아웃 · 계정 삭제, 설정 서랍의 「계정」 탭 화면, 로그인 권유(악보 추가 전 창 · 라이브러리 경고 띠)
 * (서버와 실제로 맞추는 일은 features/sync, 서버 호출은 shared/api)
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/account`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './account.css'

export { AccountPanel } from './components/AccountPanel'
export { BackupWarning } from './components/BackupWarning'
export { LoginPrompt, loginPromptOff } from './components/LoginPrompt'
export { type Account, type AccountState, useAccount } from './hooks/useAccount'
