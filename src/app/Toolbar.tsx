import { ChevronLeft, ChevronRight, LibraryBig, Settings as SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Settings } from '@/features/settings'

interface Props {
  libraryOpen: boolean
  onLibrary: () => void
  /** 지금 보는 악보 제목 (라이브러리가 열려 있으면 빈칸) */
  title: string
  /** 「3 / 8」, 「3–4 / 8」 */
  pager: string
  canTurn: boolean
  onPrev: () => void
  onNext: () => void
  viewMode: Settings['viewMode']
  onViewMode: (v: Settings['viewMode']) => void
  /** 확대/축소 컨트롤 자리 (ZoomControl) */
  zoom: ReactNode
  /** 계정 동기화 표시 자리 (로그인했을 때 SyncIndicator) */
  sync?: ReactNode
  onSettings: () => void
}

const VIEW_MODES = [
  ['single', '한 쪽'],
  ['spread', '펼치기'],
  ['auto', '자동'],
] as const

/** 상단 바: [로고 · 라이브러리 · 제목]  [◀ 쪽수 ▶]  [페이지 배치 · 확대 · 동기화 · 설정] */
export function Toolbar(p: Props) {
  return (
    <header className="toolbar">
      <div className="tb-left">
        <picture className="brand" title="Volti — 손 대지 않고 넘기는 악보">
          <source srcSet="/brand/volti-lockup-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/brand/volti-lockup.svg" alt="Volti" draggable={false} />
        </picture>
        <button className={`btn ${p.libraryOpen ? 'active' : ''}`} onClick={p.onLibrary} aria-pressed={p.libraryOpen}>
          <LibraryBig size={18} /> 라이브러리
        </button>
        <span className="title" title={p.title}>
          {p.title}
        </span>
      </div>

      <div className="tb-center">
        <button className="btn icon" onClick={p.onPrev} disabled={!p.canTurn} aria-label="이전 페이지">
          <ChevronLeft size={22} />
        </button>
        <span className="pager mono">{p.pager}</span>
        <button className="btn icon" onClick={p.onNext} disabled={!p.canTurn} aria-label="다음 페이지">
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="tb-right">
        <div className="seg small" aria-label="페이지 배치">
          {VIEW_MODES.map(([v, label]) => (
            <button key={v} className={p.viewMode === v ? 'on' : ''} onClick={() => p.onViewMode(v)}>
              {label}
            </button>
          ))}
        </div>
        {p.zoom}
        {p.sync}
        <button className="btn icon" onClick={p.onSettings} aria-label="설정">
          <SettingsIcon size={19} />
        </button>
      </div>
    </header>
  )
}
