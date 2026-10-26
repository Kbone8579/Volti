import type { GazeModel, ZoneSize } from '@/features/gaze'
import type { CustomModel } from '@/features/custom-gesture'

export type GestureMode = 'head' | 'mouth' | 'wink' | 'gaze' | 'custom'

/** 모드별 판정 기준. 신호에서 baseline을 빼고 direction을 곱한 값(d)이 +threshold를 넘으면 "다음". */
export interface ModeConfig {
  baseline: number
  threshold: number
  direction: 1 | -1
}

export interface Settings {
  mode: GestureMode
  modes: Record<GestureMode, ModeConfig>
  holdMs: number
  cooldownMs: number
  /** 제스처를 인식한 뒤 넘기기까지 기다리는 시간 (0 = 바로) */
  turnDelayMs: number
  forwardOnly: boolean
  mirror: boolean
  showMesh: boolean
  resolution: 'low' | 'mid'
  maxFps: 10 | 15 | 30
  delegate: 'GPU' | 'CPU'
  /** 악보 보기: 자동(가로 화면이면 펼치기) / 한 페이지 / 펼치기(두 페이지) */
  viewMode: 'auto' | 'single' | 'spread'
  /** 펼치기에서 한 번에 넘길 페이지 수 */
  spreadStep: 1 | 2
  panelVisible: boolean
  /** 확대·위치 고정 (휠·핀치·끌기로 안 바뀜) */
  zoomLocked: boolean
  /** 마우스 휠: 확대·축소 / 위아래 이동(Ctrl+휠로 확대) */
  wheelMode: 'zoom' | 'scroll'
  /**
   * 확대해서 페이지가 화면보다 길 때 "다음"에 먼저 한 화면 아래로 이동할지.
   * 기본은 꺼짐 = 확대 중에도 바로 다음 페이지(맨 위부터)로 넘김
   */
  zoomScrollFirst: boolean
  /** 시선 모드: ▶ 구역을 이만큼 바라보면 넘김 */
  gazeDwellMs: number
  gazeZone: ZoneSize
  showGazeDot: boolean
  gazeModel: GazeModel | null
  /** 내 동작: 녹화해서 학습한 모델 */
  customModel: CustomModel | null
}

export interface ModeMeta {
  label: string
  short: string
  unit: string
  /** 그래프/바의 표시 범위 (±range) */
  range: number
  step: number
  digits: number
  minThreshold: number
  maxThreshold: number
  howTo: string
  goodFor: string
}

export const MODE_META: Record<GestureMode, ModeMeta> = {
  head: {
    label: '고개 돌리기',
    short: '고개',
    unit: '°',
    range: 45,
    step: 1,
    digits: 0,
    minThreshold: 5,
    maxThreshold: 40,
    howTo: '고개를 한쪽으로 돌린 채 잠깐 유지',
    goodFor: '피아노 · 기타 · 관악기',
  },
  mouth: {
    label: '입 옆으로',
    short: '입',
    unit: '',
    range: 1,
    step: 0.01,
    digits: 2,
    minThreshold: 0.08,
    maxThreshold: 0.9,
    howTo: '다문 입을 한쪽으로 쭉 밀고 유지',
    goodFor: '피아노 · 현악기 (관악기·성악 X)',
  },
  wink: {
    label: '윙크',
    short: '윙크',
    unit: '',
    range: 1,
    step: 0.01,
    digits: 2,
    minThreshold: 0.15,
    maxThreshold: 0.95,
    howTo: '한쪽 눈만 감고 유지 (양쪽 깜빡임은 무시됨)',
    goodFor: '대부분 악기 · 안경 착용 시 정확도 확인 필요',
  },
  gaze: {
    label: '시선',
    short: '시선',
    unit: '',
    range: 1,
    step: 0.01,
    digits: 2,
    minThreshold: 0.3,
    maxThreshold: 0.9,
    howTo: '마지막 줄 끝의 ▶ 버튼을 잠깐 바라보기',
    goodFor: '모든 악기 · 시선 캘리브레이션 필요 · 다음 페이지만',
  },
  custom: {
    label: '내 동작',
    short: '내 동작',
    unit: '',
    range: 1.5,
    step: 0.01,
    digits: 2,
    minThreshold: 0.3,
    maxThreshold: 0.9,
    howTo: '직접 녹화한 동작을 하고 잠깐 유지',
    goodFor: '원하는 어떤 표정·고개 동작이든 · 먼저 녹화 필요',
  },
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'head',
  modes: {
    head: { baseline: 0, threshold: 18, direction: 1 },
    mouth: { baseline: 0, threshold: 0.35, direction: 1 },
    wink: { baseline: 0, threshold: 0.45, direction: 1 },
    gaze: { baseline: 0, threshold: 0.6, direction: 1 },
    custom: { baseline: 0, threshold: 0.6, direction: 1 },
  },
  holdMs: 400,
  cooldownMs: 1500,
  turnDelayMs: 0,
  forwardOnly: true,
  mirror: true,
  showMesh: true,
  resolution: 'low',
  maxFps: 15,
  delegate: 'GPU',
  viewMode: 'auto',
  spreadStep: 2,
  panelVisible: true,
  zoomLocked: false,
  wheelMode: 'zoom',
  zoomScrollFirst: false,
  gazeDwellMs: 900,
  gazeZone: 'medium',
  showGazeDot: true,
  gazeModel: null,
  customModel: null,
}

const STORAGE_KEY = 'pageturn-gesture-lab/settings/v1'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<Settings> & { scrollBeforeTurn?: unknown }
    delete saved.scrollBeforeTurn // 예전 이름 (기본값이 켜짐이었음) → 버리고 새 기본값(꺼짐) 사용
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      modes: {
        head: { ...DEFAULT_SETTINGS.modes.head, ...saved.modes?.head },
        mouth: { ...DEFAULT_SETTINGS.modes.mouth, ...saved.modes?.mouth },
        wink: { ...DEFAULT_SETTINGS.modes.wink, ...saved.modes?.wink },
        gaze: { ...DEFAULT_SETTINGS.modes.gaze, ...saved.modes?.gaze },
        custom: { ...DEFAULT_SETTINGS.modes.custom, ...saved.modes?.custom },
      },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // 저장 불가 환경(시크릿 모드 등)은 무시
  }
}

/** 모드별 표시 단위로 반올림 (예: 고개 1°, 입 0.01) — 캘리브레이션 결과를 깔끔한 값으로 저장할 때 */
export function roundToStep(mode: GestureMode, v: number): number {
  const m = MODE_META[mode]
  return Number((Math.round(v / m.step) * m.step).toFixed(m.digits))
}

export function formatValue(mode: GestureMode, v: number): string {
  const m = MODE_META[mode]
  return `${v.toFixed(m.digits)}${m.unit}`
}
