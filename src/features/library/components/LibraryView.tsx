import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Check, CirclePlay, Music, Pencil, Plus, Trash2 } from 'lucide-react'
import { formatBytes, relativeTime, type LibraryEntry } from '../lib/libraryDb'

interface Props {
  /** null = 불러오는 중 */
  entries: LibraryEntry[] | null
  available: boolean
  canClose: boolean
  currentId: string | null
  usage: number | null
  busy: boolean
  onClose: () => void
  onAdd: () => void
  onSample: () => void
  onOpen: (e: LibraryEntry) => void
  onRename: (id: string, title: string) => void
  /** 삭제 (되돌리기는 앱 알림에서) */
  onDelete: (ids: string[]) => void
  /** 30초 체험 시작 */
  onTour: () => void
  /** 어디에 저장되는지 한 줄 (features/sync 의 BackupNote). 없으면 「이 브라우저에 저장돼요」 */
  storageNote?: ReactNode
  /** 제목 아래 알림 띠 자리 (로그인 안 했을 때 features/account 의 BackupWarning) */
  notice?: ReactNode
}

type Sort = 'recent' | 'title' | 'added'

/** 썸네일 Blob → 화면용 URL (목록이 바뀌면 정리) */
function useThumbUrls(entries: LibraryEntry[] | null) {
  // URL을 만드는 것과 정리하는 것을 같은 effect에서 — 개발 모드(StrictMode)에서 effect가 두 번 돌아도
  // 이미 정리된 URL을 쓰지 않게 (예전엔 라이브러리를 다시 열면 썸네일이 깨질 수 있었음)
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    const m = new Map<string, string>()
    for (const e of entries ?? []) if (e.thumb) m.set(e.id, URL.createObjectURL(e.thumb))
    setUrls(m)
    return () => m.forEach((u) => URL.revokeObjectURL(u))
  }, [entries])
  return urls
}

export function LibraryView(p: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const thumbs = useThumbUrls(p.entries)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (p.entries ?? []).filter(
      (e) => !q || e.title.toLowerCase().includes(q) || e.fileNames.some((n) => n.toLowerCase().includes(q)),
    )
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'ko', { numeric: true }))
    else if (sort === 'added') list.sort((a, b) => b.createdAt - a.createdAt)
    else list.sort((a, b) => b.openedAt - a.openedAt)
    return list
  }, [p.entries, query, sort])

  // 목록에서 사라진 항목은 선택에서도 빼기
  useEffect(() => {
    if (!p.entries) return
    const ids = new Set(p.entries.map((e) => e.id))
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)))
      return next.size === s.size ? s : next
    })
  }, [p.entries])

  const commitRename = () => {
    if (!editing) return
    const title = editing.title.trim()
    if (title) p.onRename(editing.id, title)
    setEditing(null)
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const deleteSelected = () => {
    if (selected.size === 0) return
    p.onDelete([...selected])
    exitSelect()
  }

  const count = p.entries?.length ?? 0
  const allShownSelected = shown.length > 0 && shown.every((e) => selected.has(e.id))

  return (
    <section className="library" aria-label="내 악보 라이브러리">
      <header className="lib-head">
        <div className="lib-title">
          <h2>내 악보</h2>
          <span className="muted small">
            {p.available ? (
              <>
                {count}곡{p.usage !== null ? ` · ${formatBytes(p.usage)} 사용` : ''} · {p.storageNote ?? '이 브라우저에 저장돼요'}
              </>
            ) : (
              '이 환경에서는 보관함을 쓸 수 없어요'
            )}
          </span>
        </div>
        <div className="lib-actions">
          {!selecting && (
            <button className="btn primary" onClick={p.onAdd} disabled={p.busy}>
              {p.busy ? (
                '여는 중…'
              ) : (
                <>
                  <Plus size={18} strokeWidth={2.25} /> 악보 추가
                </>
              )}
            </button>
          )}
          {!selecting && (
            <button className="btn" onClick={p.onTour} disabled={p.busy} title="샘플 악보로 동작 넘기기를 직접 해 봐요">
              <CirclePlay size={18} /> 30초 체험
            </button>
          )}
          {count > 0 && !selecting && (
            <button className="btn" onClick={() => setSelecting(true)}>
              선택
            </button>
          )}
          {p.canClose && !selecting && (
            <button className="btn" onClick={p.onClose}>
              악보로 돌아가기
            </button>
          )}
        </div>
      </header>

      {p.notice}

      {selecting && (
        <div className="lib-selectbar" role="toolbar" aria-label="선택한 악보">
          <strong>{selected.size}개 선택됨</strong>
          <button
            className="btn small"
            onClick={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((e) => e.id)))}
            disabled={shown.length === 0}
          >
            {allShownSelected ? '선택 해제' : '모두 선택'}
          </button>
          <span className="grow" />
          <button className="btn small danger" onClick={deleteSelected} disabled={selected.size === 0}>
            <Trash2 size={15} /> {selected.size > 0 ? `${selected.size}개 ` : ''}삭제
          </button>
          <button className="btn small" onClick={exitSelect}>
            완료
          </button>
        </div>
      )}

      {count > 0 && (
        <div className="lib-tools">
          <input
            type="search"
            className="lib-search"
            placeholder="제목·파일 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="악보 검색"
          />
          <div className="seg small" aria-label="정렬">
            {(
              [
                ['recent', '최근 연 순'],
                ['added', '추가한 순'],
                ['title', '이름 순'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} className={sort === v ? 'on' : ''} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="lib-body">
        {p.entries === null ? (
          <div className="lib-empty">
            <span className="spinner" />
          </div>
        ) : count === 0 ? (
          <div className="lib-empty">
            <div className="empty-icon" aria-hidden>
              <Music size={44} strokeWidth={1.5} />
            </div>
            <h3>{p.available ? '아직 저장된 악보가 없어요' : '악보를 열어 주세요'}</h3>
            <p className="muted">
              {p.available
                ? 'PDF나 악보 사진을 추가하면 여기에 모아 두고, 다음에 열 때 보던 페이지부터 이어서 볼 수 있어요.'
                : '시크릿 모드 등에서는 저장이 안 돼요. 파일을 열면 이번에만 볼 수 있어요.'}
            </p>
            <div className="row gap center">
              <button className="btn primary" onClick={p.onAdd} disabled={p.busy}>
                <Plus size={18} strokeWidth={2.25} /> 악보 추가
              </button>
              <button className="btn" onClick={p.onSample} disabled={p.busy}>
                {p.available ? '샘플 악보 넣기' : '샘플 악보로 해보기'}
              </button>
            </div>
            <p className="muted small">
              PDF · JPG · PNG · WEBP · GIF · BMP · AVIF (HEIC · TIFF는 Safari에서) · 화면에 끌어다 놓아도 돼요
              <br />
              이미지 여러 장을 한꺼번에 고르면 파일 이름 순서대로 한 악보가 돼요.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <div className="lib-empty">
            <p className="muted">「{query}」와 맞는 악보가 없어요.</p>
          </div>
        ) : (
          <ul className={`lib-grid ${selecting ? 'selecting' : ''}`}>
            {shown.map((e) => {
              const isEditing = editing?.id === e.id
              const isSelected = selected.has(e.id)
              return (
                <li key={e.id} className={`lib-card ${p.currentId === e.id ? 'current' : ''} ${isSelected ? 'selected' : ''}`}>
                  <button
                    className="lib-thumb"
                    onClick={() => (selecting ? toggle(e.id) : p.onOpen(e))}
                    disabled={p.busy}
                    aria-label={selecting ? `${e.title} 선택` : `${e.title} 열기`}
                    aria-pressed={selecting ? isSelected : undefined}
                  >
                    {thumbs.get(e.id) ? <img src={thumbs.get(e.id)} alt="" draggable={false} /> : <span aria-hidden>
                        <Music size={34} strokeWidth={1.5} />
                      </span>}
                    {selecting ? (
                      <span className={`lib-check ${isSelected ? 'on' : ''}`} aria-hidden>
                        {isSelected && <Check size={15} strokeWidth={3} />}
                      </span>
                    ) : (
                      p.currentId === e.id && <span className="lib-badge">보는 중</span>
                    )}
                    {e.lastPage > 0 && e.pageCount > 1 && (
                      <span className="lib-progress" aria-hidden>
                        <span style={{ width: `${Math.round(((e.lastPage + 1) / e.pageCount) * 100)}%` }} />
                      </span>
                    )}
                  </button>
                  <div className="lib-info">
                    {isEditing ? (
                      <input
                        className="lib-rename"
                        autoFocus
                        value={editing.title}
                        aria-label="새 이름"
                        onChange={(ev) => setEditing({ id: e.id, title: ev.target.value })}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') commitRename()
                          if (ev.key === 'Escape') setEditing(null)
                        }}
                        onBlur={commitRename}
                      />
                    ) : (
                      <strong className="lib-name" title={e.title}>
                        {e.title}
                      </strong>
                    )}
                    <span className="muted small">
                      {e.pageCount}쪽 · {relativeTime(e.openedAt)}
                      {e.lastPage > 0 && ` · ${e.lastPage + 1}쪽까지 봄`}
                    </span>
                    {!selecting && (
                      <div className="lib-row">
                        <button className="btn small ghost" onClick={() => setEditing({ id: e.id, title: e.title })}>
                          <Pencil size={14} /> 이름 바꾸기
                        </button>
                        <button className="btn small ghost lib-del" onClick={() => p.onDelete([e.id])}>
                          <Trash2 size={14} /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <footer className="lib-foot">
          <a href="/privacy.html" target="_blank" rel="noopener">
            개인정보처리방침
          </a>
          <a href="/terms.html" target="_blank" rel="noopener">
            이용약관
          </a>
          <span>© 투게더온랩</span>
        </footer>
      </div>
    </section>
  )
}
