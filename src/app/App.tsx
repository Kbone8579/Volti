import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LibraryBig } from 'lucide-react'
import { CameraPanel, extractSignals, modeValue, useFaceTracker, type CalibStep, type ChartPoint, type FaceSignals, type TrackerFrame } from '@/features/camera'
import { customFeatures, customValue, MIN_NEUTRAL, rebaseCustom, RecordingBanner, trainCustom, withGesture, type RecordingUi } from '@/features/custom-gesture'
import {
  calibrationPoints,
  correctOffset,
  fitGaze,
  GazeCalibrationOverlay,
  GazeDot,
  gazeFeatures,
  GazeSmoother,
  inNextZone,
  predictGaze,
  predictGazeRaw,
  ZONE_FRACTION,
  type GazeCalibUi,
  type GazeSample,
  type Point,
  type Rect,
} from '@/features/gaze'
import { calibrateGesture, GestureDetector, median, MIN_SAMPLES, type DetectorPhase, type DetectorUpdate, type GestureEvent } from '@/features/gestures'
import {
  addScore,
  deleteScore,
  fileSignature,
  findBySignature,
  getScoreFiles,
  LibraryView,
  listScores,
  requestPersistence,
  restoreScore,
  updateScore,
  useLibrary,
  type LibraryEntry,
} from '@/features/library'
import {
  ACCEPT,
  createSampleFiles,
  createSampleScore,
  isSampleFiles,
  loadScoreFiles,
  makeThumbnail,
  maxStart,
  NEXT_TARGET_INSET,
  nextIndex,
  nextStep,
  normalizeIndex,
  pageLabel,
  PendingBadge,
  prevIndex,
  SAMPLE_TITLE,
  ScoreViewer,
  TurnScheduler,
  visibleIndices,
  ZoomControl,
  type FlashKind,
  type LoadedScore,
  type NavState,
  type PendingTurn,
  type TurnKind,
  type ViewerHandle,
  type ViewInfo,
  type Zoom,
} from '@/features/score'
import {
  buildReport,
  DEFAULT_SETTINGS,
  formatValue,
  MODE_META,
  roundToStep,
  SettingsDrawer,
  useSettings,
  type DrawerTab,
  type GestureMode,
  type LogEntry,
} from '@/features/settings'
import { markTourSeen, TOUR_TURNS, TourLayer, tourSeen, type Tour } from '@/features/tour'
import { AccountPanel, BackupWarning, LoginPrompt, loginPromptOff, useAccount } from '@/features/account'
import { BackupNote, SyncIndicator, useSync, type SyncResult } from '@/features/sync'
import { useElementSize } from '@/shared/hooks/useElementSize'
import { useNotice } from '@/shared/hooks/useNotice'
import { Toast } from '@/shared/ui/Toast'
import { useShortcuts } from './hooks/useShortcuts'
import { Toolbar } from './Toolbar'

/**
 * 앱 화면 조립 + 기능들 사이 연결.
 *
 * 카메라 프레임 → 신호 → 제스처 판정 → (대기) → 페이지 넘김 의 흐름이 여기서 이어져요.
 * 각 단계의 계산은 features/ 의 순수 로직이 하고, 이 파일은 상태를 들고 순서대로 부르는 역할.
 * 구역 안내: 설정 · 알림 · 라이브러리 → 악보 · 넘기기 · 확대 → 테스트 기록 · 넘김 예약
 *          → 카메라 · 제스처(캘리브레이션 · 시선 · 내 동작 · 프레임 처리) → 30초 체험 → 키보드 → 화면
 */

interface Live {
  faceVisible: boolean
  sig: FaceSignals | null
  d: number | null
  side: 0 | 1 | -1
  /** 판정 상태 (넘긴 직후 = cooldown·waitNeutral → 정면으로 돌아와야 다시 넘어감) */
  phase: DetectorPhase
  holdProgress: number
  calibProgress: number
  /** 시선 모드: 화면(뷰포트) 좌표 */
  gaze: Point | null
  inZone: boolean
  rect: Rect | null
}
const EMPTY_LIVE: Live = {
  faceVisible: false,
  sig: null,
  d: null,
  side: 0,
  phase: 'armed',
  holdProgress: 0,
  calibProgress: 0,
  gaze: null,
  inZone: false,
  rect: null,
}
const IDLE_UPDATE: DetectorUpdate = { phase: 'armed', side: 0, holdProgress: 0, event: null }

/* 고개·입·윙크 캘리브레이션 */
type Calib =
  | { step: 'idle' }
  | { step: 'neutral' | 'gesture'; startedAt: number; until: number; full: boolean; mode: GestureMode }

const NEUTRAL_MS = 2500
const GESTURE_MS = 3500
const SKIP_MS = 600 // 각 단계 시작 직후는 자세 잡는 시간이라 버림
const LIVE_INTERVAL = 66 // 화면 수치 갱신 주기 (~15Hz)

/* 시선 캘리브레이션 */
type GazeCalib =
  | { step: 'idle' }
  | {
      step: 'points'
      idx: number
      startedAt: number
      points: Point[]
      samples: GazeSample[]
      perPoint: number[]
      view: { w: number; h: number }
    }
  | { step: 'fix'; startedAt: number; until: number; target: Point; preds: Point[] }

type GazeUi = { step: 'idle' } | GazeCalibUi

const GAZE_POINT_MS = 1700
const GAZE_SETTLE_MS = 650 // 점이 옮겨간 뒤 눈이 따라갈 시간
const GAZE_FIX_MS = 2200
const GAZE_FIX_SKIP = 600
const GAZE_ZONE_THRESHOLD = 0.6 // 구역 안 비율(지수평균)이 이 이상이면 "보는 중"

/* 내 동작 녹화 */
type CustomRec =
  | { step: 'idle' }
  | {
      step: 'neutral' | 'next' | 'prev'
      startedAt: number
      until: number
      /** false = 평소 자세만 다시 녹화 */
      full: boolean
      withPrev: boolean
      /** 동작 하나만 (다시) 녹화 — 평소 자세·다른 동작은 그대로 */
      only?: 'next' | 'prev'
      neutral: number[][]
      next: number[][]
      prev: number[][]
    }
type CustomUi = { step: 'idle' } | RecordingUi

const CUSTOM_NEUTRAL_MS = 5000
const CUSTOM_REBASE_MS = 3000
const CUSTOM_GESTURE_MS = 3500

export default function App() {
  /* ───────── 설정 · 알림 ───────── */
  const { settings, settingsRef, update, applyMode } = useSettings()
  const { notice, notify, dismiss: dismissNotice } = useNotice()

  /* ───────── 라이브러리 ───────── */
  const [libraryOpen, setLibraryOpen] = useState(true)
  const libraryOpenRef = useRef(true)
  useLayoutEffect(() => {
    libraryOpenRef.current = libraryOpen
  }, [libraryOpen])
  const { available: libOk, entries, setEntries, usage, refresh: refreshLibrary } = useLibrary()
  const [currentId, setCurrentId] = useState<string | null>(null)
  const currentIdRef = useRef<string | null>(null)
  const setCurrent = (id: string | null) => {
    currentIdRef.current = id
    setCurrentId(id)
  }

  /* ───────── 계정 · 동기화 (로그인하면 라이브러리 · 설정을 서버와 맞춤) ───────── */
  // 로그인 전에 「악보 추가」를 누르고 Google 로그인을 다녀오면 → 알림에 「악보 추가」 버튼
  const account = useAccount({
    notify,
    nextAction: (next) => (next === 'add' ? { label: '악보 추가', run: () => fileInputRef.current?.click() } : null),
  })
  const signedIn = account.state.status === 'signedIn'
  const loginConfig = account.state.status === 'signedOut' ? account.state.config : null
  const onSynced = (r: SyncResult, first: boolean) => {
    // 같은 악보를 합쳐서 id 가 바뀜 → 보던 악보를 따라감. 다른 기기에서 지운 악보는 화면은 그대로 두고 저장만 끊음
    for (const k of r.rekeyed) if (currentIdRef.current === k.from) setCurrent(k.to)
    if (currentIdRef.current && r.removed.includes(currentIdRef.current)) setCurrent(null)
    if (r.localChanges) refreshLibrary()
    if (first) {
      const parts = [r.downloaded && `받은 악보 ${r.downloaded}개`, r.uploaded && `올린 악보 ${r.uploaded}개`].filter(Boolean)
      if (r.skippedForQuota) notify(`악보 ${r.skippedForQuota}개는 서버에 올리지 못해 이 기기에만 있어요. 설정 › 계정에서 확인해 주세요.`, 'warn')
      else if (parts.length) notify(`계정과 맞췄어요 · ${parts.join(' · ')}`)
    } else if (r.downloaded) notify(`다른 기기에서 넣은 악보 ${r.downloaded}개를 받았어요`)
  }
  const sync = useSync({ enabled: signedIn && libOk, settings, settingsRef, applySettings: update, onSynced, onUnauthorized: account.expire })
  const accountReady = account.state.status === 'signedOut' || signedIn

  /* 로그인 권유: 로그인 안 하고 악보를 넣으려 하면 먼저 묻기 (「다시 묻지 않기」 가능) */
  const [loginPrompt, setLoginPrompt] = useState<{ files: File[] | null } | null>(null)
  const askLoginFirst = () => !!loginConfig && libOk && !loginPromptOff()
  /** 로그인 화면으로 (Google 이 켜져 있으면 Google, 아니면 설정 › 계정의 개발용 로그인) */
  const goLogin = (next?: string) => {
    if (loginConfig?.google) account.signInWithGoogle(next)
    else openDrawer('account')
  }
  /** 「악보 추가」 버튼 */
  const requestAdd = () => (askLoginFirst() ? setLoginPrompt({ files: null }) : fileInputRef.current?.click())
  /** 끌어다 놓은 파일 */
  const requestOpenFiles = (files: File[]) => {
    if (!files.length) return
    if (askLoginFirst()) setLoginPrompt({ files })
    else openFiles(files)
  }
  /** 로그인 안 하고 이 브라우저에만 있는 내 악보 수 (샘플 제외) */
  const unbackedCount = loginConfig && entries ? entries.filter((e) => !isSampleFiles(e.fileNames)).length : 0

  /* ───────── 악보 ───────── */
  const [score, setScore] = useState<LoadedScore | null>(null)
  const scoreRef = useRef<LoadedScore | null>(null)
  const [loadingScore, setLoadingScore] = useState(false)
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const setIndexBoth = useCallback((i: number) => {
    indexRef.current = i
    setIndex(i)
  }, [])

  const [mainRef, mainSize] = useElementSize<HTMLDivElement>()
  const readScoreRect = (): Rect | null => {
    const r = mainRef.current?.getBoundingClientRect()
    return r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
  }
  const pageCount = score?.pages.length ?? 0
  const spread =
    settings.viewMode === 'spread' ||
    (settings.viewMode === 'auto' && mainSize.w >= 700 && mainSize.w / Math.max(1, mainSize.h) > 1.15)
  const nav: NavState = useMemo(() => ({ pageCount, spread, spreadStep: settings.spreadStep }), [pageCount, spread, settings.spreadStep])
  const navRef = useRef(nav)
  useLayoutEffect(() => {
    navRef.current = nav
    const fixed = normalizeIndex(indexRef.current, nav)
    if (fixed !== indexRef.current) setIndexBoth(fixed)
  }, [nav, setIndexBoth])

  const [flash, setFlash] = useState<{ kind: FlashKind; key: number } | null>(null)
  const flashSeq = useRef(0)

  /* ───────── 확대 · 축소 ───────── */
  const viewerRef = useRef<ViewerHandle>(null)
  const [zoom, setZoom] = useState<Zoom>(1)
  const [viewInfo, setViewInfo] = useState<ViewInfo>({ z: 1, overflowY: false })
  const [scoreSeq, setScoreSeq] = useState(0)

  /** 모든 넘김(제스처·버튼·키보드·탭·밀기)이 지나는 곳. (설정을 켠 경우만) 확대 중이면 먼저 아래/위로 이동 */
  const turn = useCallback(
    (dir: 'next' | 'prev') => {
      const n = navRef.current
      if (n.pageCount === 0 || libraryOpenRef.current) return
      flashSeq.current += 1
      const scrollFirst = settingsRef.current.zoomScrollFirst
      if (scrollFirst && viewerRef.current?.step(dir)) {
        setFlash({ kind: dir === 'next' ? 'down' : 'up', key: flashSeq.current })
        return
      }
      const cur = indexRef.current
      const to = dir === 'next' ? nextIndex(cur, n) : prevIndex(cur, n)
      if (to === cur) {
        setFlash({ kind: 'edge', key: flashSeq.current })
        return
      }
      setIndexBoth(to)
      // 기본: 확대 배율과 보던 위치(위아래·좌우)를 그대로 두고 넘김.
      // 「아래로 먼저 이동」을 켠 경우만 읽는 흐름대로 다음 = 맨 위, 이전 = 맨 아래
      if (scrollFirst) viewerRef.current?.afterTurn(dir === 'prev' ? 'bottom' : 'top')
      setFlash({ kind: dir, key: flashSeq.current })
    },
    [setIndexBoth],
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  /**
   * 악보를 열어 화면에 표시.
   * save: 새로 고른 파일이면 라이브러리에 저장 (이미 있으면 그 항목으로 이어보기)
   * entry: 라이브러리에서 연 경우 — 마지막으로 보던 쪽부터
   */
  const openScore = useCallback(
    async (loader: () => Promise<LoadedScore>, opts: { save?: boolean; entry?: LibraryEntry; title?: string } = {}) => {
      setLoadingScore(true)
      try {
        const loaded = await loader()
        if (loaded.pages.length === 0) {
          loaded.dispose()
          notify(loaded.warnings[0] ?? '열 수 있는 페이지가 없어요.', 'warn')
          return
        }

        let id = opts.entry?.id ?? null
        let title = opts.entry?.title ?? opts.title ?? loaded.title
        let startPage = opts.entry?.lastPage ?? 0
        let startZoom: Zoom = opts.entry?.zoom ?? 1
        let message: { text: string; tone: 'ok' | 'warn' } | null = null
        if (opts.save && loaded.sources.length && libOk) {
          try {
            const existing = await findBySignature(fileSignature(loaded.sources))
            if (existing) {
              id = existing.id
              title = existing.title
              startPage = existing.lastPage
              startZoom = existing.zoom ?? 1
              message = { text: '이미 라이브러리에 있는 악보예요. 보던 쪽부터 열었어요.', tone: 'ok' }
            } else {
              const thumb = await makeThumbnail(loaded.pages[0])
              id = (await addScore(loaded.sources, { title, pageCount: loaded.pages.length, thumb })).id
              requestPersistence()
              message = { text: `라이브러리에 저장했어요 · ${title}`, tone: 'ok' }
            }
          } catch (err) {
            console.error(err)
            message = { text: '라이브러리에 저장하지 못했어요 (저장 공간 부족 등). 이번에만 볼 수 있어요.', tone: 'warn' }
          }
        }

        scoreRef.current?.dispose()
        scoreRef.current = { ...loaded, title }
        setScore(scoreRef.current)
        setCurrent(id)
        setIndexBoth(normalizeIndex(startPage, { ...navRef.current, pageCount: loaded.pages.length }))
        setZoom(startZoom)
        setScoreSeq((n) => n + 1)
        setLibraryOpen(false)
        if (id) {
          updateScore(id, { openedAt: Date.now(), pageCount: loaded.pages.length })
            .then(refreshLibrary)
            .catch(() => {})
        }
        if (loaded.warnings.length) {
          notify(`${loaded.warnings.length}개 파일을 건너뛰었어요 — ${loaded.warnings[0]}`, 'warn')
        } else if (message) {
          notify(message.text, message.tone)
        }
      } catch (err) {
        console.error(err)
        notify('악보를 여는 중 문제가 생겼어요.', 'warn')
      } finally {
        setLoadingScore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notify, setIndexBoth, libOk, refreshLibrary],
  )
  const openFiles = useCallback((files: File[]) => files.length && openScore(() => loadScoreFiles(files), { save: true }), [openScore])

  const openEntry = async (e: LibraryEntry) => {
    if (e.id === currentIdRef.current && scoreRef.current) return setLibraryOpen(false)
    let files: File[]
    try {
      files = await getScoreFiles(e.id)
    } catch (err) {
      console.error(err)
      return notify('이 악보의 파일을 읽지 못했어요. 삭제 후 다시 추가해 주세요.', 'warn')
    }
    await openScore(() => loadScoreFiles(files), { entry: e })
  }

  const renameEntry = async (id: string, title: string) => {
    await updateScore(id, { title }).catch(() => null)
    if (id === currentIdRef.current && scoreRef.current) {
      scoreRef.current = { ...scoreRef.current, title }
      setScore(scoreRef.current)
    }
    refreshLibrary()
  }

  /** 여러 개 삭제 — 몇 초 동안 「되돌리기」 가능 (지운 파일을 메모리에 잠시 보관) */
  const removeEntries = async (ids: string[]) => {
    const all = (await listScores().catch(() => [])) as LibraryEntry[]
    const removed: { entry: LibraryEntry; files: File[]; wasCurrent: boolean }[] = []
    let failed = 0
    for (const id of ids) {
      const entry = all.find((e) => e.id === id)
      if (!entry) continue
      try {
        const files = await getScoreFiles(id).catch(() => [] as File[])
        await deleteScore(id)
        const wasCurrent = id === currentIdRef.current
        if (wasCurrent) setCurrent(null)
        removed.push({ entry, files, wasCurrent })
      } catch {
        failed += 1
      }
    }
    await refreshLibrary()
    if (removed.length === 0) return notify('삭제하지 못했어요.', 'warn')
    const openScoreObj = scoreRef.current
    const label = removed.length === 1 ? `「${removed[0].entry.title}」` : `${removed.length}개 악보를`
    notify(`${label} 삭제했어요${failed ? ` (${failed}개 실패)` : ''}`, 'ok', {
      label: '되돌리기',
      run: async () => {
        for (const r of removed) {
          if (r.files.length) await restoreScore(r.entry, r.files).catch(() => {})
          // 지우기 전에 보던 악보를 그대로 보고 있으면 다시 연결 (보던 쪽 저장 이어가기)
          if (r.wasCurrent && scoreRef.current === openScoreObj) setCurrent(r.entry.id)
        }
        await refreshLibrary()
        notify('되돌렸어요')
      },
    })
  }

  // 보던 쪽 자동 저장 (넘기고 0.6초 뒤)
  useEffect(() => {
    if (!currentId) return
    const timer = setTimeout(() => {
      updateScore(currentId, { lastPage: index })
        .then((e) => e && setEntries((list) => list?.map((x) => (x.id === e.id ? e : x)) ?? list))
        .catch(() => {})
    }, 600)
    return () => clearTimeout(timer)
  }, [index, currentId])
  // 악보별 배율 자동 저장
  useEffect(() => {
    if (!currentId) return
    const timer = setTimeout(() => {
      updateScore(currentId, { zoom })
        .then((e) => e && setEntries((list) => list?.map((x) => (x.id === e.id ? e : x)) ?? list))
        .catch(() => {})
    }, 600)
    return () => clearTimeout(timer)
  }, [zoom, currentId])
  useEffect(() => () => scoreRef.current?.dispose(), [])

  const [dragging, setDragging] = useState(false)

  /* ───────── 테스트 기록 ───────── */
  const [log, setLog] = useState<LogEntry[]>([])
  const logSeq = useRef(0)
  const accumulatedRef = useRef(0)
  const runningSinceRef = useRef<number | null>(null)
  const sessionMs = useCallback(
    (now = performance.now()) => accumulatedRef.current + (runningSinceRef.current === null ? 0 : now - runningSinceRef.current),
    [],
  )
  const [tester, setTester] = useState('')

  /* ───────── 넘김 예약 (제스처 → 대기 시간 뒤 넘김) ───────── */
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const turnRef = useRef(turn)
  turnRef.current = turn
  const schedulerRef = useRef<TurnScheduler>(null)
  schedulerRef.current ??= new TurnScheduler((k) => turnRef.current(k), setPending)
  const markCancelled = (p: PendingTurn | null) => {
    if (p?.logId != null) setLog((l) => l.map((e) => (e.id === p.logId ? { ...e, cancelled: true } : e)))
  }
  const cancelPending = () => {
    const p = schedulerRef.current!.cancel()
    markCancelled(p)
    return p
  }
  /** 버튼 · 키보드 · 페달 · 화면 탭: 예약을 지우고 바로 넘김 */
  const manualTurn = (dir: TurnKind) => {
    cancelPending()
    turn(dir)
  }
  // 다른 악보를 열거나 라이브러리를 열면 예약 취소
  useEffect(() => {
    cancelPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, libraryOpen])
  useEffect(() => () => void schedulerRef.current?.cancel(), [])

  /* ───────── 카메라 · 제스처 ───────── */
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const detectorRef = useRef<GestureDetector>(null)
  detectorRef.current ??= new GestureDetector()
  const smootherRef = useRef<GazeSmoother>(null)
  smootherRef.current ??= new GazeSmoother()
  const zoneEmaRef = useRef(0)
  const chartRef = useRef<ChartPoint[]>([])
  const [live, setLive] = useState<Live>(EMPTY_LIVE)
  const lastLiveRef = useRef({ t: 0, side: 0 as 0 | 1 | -1 })

  const calibRef = useRef<Calib>({ step: 'idle' })
  const [calibStep, setCalibStep] = useState<CalibStep>('idle')
  const neutralSamples = useRef<number[]>([])
  const gestureSamples = useRef<number[]>([])
  const pendingBaseline = useRef(0)
  const setCalib = (c: Calib) => {
    calibRef.current = c
    setCalibStep(c.step)
  }

  const gazeCalibRef = useRef<GazeCalib>({ step: 'idle' })
  const [gazeUi, setGazeUi] = useState<GazeUi>({ step: 'idle' })
  const setGazeCalib = (c: GazeCalib, ui: GazeUi) => {
    gazeCalibRef.current = c
    setGazeUi(ui)
  }

  const customRecRef = useRef<CustomRec>({ step: 'idle' })
  const [customUi, setCustomUi] = useState<CustomUi>({ step: 'idle' })
  const setCustomRec = (c: CustomRec) => {
    customRecRef.current = c
    setCustomUi(c.step === 'idle' ? { step: 'idle' } : { step: c.step, full: c.full, withPrev: c.withPrev, only: c.only })
  }

  const resetGazeTracking = () => {
    smootherRef.current?.reset()
    zoneEmaRef.current = 0
  }

  /** 제스처 → 넘김 예약. 새로 예약했으면 true */
  const handleGesture = (ev: GestureEvent, mode: GestureMode): boolean => {
    const sched = schedulerRef.current!
    const waiting = sched.pending
    if (waiting && waiting.kind === ev.kind) return false // 이미 예약됨
    if (waiting) {
      // 기다리는 중 반대 방향 동작 → 예약 취소
      cancelPending()
      notify('넘김을 취소했어요')
      return false
    }
    logSeq.current += 1
    const entry: LogEntry = { id: logSeq.current, at: sessionMs(ev.at), kind: ev.kind, peak: ev.peak, mode, falsePositive: false }
    setLog((l) => [entry, ...l].slice(0, 300))
    sched.request(ev.kind, settingsRef.current.turnDelayMs, entry.id)
    return true
  }

  /* ───────── 30초 체험 (처음 쓰는 사람용) ───────── */
  const [tour, setTourState] = useState<Tour>(() => (tourSeen() ? { step: 'off' } : { step: 'welcome' }))
  const tourRef = useRef<Tour>(tour)
  const setTour = (t: Tour) => {
    tourRef.current = t
    setTourState(t)
  }
  /** 체험은 고개 모드로 — 원래 쓰던 모드는 끝나면 되돌림 */
  const tourPrevMode = useRef<GestureMode | null>(null)

  /** 「넘겨 보기」 단계에서 동작으로 넘겼을 때 */
  const onTourTurn = (flipped: boolean) => {
    const tr = tourRef.current
    if (tr.step !== 'try') return
    const turns = tr.turns + 1
    if (turns >= TOUR_TURNS) return setTour({ step: 'done', viaCamera: true })
    setTour({ step: 'try', turns, flipped: tr.flipped || flipped })
  }

  const finishCalibStep = (t: number) => {
    const c = calibRef.current
    if (c.step === 'idle') return
    const meta = MODE_META[c.mode]
    if (c.step === 'neutral') {
      if (neutralSamples.current.length < MIN_SAMPLES) {
        setCalib({ step: 'idle' })
        if (tourRef.current.step === 'neutral') return setTour({ step: 'neutral', failed: true })
        notify('얼굴이 충분히 보이지 않았어요. 카메라 정면에서 다시 해 주세요.', 'warn')
        return
      }
      const baseline = roundToStep(c.mode, median(neutralSamples.current))
      if (!c.full) {
        applyMode(c.mode, { baseline })
        setCalib({ step: 'idle' })
        detectorRef.current?.reset()
        if (tourRef.current.step === 'neutral') return setTour({ step: 'try', turns: 0, flipped: false })
        notify(`지금 자세를 기준으로 저장했어요 (${formatValue(c.mode, baseline)})`)
        return
      }
      pendingBaseline.current = baseline
      gestureSamples.current = []
      setCalib({ step: 'gesture', startedAt: t, until: t + GESTURE_MS, full: true, mode: c.mode })
      return
    }
    const res = calibrateGesture(gestureSamples.current, pendingBaseline.current, meta.minThreshold, meta.maxThreshold)
    applyMode(c.mode, { baseline: pendingBaseline.current })
    setCalib({ step: 'idle' })
    if (!res) {
      notify('동작이 작게 측정됐어요. 조금 더 크게, 끝까지 유지해 주세요. (기준 자세만 저장됨)', 'warn')
      return
    }
    const threshold = roundToStep(c.mode, res.threshold)
    applyMode(c.mode, { threshold, direction: res.direction })
    notify(`설정 완료 · 임계값 ${formatValue(c.mode, threshold)} (측정된 동작 ${formatValue(c.mode, res.strength)})`)
  }

  /* 시선 캘리브레이션 진행 */
  const advanceGazePoint = (t: number) => {
    const gc = gazeCalibRef.current
    if (gc.step !== 'points') return
    if (gc.idx + 1 < gc.points.length) {
      gc.idx += 1
      gc.startedAt = t
      setGazeUi({ step: 'points', idx: gc.idx, total: gc.points.length, point: gc.points[gc.idx] })
      return
    }
    const weak = gc.perPoint.filter((n) => n < 5).length
    const model = weak <= 1 ? fitGaze(gc.samples, gc.view) : null
    setGazeCalib({ step: 'idle' }, { step: 'idle' })
    resetGazeTracking()
    detectorRef.current?.reset()
    if (!model) {
      notify('눈이 충분히 보이지 않았어요. 카메라 정면에서, 밝은 곳에서 다시 해 주세요.', 'warn')
      return
    }
    update({ gazeModel: model })
    notify(`시선 캘리브레이션 완료 · 평균 오차 약 ${Math.round(model.errorPx)}px`)
  }

  const finishGazeFix = () => {
    const gc = gazeCalibRef.current
    if (gc.step !== 'fix') return
    const model = settingsRef.current.gazeModel
    setGazeCalib({ step: 'idle' }, { step: 'idle' })
    resetGazeTracking()
    detectorRef.current?.reset()
    const fixed =
      model && correctOffset(model, gc.preds, { x: gc.target.x / window.innerWidth, y: gc.target.y / window.innerHeight })
    if (!fixed) {
      notify('눈이 충분히 보이지 않아 보정하지 못했어요.', 'warn')
      return
    }
    update({ gazeModel: fixed })
    notify('▶ 위치에 맞춰 다시 보정했어요')
  }

  /* 내 동작 녹화 진행 */
  const finishCustomRec = (rec: Exclude<CustomRec, { step: 'idle' }>) => {
    setCustomRec({ step: 'idle' })
    detectorRef.current?.reset()
    const model = trainCustom(rec.neutral, rec.next, rec.withPrev ? rec.prev : null)
    if (!model) {
      notify('녹화한 동작이 평소 자세와 거의 같아요. 더 크게 하고 끝까지 유지해 주세요.', 'warn')
      return
    }
    update({ customModel: model })
    applyMode('custom', { threshold: roundToStep('custom', model.next.quality.suggested) })
    const desc = model.next.summary.join(', ') || '여러 부위의 작은 변화'
    if (!model.next.quality.ok) {
      notify(`저장했지만 평소 움직임과 비슷해서 오작동이 날 수 있어요 (${desc}). 더 크게 하거나 다른 동작으로 다시 녹화해 보세요.`, 'warn')
    } else if (model.confusable) {
      notify('다음·이전 동작이 서로 비슷해요. 서로 다른 부위를 쓰는 동작이 좋아요.', 'warn')
    } else if (rec.withPrev && !model.prev) {
      notify('이전 동작은 평소 자세와 구분되지 않아 저장하지 않았어요. 다음 동작만 쓸게요.', 'warn')
    } else {
      notify(`내 동작 저장 · 다음: ${desc}${model.prev ? ` / 이전: ${model.prev.summary.join(', ')}` : ''}`)
    }
  }

  /** 동작 하나만 녹화한 경우: 저장해 둔 평소 자세로 그 동작만 학습해서 끼워 넣음 */
  const finishCustomOnly = (rec: Exclude<CustomRec, { step: 'idle' }>, kind: 'next' | 'prev') => {
    setCustomRec({ step: 'idle' })
    detectorRef.current?.reset()
    const m = settingsRef.current.customModel
    const updated = m && withGesture(m, kind, rec[kind])
    if (!updated) {
      notify('녹화한 동작이 평소 자세와 거의 같아요. 더 크게 하고 끝까지 유지해 주세요.', 'warn')
      return
    }
    const turnedOn = kind === 'prev' && settingsRef.current.forwardOnly
    update({ customModel: updated, ...(kind === 'prev' ? { forwardOnly: false } : {}) })
    if (kind === 'next') applyMode('custom', { threshold: roundToStep('custom', updated.next.quality.suggested) })
    const g = updated[kind]!
    const desc = g.summary.join(', ') || '여러 부위의 작은 변화'
    if (!g.quality.ok) {
      notify(`저장했지만 평소 움직임과 비슷해서 오작동이 날 수 있어요 (${desc}). 더 크게 하거나 다른 동작으로 다시 녹화해 보세요.`, 'warn')
    } else if (updated.confusable) {
      notify('다음·이전 동작이 서로 비슷해요. 서로 다른 부위를 쓰는 동작이 좋아요.', 'warn')
    } else {
      notify(`${kind === 'prev' ? '이전' : '다음'} 동작 저장 · ${desc}${turnedOn ? ' — 이전 페이지 제스처를 켰어요' : ''}`)
    }
  }

  const advanceCustomRec = (t: number) => {
    const rec = customRecRef.current
    if (rec.step === 'idle') return
    if (rec.only) return finishCustomOnly(rec, rec.only)
    if (rec.step === 'neutral') {
      if (rec.neutral.length < MIN_NEUTRAL) {
        setCustomRec({ step: 'idle' })
        notify('얼굴이 충분히 보이지 않았어요. 카메라 정면에서 다시 해 주세요.', 'warn')
        return
      }
      if (!rec.full) {
        setCustomRec({ step: 'idle' })
        detectorRef.current?.reset()
        const m = settingsRef.current.customModel
        const re = m && rebaseCustom(m, rec.neutral)
        if (!re) return notify('평소 자세를 다시 맞추지 못했어요. 동작을 새로 녹화해 주세요.', 'warn')
        update({ customModel: re })
        applyMode('custom', { threshold: roundToStep('custom', re.next.quality.suggested) })
        return notify('평소 자세를 다시 맞췄어요')
      }
      return setCustomRec({ ...rec, step: 'next', startedAt: t, until: t + CUSTOM_GESTURE_MS })
    }
    if (rec.step === 'next' && rec.withPrev) {
      return setCustomRec({ ...rec, step: 'prev', startedAt: t, until: t + CUSTOM_GESTURE_MS })
    }
    finishCustomRec(rec)
  }

  const onFrame = ({ t, result, aspect }: TrackerFrame) => {
    const s = settingsRef.current
    const detector = detectorRef.current!
    const sig = extractSignals(result, aspect)
    const calib = calibRef.current
    const mode = calib.step === 'idle' ? s.mode : calib.mode

    let upd = IDLE_UPDATE
    let calibProgress = 0
    let d: number | null = null
    let gaze: Point | null = null
    let inZone = false
    let tourAnySide = false
    const rect = readScoreRect()

    if (mode === 'gaze') {
      const f = sig ? gazeFeatures(sig) : null
      const gc = gazeCalibRef.current
      if (gc.step === 'points') {
        detector.reset()
        const elapsed = t - gc.startedAt
        const pt = gc.points[gc.idx]
        if (f && elapsed > GAZE_SETTLE_MS) {
          gc.samples.push({ f, x: pt.x / gc.view.w, y: pt.y / gc.view.h })
          gc.perPoint[gc.idx] += 1
        }
        calibProgress = (gc.idx + Math.min(1, elapsed / GAZE_POINT_MS)) / gc.points.length
        if (elapsed >= GAZE_POINT_MS) advanceGazePoint(t)
      } else if (gc.step === 'fix') {
        detector.reset()
        const elapsed = t - gc.startedAt
        if (f && s.gazeModel && elapsed > GAZE_FIX_SKIP) gc.preds.push(predictGazeRaw(s.gazeModel, f))
        calibProgress = Math.min(1, elapsed / GAZE_FIX_MS)
        if (t >= gc.until) finishGazeFix()
      } else if (f && s.gazeModel) {
        const g = predictGaze(s.gazeModel, f)
        gaze = smootherRef.current!.update({ x: g.x * window.innerWidth, y: g.y * window.innerHeight }, t)
        inZone = rect ? inNextZone(gaze, rect, s.gazeZone) : false
        // 한두 프레임 튀어도 끊기지 않게 구역 판정을 지수평균
        zoneEmaRef.current = zoneEmaRef.current * 0.6 + (inZone ? 0.4 : 0)
        d = zoneEmaRef.current
        upd = detector.update(d, t, {
          threshold: GAZE_ZONE_THRESHOLD,
          holdMs: s.gazeDwellMs,
          cooldownMs: s.cooldownMs,
          forwardOnly: true,
        })
      } else {
        resetGazeTracking()
        upd = detector.update(null, t, { threshold: GAZE_ZONE_THRESHOLD, holdMs: s.gazeDwellMs, cooldownMs: s.cooldownMs, forwardOnly: true })
      }
    } else if (mode === 'custom' && customRecRef.current.step !== 'idle') {
      detector.reset()
      const rec = customRecRef.current
      const elapsed = t - rec.startedAt
      if (sig && elapsed > (rec.step === 'neutral' ? 500 : 800)) rec[rec.step].push(customFeatures(sig))
      calibProgress = Math.min(1, elapsed / (rec.until - rec.startedAt))
      if (t >= rec.until) advanceCustomRec(t)
    } else {
      const cfg = s.modes[mode]
      const raw = !sig
        ? null
        : mode === 'custom'
          ? s.customModel
            ? customValue(s.customModel, customFeatures(sig)).d
            : null
          : modeValue(sig, mode)
      d = raw === null ? null : (raw - cfg.baseline) * cfg.direction
      if (calib.step !== 'idle') {
        detector.reset()
        const elapsed = t - calib.startedAt
        if (raw !== null && elapsed > SKIP_MS) (calib.step === 'neutral' ? neutralSamples : gestureSamples).current.push(raw)
        calibProgress = Math.min(1, elapsed / (calib.until - calib.startedAt))
        if (t >= calib.until) finishCalibStep(t)
      } else {
        // 체험의 첫 「넘겨 보기」: 어느 쪽으로 돌려도 받아 주고, 처음 돌린 쪽을 「다음」으로 정함
        const tr = tourRef.current
        tourAnySide = tr.step === 'try' && tr.turns === 0 && s.forwardOnly && mode !== 'custom'
        upd = detector.update(d, t, {
          threshold: cfg.threshold,
          holdMs: s.holdMs,
          cooldownMs: s.cooldownMs,
          forwardOnly: tourAnySide ? false : s.forwardOnly,
        })
      }
    }

    let ev = upd.event
    let flipped = false
    if (ev && tourAnySide && ev.kind === 'prev' && mode !== 'gaze' && mode !== 'custom') {
      applyMode(mode, { direction: s.modes[mode].direction === 1 ? -1 : 1 })
      ev = { ...ev, kind: 'next' }
      flipped = true
    }

    const buf = chartRef.current
    buf.push({ t, d: flipped && d !== null ? -d : d, ev: ev?.kind })
    while (buf.length && t - buf[0].t > 10000) buf.shift()

    if (ev && handleGesture(ev, mode) && ev.kind === 'next') onTourTurn(flipped)

    const last = lastLiveRef.current
    if (t - last.t >= LIVE_INTERVAL || upd.event || upd.side !== last.side) {
      lastLiveRef.current = { t, side: upd.side }
      setLive({ faceVisible: !!sig, sig, d, side: upd.side, phase: upd.phase, holdProgress: upd.holdProgress, calibProgress, gaze, inZone, rect })
    }
  }

  const tracker = useFaceTracker({
    videoRef,
    canvasRef,
    getConfig: () => ({ maxFps: settingsRef.current.maxFps, showMesh: settingsRef.current.showMesh }),
    onFrame,
  })
  const running = tracker.status === 'running'

  useEffect(() => {
    const now = performance.now()
    if (running && runningSinceRef.current === null) runningSinceRef.current = now
    if (!running && runningSinceRef.current !== null) {
      accumulatedRef.current += now - runningSinceRef.current
      runningSinceRef.current = null
      setLive(EMPTY_LIVE)
      detectorRef.current?.reset()
      resetGazeTracking()
      if (calibRef.current.step !== 'idle') setCalib({ step: 'idle' })
      if (gazeCalibRef.current.step !== 'idle') setGazeCalib({ step: 'idle' }, { step: 'idle' })
      if (customRecRef.current.step !== 'idle') setCustomRec({ step: 'idle' })
      // 체험 중 카메라가 꺼지면 카메라 단계로
      const ts = tourRef.current.step
      if (ts === 'neutral' || ts === 'try') setTour({ step: 'camera' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const startCamera = () => tracker.start({ resolution: settings.resolution, delegate: settings.delegate })

  const startGazeCalibration = () => {
    const rect = readScoreRect()
    if (!running || !rect) return
    const points = calibrationPoints(rect)
    const now = performance.now()
    setGazeCalib(
      {
        step: 'points',
        idx: 0,
        startedAt: now,
        points,
        samples: [],
        perPoint: points.map(() => 0),
        view: { w: window.innerWidth, h: window.innerHeight },
      },
      { step: 'points', idx: 0, total: points.length, point: points[0] },
    )
  }

  const startGazeFix = () => {
    const rect = readScoreRect()
    if (!running || !rect || !settings.gazeModel) return
    const target = { x: rect.left + rect.width - NEXT_TARGET_INSET, y: rect.top + rect.height - NEXT_TARGET_INSET }
    const now = performance.now()
    setGazeCalib({ step: 'fix', startedAt: now, until: now + GAZE_FIX_MS, target, preds: [] }, { step: 'fix', point: target })
  }

  const cancelGazeCalibration = () => {
    if (gazeCalibRef.current.step === 'idle') return
    setGazeCalib({ step: 'idle' }, { step: 'idle' })
    notify('시선 보정을 취소했어요', 'warn')
  }

  const startCustomRec = (full: boolean) => {
    if (!running || (!full && !settings.customModel)) return
    const now = performance.now()
    setCustomRec({
      step: 'neutral',
      startedAt: now,
      until: now + (full ? CUSTOM_NEUTRAL_MS : CUSTOM_REBASE_MS),
      full,
      withPrev: !settings.forwardOnly,
      neutral: [],
      next: [],
      prev: [],
    })
  }

  /** 다음 또는 이전 동작 하나만 녹화 (예: 다음만 녹화해 뒀다가 이전 동작 추가) */
  const startCustomOnly = (kind: 'next' | 'prev') => {
    if (!running || !settingsRef.current.customModel || customRecRef.current.step !== 'idle') return
    if (settingsRef.current.mode !== 'custom') changeMode('custom')
    const now = performance.now()
    setCustomRec({ step: kind, startedAt: now, until: now + CUSTOM_GESTURE_MS, full: false, withPrev: false, only: kind, neutral: [], next: [], prev: [] })
  }

  const cancelCustomRec = () => {
    if (customRecRef.current.step === 'idle') return
    setCustomRec({ step: 'idle' })
    notify('녹화를 취소했어요', 'warn')
  }

  const startCalibration = (full: boolean) => {
    if (!running) return
    if (settings.mode === 'gaze') return full ? startGazeCalibration() : startGazeFix()
    if (settings.mode === 'custom') return startCustomRec(full)
    neutralSamples.current = []
    gestureSamples.current = []
    const now = performance.now()
    setCalib({ step: 'neutral', startedAt: now, until: now + NEUTRAL_MS, full, mode: settings.mode })
  }

  const changeMode = (m: GestureMode) => {
    if (calibRef.current.step !== 'idle' || gazeCalibRef.current.step !== 'idle' || customRecRef.current.step !== 'idle') return
    detectorRef.current?.reset()
    resetGazeTracking()
    chartRef.current = []
    update({ mode: m })
  }

  /* ───────── 30초 체험 진행 ───────── */
  const beginTourNeutral = () => {
    if (!running) return
    neutralSamples.current = []
    gestureSamples.current = []
    detectorRef.current?.reset()
    const now = performance.now()
    setCalib({ step: 'neutral', startedAt: now, until: now + NEUTRAL_MS, full: false, mode: 'head' })
    setTour({ step: 'neutral', failed: false })
  }

  const startTour = async () => {
    markTourSeen()
    setDrawerOpen(false)
    cancelPending()
    if (calibRef.current.step !== 'idle' || gazeCalibRef.current.step !== 'idle' || customRecRef.current.step !== 'idle') return
    if (settingsRef.current.mode !== 'head') {
      tourPrevMode.current ??= settingsRef.current.mode
      changeMode('head')
    }
    update({ panelVisible: true })
    setTour({ step: 'camera' })
    if (scoreRef.current) {
      setLibraryOpen(false)
      return
    }
    // 연습용 샘플 악보 열기 (라이브러리에 있으면 그걸, 지웠으면 이번에만 보는 샘플)
    const sample = libOk ? (await listScores().catch(() => [] as LibraryEntry[])).find((e) => e.title === SAMPLE_TITLE) : undefined
    if (sample) await openEntry(sample)
    else await openScore(() => createSampleScore())
    setIndexBoth(0)
  }

  const endTour = (then?: 'library') => {
    markTourSeen()
    if (tourRef.current.step === 'neutral' && calibRef.current.step !== 'idle') setCalib({ step: 'idle' })
    setTour({ step: 'off' })
    if (tourPrevMode.current) {
      changeMode(tourPrevMode.current)
      tourPrevMode.current = null
    }
    if (then === 'library') {
      refreshLibrary()
      setLibraryOpen(true)
    }
  }

  // ① 카메라가 켜지고 얼굴이 보이면 → ② 기준 잡기
  useEffect(() => {
    if (tour.step === 'camera' && running && live.faceVisible && calibRef.current.step === 'idle') beginTourNeutral()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.step, running, live.faceVisible])

  // 카메라 없이 둘러보기: 손으로 한 번 넘기면 끝
  useEffect(() => {
    if (tour.step === 'nocam' && index !== tour.from) setTour({ step: 'done', viaCamera: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, tour])

  /* ───────── 설정 서랍 ───────── */
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('gesture')
  const openDrawer = (tab: DrawerTab) => {
    setDrawerTab(tab)
    setDrawerOpen(true)
  }
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!(drawerOpen && drawerTab === 'log' && running)) return
    const id = setInterval(() => forceTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [drawerOpen, drawerTab, running])

  const copyReport = async () => {
    const text = buildReport({ log, sessionMs: sessionMs(), settings, tester, scoreTitle: score?.title ?? '' })
    try {
      await navigator.clipboard.writeText(text)
      notify('테스트 결과를 복사했어요. 메신저에 붙여 넣어 보내 주세요.')
    } catch {
      notify('복사가 막혀 있어요. 브라우저 권한을 확인해 주세요.', 'warn')
    }
  }

  const clearLog = () => {
    setLog([])
    accumulatedRef.current = 0
    runningSinceRef.current = running ? performance.now() : null
  }

  /* ───────── 키보드 · 블루투스 페달 ───────── */
  const zoomStep = (dir: 1 | -1) => {
    if (!scoreRef.current) return
    setZoom(nextStep(viewInfo.z, dir))
  }
  useShortcuts({
    onEscape: () => {
      if (schedulerRef.current?.pending) return void cancelPending()
      if (tourRef.current.step !== 'off') return endTour()
      if (libraryOpenRef.current && scoreRef.current) return setLibraryOpen(false)
      if (gazeCalibRef.current.step !== 'idle') return setGazeCalib({ step: 'idle' }, { step: 'idle' })
      if (customRecRef.current.step !== 'idle') return setCustomRec({ step: 'idle' })
      setDrawerOpen(false)
    },
    onZoomStep: zoomStep,
    onZoomReset: () => setZoom(1),
    onTurn: manualTurn,
  })

  /* ───────── 화면 ───────── */
  const mode = settings.mode
  const isGaze = mode === 'gaze'
  const cfg = settings.modes[mode]
  const visible = visibleIndices(index, nav)
  const prefetch = useMemo(() => {
    const step = nav.spread ? nav.spreadStep : 1
    const out: number[] = []
    for (let k = 1; k <= 2; k++) {
      const start = Math.min(index + step * k, maxStart(nav))
      out.push(...visibleIndices(start, nav))
    }
    if (index > 0) out.push(...visibleIndices(prevIndex(index, nav), nav))
    return [...new Set(out)].filter((i) => !visible.includes(i))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, nav])

  const panelCalibStep: CalibStep =
    gazeUi.step !== 'idle'
      ? 'gaze'
      : customUi.step === 'neutral'
        ? 'cNeutral'
        : customUi.step === 'next'
          ? 'cNext'
          : customUi.step === 'prev'
            ? 'cPrev'
            : calibStep
  const customModel = settings.customModel

  const emptyState = (
    <div className="empty">
      <p className="muted icon-text">
        <LibraryBig size={17} /> 라이브러리에서 악보를 골라 주세요
      </p>
    </div>
  )

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        requestOpenFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <Toolbar
        libraryOpen={libraryOpen}
        onLibrary={() => {
          if (libraryOpen) {
            if (scoreRef.current) setLibraryOpen(false)
          } else {
            refreshLibrary()
            setLibraryOpen(true)
          }
        }}
        title={libraryOpen ? '' : (score?.title ?? '')}
        pager={pageLabel(index, nav)}
        canTurn={pageCount > 0 && !libraryOpen}
        onPrev={() => manualTurn('prev')}
        onNext={() => manualTurn('next')}
        viewMode={settings.viewMode}
        onViewMode={(v) => update({ viewMode: v })}
        zoom={
          <ZoomControl
            zoom={zoom}
            resolved={viewInfo.z}
            disabled={!score || libraryOpen}
            locked={settings.zoomLocked}
            onZoom={setZoom}
            onStep={zoomStep}
            onLock={(v) => update({ zoomLocked: v })}
          />
        }
        sync={signedIn ? <SyncIndicator sync={sync} onClick={() => openDrawer('account')} /> : undefined}
        onSettings={() => setDrawerOpen(true)}
      />

      <main className={`main ${settings.panelVisible ? '' : 'panel-closed'}`}>
        <div className="score-wrap" ref={mainRef}>
          {customUi.step !== 'idle' && <RecordingBanner ui={customUi} progress={live.calibProgress} onCancel={cancelCustomRec} />}
          <ScoreViewer
            pages={score?.pages ?? []}
            visible={visible}
            prefetch={prefetch}
            holdSide={isGaze ? 0 : live.side}
            holdProgress={live.holdProgress}
            flash={flash}
            onTapPrev={() => manualTurn('prev')}
            onTapNext={() => manualTurn('next')}
            empty={emptyState}
            onSwipe={(dir) => manualTurn(dir)}
            zoom={zoom}
            onZoomChange={setZoom}
            onViewInfo={setViewInfo}
            locked={settings.zoomLocked}
            wheelMode={settings.wheelMode}
            resetKey={String(scoreSeq)}
            ref={viewerRef}
            nextTarget={
              isGaze
                ? {
                    progress: live.side === 1 ? live.holdProgress : 0,
                    inZone: live.inZone,
                    zone: ZONE_FRACTION[settings.gazeZone],
                    showZone: settings.showGazeDot && running && !!settings.gazeModel,
                  }
                : null
            }
          />
          {pending && <PendingBadge pending={pending} onCancel={cancelPending} />}
          <TourLayer
            tour={tour}
            covered={libraryOpen || drawerOpen || gazeUi.step !== 'idle' || customUi.step !== 'idle'}
            status={tracker.status}
            error={tracker.error}
            faceVisible={live.faceVisible}
            calibProgress={live.calibProgress}
            d={live.d}
            threshold={cfg.threshold}
            holdProgress={live.holdProgress}
            side={live.side}
            phase={live.phase}
            holdMs={settings.holdMs}
            turnSide={settings.modes.head.direction === 1 ? '오른쪽' : '왼쪽'}
            onStart={startTour}
            onClose={() => endTour()}
            onCamera={startCamera}
            onNoCam={() => setTour({ step: 'nocam', from: indexRef.current })}
            onBackToCamera={() => setTour({ step: 'camera' })}
            onRetry={beginTourNeutral}
            onSkipTry={() => setTour({ step: 'done', viaCamera: true })}
            onLibrary={() => endTour('library')}
            onCustom={() => {
              tourPrevMode.current = null // 체험 전 모드로 돌리지 않고 「내 동작」으로
              endTour()
              changeMode('custom')
              notify(running ? '「동작 녹화」를 눌러 나만의 동작을 녹화해 보세요' : '카메라를 켜고 「동작 녹화」를 눌러 나만의 동작을 녹화해 보세요')
            }}
          />
        </div>

        <div className="panel-wrap">
          {/* 사이드 탭: 눌러서 카메라 패널 펼치기·접기 (접어도 인식은 계속) */}
          <button
            className="panel-tab"
            onClick={() => update({ panelVisible: !settings.panelVisible })}
            aria-expanded={settings.panelVisible}
            aria-controls="camera-panel"
            title={settings.panelVisible ? '내 화면 접기 (인식은 계속돼요)' : '내 화면 펼치기'}
          >
            <span className="panel-tab-arrow" aria-hidden>
              {settings.panelVisible ? <ChevronRight size={18} strokeWidth={2.5} /> : <ChevronLeft size={18} strokeWidth={2.5} />}
            </span>
            <span className="panel-tab-label">내 화면</span>
            {running && <span className={`dot ${live.faceVisible ? 'ok' : 'warn'}`} aria-label={live.faceVisible ? '얼굴 인식 중' : '얼굴이 안 보임'} />}
          </button>
          <div className="panel-scroll" id="camera-panel" inert={!settings.panelVisible} aria-hidden={!settings.panelVisible}>
          <CameraPanel
            videoRef={videoRef}
            canvasRef={canvasRef}
            status={tracker.status}
            error={tracker.error}
            perf={tracker.perf}
            mirror={settings.mirror}
            faceVisible={live.faceVisible}
            mode={mode}
            onModeChange={changeMode}
            d={live.d}
            threshold={cfg.threshold}
            holdProgress={live.holdProgress}
            side={live.side}
            turnDelayMs={settings.turnDelayMs}
            onTurnDelay={(ms) => update({ turnDelayMs: ms })}
            forwardOnly={settings.forwardOnly}
            onForwardOnly={(v) => {
              detectorRef.current?.reset()
              update({ forwardOnly: v })
              // 내 동작: 이전 동작이 아직 없으면 바로 녹화할 수 있게 안내 (처음부터 다시 녹화할 필요 없음)
              const cm = settingsRef.current.customModel
              if (!v && mode === 'custom' && cm && !cm.prev) {
                notify('이전 페이지로 넘길 동작을 녹화해 주세요', 'ok', running ? { label: '이전 동작 녹화', run: () => startCustomOnly('prev') } : undefined)
              }
            }}
            onRecordOnly={startCustomOnly}
            chartRef={chartRef}
            gaze={{
              point: live.gaze,
              rect: live.rect ?? readScoreRect(),
              zone: ZONE_FRACTION[settings.gazeZone],
              inZone: live.inZone,
              hasModel: !!settings.gazeModel,
              errorPx: settings.gazeModel?.errorPx ?? null,
              dwellMs: settings.gazeDwellMs,
            }}
            custom={{
              next: customModel ? { summary: customModel.next.summary, ok: customModel.next.quality.ok } : null,
              prev: customModel?.prev ? { summary: customModel.prev.summary, ok: customModel.prev.quality.ok } : null,
              hasModel: !!customModel,
            }}
            calibStep={panelCalibStep}
            calibProgress={live.calibProgress}
            onStart={startCamera}
            onStop={tracker.stop}
            onCalibrate={() => startCalibration(true)}
            onRebaseline={() => startCalibration(false)}
            onFlip={() => applyMode(mode, { direction: cfg.direction === 1 ? -1 : 1 })}
          />
          </div>
        </div>

        {libraryOpen && (
          <LibraryView
            entries={entries}
            available={libOk}
            canClose={!!score}
            currentId={currentId}
            usage={usage}
            busy={loadingScore}
            onClose={() => setLibraryOpen(false)}
            onAdd={requestAdd}
            onSample={async () => {
              // 보관함을 쓸 수 있으면 라이브러리에 넣고 열기, 아니면 이번에만 보기
              if (!libOk) return openScore(() => createSampleScore())
              const files = await createSampleFiles()
              await openScore(() => loadScoreFiles(files), { save: true, title: SAMPLE_TITLE })
            }}
            onOpen={openEntry}
            onRename={renameEntry}
            onDelete={removeEntries}
            onTour={startTour}
            storageNote={accountReady ? <BackupNote available={unbackedCount === 0} signedIn={signedIn} sync={sync} onLogin={() => openDrawer('account')} /> : undefined}
            notice={unbackedCount > 0 ? <BackupWarning count={unbackedCount} google={!!loginConfig?.google} onLogin={() => goLogin()} /> : undefined}
          />
        )}
      </main>

      {/* 시선 점 (시선 모드 · 보정 완료 · 표시 켬) */}
      {isGaze && settings.showGazeDot && live.gaze && gazeUi.step === 'idle' && <GazeDot point={live.gaze} inZone={live.inZone} />}
      {/* 시선 캘리브레이션 화면 */}
      {gazeUi.step !== 'idle' && <GazeCalibrationOverlay ui={gazeUi} progress={live.calibProgress} onCancel={cancelGazeCalibration} />}

      <SettingsDrawer
        open={drawerOpen}
        tab={drawerTab}
        onTab={setDrawerTab}
        onClose={() => setDrawerOpen(false)}
        settings={settings}
        update={update}
        updateMode={(patch) => applyMode(mode, patch)}
        onResetMode={() => {
          if (isGaze) return update({ gazeModel: null })
          if (mode === 'custom') update({ customModel: null })
          applyMode(mode, DEFAULT_SETTINGS.modes[mode])
        }}
        sig={live.sig}
        running={running}
        activeDelegate={tracker.activeDelegate}
        onRestartCamera={startCamera}
        log={log}
        sessionMs={sessionMs()}
        onToggleFalse={(id) => setLog((l) => l.map((e) => (e.id === id ? { ...e, falsePositive: !e.falsePositive } : e)))}
        onClearLog={clearLog}
        tester={tester}
        onTester={setTester}
        onCopyReport={copyReport}
        onTour={startTour}
        account={account.state.status === 'loading' || account.state.status === 'unavailable' ? undefined : <AccountPanel account={account} sync={sync} />}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          openFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      {dragging && <div className="drop-hint">여기에 놓으면 악보로 열어요</div>}
      {loginPrompt && (
        <LoginPrompt
          google={!!loginConfig?.google}
          onLogin={() => {
            setLoginPrompt(null)
            goLogin('add')
          }}
          onSkip={() => {
            const files = loginPrompt.files
            setLoginPrompt(null)
            // 버튼을 누른 바로 그 순간에 파일 고르기 창을 열어야 브라우저가 막지 않음
            if (files) openFiles(files)
            else fileInputRef.current?.click()
          }}
          onClose={() => setLoginPrompt(null)}
        />
      )}
      <Toast notice={notice} onDismiss={dismissNotice} />
    </div>
  )
}
