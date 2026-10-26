import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ApiConfig, ApiUser } from '@server/api-types'
import { api, ApiError, isOffline } from '@/shared/api/voltiApi'

/**
 * 로그인 상태.
 * - unavailable: 서버가 없음 (서버 없이 화면만 올린 경우 등) → 로그인 기능을 숨김
 * - disabled   : 서버는 있지만 Google 로그인이 아직 설정 안 됨
 * - signedOut  : 로그인 안 함 (이 기기에만 저장)
 * - signedIn   : 로그인함. offline = 지금 서버에 닿지 않음 (기억해 둔 계정으로 표시)
 */
export type AccountState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'disabled' }
  | { status: 'signedOut'; config: ApiConfig }
  | { status: 'signedIn'; user: ApiUser; config: ApiConfig | null; offline: boolean }

const USER_KEY = 'volti/account/user'

function readCachedUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as ApiUser) : null
  } catch {
    return null
  }
}
function cacheUser(u: ApiUser | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // 저장이 막힌 환경 — 다음에 열 때 서버에 다시 물어봄
  }
}

type LoginResult = { result: 'ok' | 'cancelled' | 'error'; next: string | null }

/**
 * Google 로그인에서 돌아왔을 때 주소에 붙은 ?login= 결과와 ?next= (로그인 뒤에 하려던 일)를 읽고 주소에서 지움
 */
function takeLoginResult(): LoginResult | null {
  try {
    const url = new URL(window.location.href)
    const r = url.searchParams.get('login')
    if (!r) return null
    const next = url.searchParams.get('next')
    url.searchParams.delete('login')
    url.searchParams.delete('next')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    return { result: r === 'ok' || r === 'cancelled' ? r : 'error', next }
  } catch {
    return null
  }
}

export interface NoticeAction {
  label: string
  run: () => void
}

interface Options {
  notify: (msg: string, tone?: 'ok' | 'warn', action?: NoticeAction) => void
  /**
   * 로그인 전에 하려던 일(next)이 있으면, 돌아왔을 때 알림에 달 버튼 (예: 'add' → 「악보 추가」).
   * 파일 고르기 창은 사용자가 직접 눌러야 열리므로 자동으로 열지 않고 버튼으로 줌
   */
  nextAction?: (next: string) => NoticeAction | null
}

/** 로그인 · 로그아웃 · 계정 삭제. notify 로 결과를 알림 */
export function useAccount({ notify, nextAction }: Options) {
  const [state, setState] = useState<AccountState>({ status: 'loading' })
  // notify 는 바뀌지 않는 함수(useNotice)지만, 혹시 바뀌어도 effect 를 다시 돌리지 않게 ref 로
  const notifyRef = useRef(notify)
  const nextActionRef = useRef(nextAction)
  useLayoutEffect(() => {
    notifyRef.current = notify
    nextActionRef.current = nextAction
  })

  const load = useCallback(async () => {
    const cached = readCachedUser()
    let config: ApiConfig
    try {
      config = await api.config()
    } catch (err) {
      // 인터넷이 끊김: 로그인해 둔 계정이 있으면 그대로 (다시 연결되면 동기화)
      if (isOffline(err) && cached) return setState({ status: 'signedIn', user: cached, config: null, offline: true })
      return setState({ status: 'unavailable' })
    }
    if (!config.google && !config.devLogin) return setState({ status: 'disabled' })
    try {
      const user = await api.me()
      cacheUser(user)
      setState(user ? { status: 'signedIn', user, config, offline: false } : { status: 'signedOut', config })
    } catch (err) {
      if (isOffline(err) && cached) return setState({ status: 'signedIn', user: cached, config, offline: true })
      if (err instanceof ApiError && err.status === 401) cacheUser(null)
      setState({ status: 'signedOut', config })
    }
  }, [])

  useEffect(() => {
    const back = takeLoginResult()
    load().then(() => {
      if (back?.result === 'ok') {
        const action = back.next ? nextActionRef.current?.(back.next) : null
        if (action) notifyRef.current('로그인했어요. 이제 넣는 악보는 계정에 백업돼요.', 'ok', action)
        else notifyRef.current('로그인했어요. 이 기기의 악보와 설정을 계정에 맞추는 중이에요.', 'ok')
      } else if (back?.result === 'error') notifyRef.current('Google 로그인을 마치지 못했어요. 다시 시도해 주세요.', 'warn')
    })
  }, [load])

  // 끊겼다가 다시 연결되면 로그인 상태를 다시 확인
  useEffect(() => {
    if (state.status !== 'signedIn' || !state.offline) return
    const onOnline = () => void load()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [state, load])

  /** Google 로그인 페이지로 이동 (끝나면 지금 화면으로 돌아옴). next = 돌아와서 이어서 할 일 (예: 'add') */
  const signInWithGoogle = useCallback((next?: string) => {
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('next', next)
    window.location.assign(api.googleLoginUrl(url.pathname + url.search + url.hash))
  }, [])

  /** 내 컴퓨터에서 개발할 때만 */
  const signInForDev = useCallback(async (email: string) => {
    try {
      const user = await api.loginForDev(email)
      cacheUser(user)
      setState((s) => ({ status: 'signedIn', user, config: s.status === 'signedOut' ? s.config : null, offline: false }))
    } catch (err) {
      notifyRef.current(err instanceof Error ? err.message : '로그인하지 못했어요.', 'warn')
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // 서버에 닿지 않아도 이 기기에서는 로그아웃
    }
    cacheUser(null)
    await load()
    notifyRef.current('로그아웃했어요. 이 기기의 악보는 그대로 남아 있어요.')
  }, [load])

  const deleteAccount = useCallback(async () => {
    try {
      await api.deleteAccount()
      cacheUser(null)
      await load()
      notifyRef.current('계정과 서버에 저장된 악보 · 설정을 모두 지웠어요. 이 기기의 악보는 그대로예요.', 'ok')
    } catch (err) {
      notifyRef.current(err instanceof Error ? err.message : '계정을 지우지 못했어요.', 'warn')
    }
  }, [load])

  /** 동기화 중 로그인이 풀린 걸 알았을 때 (오래 안 써서 만료 등) */
  const expire = useCallback(() => {
    cacheUser(null)
    setState((s) => (s.status === 'signedIn' && s.config ? { status: 'signedOut', config: s.config } : s))
    void load()
    notifyRef.current('로그인이 풀렸어요. 계속 맞추려면 다시 로그인해 주세요.', 'warn')
  }, [load])

  return { state, signInWithGoogle, signInForDev, signOut, deleteAccount, expire }
}

export type Account = ReturnType<typeof useAccount>
