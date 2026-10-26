import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Settings } from '@/features/settings'
import { api, ApiError, isOffline } from '@/shared/api/voltiApi'
import {
  deleteScore,
  forgetDeleted,
  getEntry,
  getScoreFiles,
  listDeleted,
  listScores,
  onLibraryChange,
  rekeyScore,
  saveScore,
  updateScore,
} from '@/features/library'
import { syncLibrary, syncSettings, type SyncLibrary, type SyncProgress, type SyncResult } from '../lib/syncEngine'
import { noteLocalSettings } from '../lib/syncedSettings'

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  /** 파일을 주고받는 중이면 진행 정도 */
  progress: SyncProgress | null
  lastSyncedAt: number | null
  /** 서버에 올린 용량 / 한도 (byte) */
  usage: number | null
  quota: number | null
  /** 서버 공간이 모자라 이 기기에만 있는 악보 수 */
  notUploaded: number
  error: string | null
}

const library: SyncLibrary = { listScores, listDeleted, getEntry, getScoreFiles, saveScore, updateScore, deleteScore, forgetDeleted, rekeyScore }

const LIBRARY_DEBOUNCE_MS = 5_000
const SETTINGS_DEBOUNCE_MS = 3_000
const INTERVAL_MS = 5 * 60_000
/** 화면으로 돌아왔을 때 이만큼 지났으면 다시 맞춤 */
const STALE_MS = 60_000

interface Options {
  /** 로그인했고 이 기기에 보관함이 있으면 true */
  enabled: boolean
  settings: Settings
  settingsRef: RefObject<Settings>
  /** 서버에서 받은 설정 적용 */
  applySettings: (patch: Partial<Settings>) => void
  /** 한 번 맞출 때마다 (목록 새로고침 · 열려 있던 악보 id 바뀜 처리) */
  onSynced: (r: SyncResult, first: boolean) => void
  /** 로그인이 풀림 (401) */
  onUnauthorized: () => void
}

/**
 * 로그인하면 이 기기의 라이브러리 · 설정을 서버와 맞춤.
 * 언제: 로그인 직후 · 악보를 넣거나 고치고 5초 뒤 · 설정을 바꾸고 3초 뒤 · 인터넷이 다시 연결됐을 때 ·
 *       앱으로 돌아왔을 때(1분 넘게 지났으면) · 켜 둔 동안 5분마다
 * 한 번에 하나만 돌고, 도는 중에 또 바뀌면 끝난 뒤 한 번 더.
 */
export function useSync(opts: Options) {
  const { enabled, settings } = opts
  const [state, setState] = useState<SyncState>({ status: 'off', progress: null, lastSyncedAt: null, usage: null, quota: null, notUploaded: 0, error: null })
  const optsRef = useRef(opts)
  useLayoutEffect(() => {
    optsRef.current = opts
  })

  const running = useRef(false)
  const again = useRef(false)
  const first = useRef(true)
  const lastAt = useRef(0)
  const enabledRef = useRef(enabled)
  const abort = useRef<AbortController | null>(null)

  const run = useCallback(async () => {
    if (!enabledRef.current) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    const ctrl = new AbortController()
    abort.current = ctrl
    setState((s) => ({ ...s, status: 'syncing', error: null }))
    try {
      do {
        again.current = false
        const o = optsRef.current
        await syncSettings({ api, getSettings: () => o.settingsRef.current, applyPatch: o.applySettings })
        const r = await syncLibrary({
          api,
          library,
          signal: ctrl.signal,
          onProgress: (p) => setState((s) => ({ ...s, progress: p.done < p.total ? p : null })),
        })
        if (ctrl.signal.aborted) return
        lastAt.current = Date.now()
        optsRef.current.onSynced(r, first.current)
        first.current = false
        setState({
          status: 'synced',
          progress: null,
          lastSyncedAt: lastAt.current,
          usage: r.usage,
          quota: r.quota,
          notUploaded: r.skippedForQuota,
          error: r.failed ? `악보 ${r.failed}개를 맞추지 못했어요. 잠시 뒤 다시 시도해요.` : null,
        })
      } while (again.current && enabledRef.current)
    } catch (err) {
      if (ctrl.signal.aborted) return
      if (err instanceof ApiError && err.status === 401) {
        optsRef.current.onUnauthorized()
        return
      }
      const offline = isOffline(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)
      setState((s) => ({
        ...s,
        status: offline ? 'offline' : 'error',
        progress: null,
        error: offline ? null : err instanceof Error ? err.message : '동기화하지 못했어요.',
      }))
    } finally {
      running.current = false
      if (abort.current === ctrl) abort.current = null
    }
  }, [])

  /* 켜고 끄기 (로그인 · 로그아웃) */
  useEffect(() => {
    enabledRef.current = enabled
    if (enabled) {
      first.current = true
      void run()
    } else {
      abort.current?.abort()
      again.current = false
      setState({ status: 'off', progress: null, lastSyncedAt: null, usage: null, quota: null, notUploaded: 0, error: null })
    }
  }, [enabled, run])

  /* 미뤄서 한 번에 */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedule = useCallback(
    (ms: number) => {
      if (!enabledRef.current) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void run()
      }, ms)
    },
    [run],
  )
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  /* 라이브러리가 바뀌면 */
  useEffect(() => onLibraryChange(() => schedule(LIBRARY_DEBOUNCE_MS)), [schedule])

  /* 같이 쓰는 설정이 바뀌면 (로그인 안 해도 고친 시각은 기록 → 나중에 로그인했을 때 어느 쪽이 새것인지 앎) */
  useEffect(() => {
    if (noteLocalSettings(settings)) schedule(SETTINGS_DEBOUNCE_MS)
  }, [settings, schedule])

  /* 다시 연결 · 앱으로 돌아옴 · 5분마다 */
  useEffect(() => {
    if (!enabled) return
    const onOnline = () => void run()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAt.current > STALE_MS) void run()
    }
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void run()
    }, INTERVAL_MS)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, run])

  return { ...state, syncNow: run }
}

export type Sync = ReturnType<typeof useSync>
