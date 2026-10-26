import { useCallback, useEffect, useState } from 'react'

export interface NoticeAction {
  label: string
  run: () => void
}
export interface Notice {
  text: string
  tone: 'ok' | 'warn'
  /** 같은 문구가 다시 와도 새로 보이도록 */
  key: number
  action?: NoticeAction
}

/**
 * 화면 아래 짧은 알림(토스트) 상태.
 * notify('저장했어요') 처럼 부르면 몇 초 뒤 저절로 사라짐 (버튼이 있으면 더 오래, 경고는 조금 더 오래).
 */
export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const notify = useCallback(
    (text: string, tone: 'ok' | 'warn' = 'ok', action?: NoticeAction) => setNotice({ text, tone, key: Date.now(), action }),
    [],
  )
  const dismiss = useCallback(() => setNotice(null), [])
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), notice.action ? 7000 : notice.tone === 'warn' ? 5000 : 3200)
    return () => clearTimeout(id)
  }, [notice])
  return { notice, notify, dismiss }
}
