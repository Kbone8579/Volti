import { LogIn, TriangleAlert } from 'lucide-react'

interface Props {
  /** 이 브라우저에만 있는 내 악보 수 (샘플 제외) */
  count: number
  google: boolean
  onLogin: () => void
}

/** 라이브러리 위 경고 띠 — 로그인 안 했고 내 악보가 있을 때 */
export function BackupWarning({ count, google, onLogin }: Props) {
  return (
    <div className="backup-warn" role="note">
      <TriangleAlert size={18} aria-hidden />
      <span>
        악보 <b>{count}개</b>가 이 브라우저에만 있어요. 브라우저 데이터(캐시)를 지우면 사라져요.
      </span>
      <button className="btn small primary" onClick={onLogin}>
        <LogIn size={15} /> {google ? '로그인해서 백업' : '로그인'}
      </button>
    </div>
  )
}
