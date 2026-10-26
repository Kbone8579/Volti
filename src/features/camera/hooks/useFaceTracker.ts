import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { DrawingUtils, FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'

// WASM은 scripts/copy-assets.mjs 가 public/ 으로 복사해 둔 것을 사용
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`
// 얼굴 랜드마크 모델 (약 3.7MB). public/models/face_landmarker.task 가 있으면 그걸 쓰고, 없으면 Google에서 받음
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/face_landmarker.task`

class ModelDownloadError extends Error {}

async function resolveModelUrl(): Promise<string> {
  try {
    const res = await fetch(LOCAL_MODEL, { method: 'HEAD' })
    const type = res.headers.get('content-type') ?? ''
    if (res.ok && !type.includes('text/html')) return LOCAL_MODEL
  } catch {
    // 로컬 파일 없음 → 원격 사용
  }
  return REMOTE_MODEL
}

const isNetworkError = (err: unknown) => err instanceof TypeError && /fetch|network|load/i.test(err.message)

export type Delegate = 'GPU' | 'CPU'
export type TrackerStatus = 'idle' | 'loading' | 'running' | 'error'

export interface TrackerFrame {
  t: number
  result: FaceLandmarkerResult
  /** 카메라 영상 가로/세로 비 */
  aspect: number
}

export interface StartOptions {
  resolution: 'low' | 'mid'
  delegate: Delegate
}

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** 매 프레임 읽는 설정 (리렌더 없이 즉시 반영) */
  getConfig: () => { maxFps: number; showMesh: boolean }
  onFrame: (frame: TrackerFrame) => void
}

const RESOLUTIONS = { low: { width: 320, height: 240 }, mid: { width: 640, height: 480 } }

async function createLandmarker(delegate: Delegate): Promise<{ landmarker: FaceLandmarker; delegate: Delegate }> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const modelUrl = await resolveModelUrl()
  const make = (d: Delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate: d },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
  try {
    return { landmarker: await make(delegate), delegate }
  } catch (err) {
    if (isNetworkError(err)) throw new ModelDownloadError(String(err))
    if (delegate === 'GPU') {
      console.warn('GPU 초기화 실패 → CPU로 전환', err)
      return { landmarker: await make('CPU'), delegate: 'CPU' }
    }
    throw err
  }
}

function describeError(err: unknown): string {
  if (err instanceof ModelDownloadError || isNetworkError(err)) {
    return '얼굴 인식 모델(약 3.7MB)을 내려받지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'
  }
  if (err instanceof DOMException) {
    // Chrome은 운영체제가 막은 경우 "Permission denied by system" 메시지를 줌
    if (err.name === 'NotAllowedError' && /system/i.test(err.message)) {
      return /Mac/i.test(navigator.userAgent)
        ? 'macOS가 브라우저의 카메라 사용을 막고 있어요. 시스템 설정 → 개인정보 보호 및 보안 → 카메라에서 브라우저를 켠 뒤, 브라우저를 완전히 종료(⌘Q)했다가 다시 열어 주세요.'
        : '운영체제 설정에서 브라우저의 카메라 사용이 꺼져 있어요. 개인정보(카메라) 설정에서 허용해 주세요.'
    }
    if (err.name === 'NotAllowedError') return '카메라 권한이 거부됐어요. 주소창의 카메라 아이콘에서 허용해 주세요.'
    if (err.name === 'NotFoundError') return '카메라를 찾지 못했어요.'
    if (err.name === 'NotReadableError') return '다른 앱이 카메라를 쓰고 있어요.'
  }
  if (!window.isSecureContext) return '카메라는 HTTPS 또는 localhost에서만 켜져요.'
  return err instanceof Error ? err.message : String(err)
}

export function useFaceTracker(opts: Options) {
  const [status, setStatus] = useState<TrackerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [activeDelegate, setActiveDelegate] = useState<Delegate | null>(null)
  const [perf, setPerf] = useState({ fps: 0, inferMs: 0 })

  const optsRef = useRef(opts)
  useLayoutEffect(() => {
    optsRef.current = opts
  })

  const lmRef = useRef<{ landmarker: FaceLandmarker; delegate: Delegate; requested: Delegate } | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const wakeRef = useRef<WakeLockSentinel | null>(null)
  const runningRef = useRef(false)

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      // 지원 안 하거나 거부되면 무시 (화면 자동 꺼짐 설정을 길게 두면 됨)
    }
  }, [])

  const stop = useCallback(() => {
    runningRef.current = false
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    const video = optsRef.current.videoRef.current
    if (video) video.srcObject = null
    const canvas = optsRef.current.canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    wakeRef.current?.release().catch(() => {})
    wakeRef.current = null
    setStatus('idle')
    setPerf({ fps: 0, inferMs: 0 })
  }, [])

  const start = useCallback(
    async ({ resolution, delegate }: StartOptions) => {
      stop()
      setStatus('loading')
      setError(null)
      try {
        if (!lmRef.current || lmRef.current.requested !== delegate) {
          lmRef.current?.landmarker.close()
          lmRef.current = null
          const made = await createLandmarker(delegate)
          lmRef.current = { ...made, requested: delegate }
        }
        setActiveDelegate(lmRef.current.delegate)

        const size = RESOLUTIONS[resolution]
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: 30 } },
        })
        streamRef.current = stream

        const video = optsRef.current.videoRef.current
        const canvas = optsRef.current.canvasRef.current
        if (!video || !canvas) throw new Error('비디오 요소를 찾을 수 없어요.')
        video.srcObject = stream
        await video.play()
        canvas.width = video.videoWidth || size.width
        canvas.height = video.videoHeight || size.height

        await requestWakeLock()
        runningRef.current = true
        setStatus('running')
        loop()
      } catch (err) {
        console.error(err)
        stop()
        setError(describeError(err))
        setStatus('error')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop, requestWakeLock],
  )

  function loop() {
    const lm = lmRef.current?.landmarker
    const canvas = optsRef.current.canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null
    const drawer = ctx ? new DrawingUtils(ctx) : null

    let lastVideoTime = -1
    let lastInfer = 0
    let frames = 0
    let inferSum = 0
    let windowStart = performance.now()

    const tick = () => {
      if (!runningRef.current) return
      rafRef.current = requestAnimationFrame(tick)
      const video = optsRef.current.videoRef.current
      if (!lm || !video || video.readyState < 2) return

      const now = performance.now()
      const { maxFps, showMesh } = optsRef.current.getConfig()
      if (now - lastInfer < 1000 / maxFps - 3) return
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime
      lastInfer = now

      let result: FaceLandmarkerResult
      const t0 = performance.now()
      try {
        result = lm.detectForVideo(video, now)
      } catch (err) {
        console.error(err)
        return
      }
      inferSum += performance.now() - t0
      frames++

      if (ctx && canvas && drawer) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const face = result.faceLandmarks[0]
        if (showMesh && face) {
          const line = { color: 'rgba(94, 234, 212, 0.75)', lineWidth: 1.5 }
          drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, line)
          drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_LIPS, line)
          drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, line)
          drawer.drawConnectors(face, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, line)
          drawer.drawLandmarks([face[1]], { color: '#fbbf24', fillColor: '#fbbf24', radius: 3 })
        }
      }

      optsRef.current.onFrame({ t: now, result, aspect: video.videoWidth / video.videoHeight || 4 / 3 })

      if (now - windowStart >= 1000) {
        setPerf({ fps: Math.round((frames * 1000) / (now - windowStart)), inferMs: inferSum / Math.max(1, frames) })
        frames = 0
        inferSum = 0
        windowStart = now
      }
    }
    tick()
  }

  // 탭을 다시 보면 화면 꺼짐 방지 재요청 (브라우저가 숨김 시 자동 해제함)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && runningRef.current) requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [requestWakeLock])

  useEffect(
    () => () => {
      stop()
      lmRef.current?.landmarker.close()
      lmRef.current = null
    },
    [stop],
  )

  return { status, error, activeDelegate, perf, start, stop }
}
