// @vitest-environment jsdom
/**
 * 화면 흐름 테스트: 카메라·얼굴 인식을 가짜로 바꿔서
 * "카메라 켜기 → 시선 캘리브레이션 → ▶ 칸 바라보기 → 페이지 넘김" 전체를 확인한다.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { TrackerFrame } from '@/features/camera/hooks/useFaceTracker'

const h = vi.hoisted(() => ({ frame: null as null | ((f: TrackerFrame) => void) }))

vi.mock('@/features/camera/hooks/useFaceTracker', async () => {
  const React = await import('react')
  return {
    useFaceTracker: (opts: { onFrame: (f: TrackerFrame) => void }) => {
      const [status, setStatus] = React.useState<'idle' | 'running'>('idle')
      h.frame = opts.onFrame
      return {
        status,
        error: null,
        activeDelegate: 'CPU',
        perf: { fps: 15, inferMs: 5 },
        start: async () => setStatus('running'),
        stop: () => setStatus('idle'),
      }
    },
  }
})

vi.mock('@/features/score/lib/scoreFiles', () => {
  const make = (n: number, title = '테스트 악보', sources: File[] = []) => ({
    title,
    pages: Array.from({ length: n }, (_, i) => ({ id: `${title}-p${i}`, label: `p${i}`, source: { kind: 'image', url: `blob:${title}-p${i}` } })),
    warnings: [],
    sources,
    dispose: () => {},
  })
  return {
    ACCEPT: '*',
    SAMPLE_TITLE: '샘플 연습곡',
    createSampleScore: async () => make(6, '샘플 연습곡'),
    createSampleFiles: async () =>
      Array.from({ length: 6 }, (_, i) => new File([`sample-${i}`], `샘플 연습곡 0${i + 1}.png`, { type: 'image/png' })),
    makeThumbnailFromFile: async () => null,
    loadScoreFiles: async (files: File[]) => make(6, files[0].name.replace(/\.[^.]+$/, ''), files),
    getPageUrl: async (p: { source: { url: string } }) => p.source.url,
    peekPageUrl: (p: { source: { url: string } }) => p.source.url,
    makeThumbnail: async () => null,
    isSampleFiles: (names: string[]) => names.length > 0 && names.every((n) => n.startsWith('샘플 연습곡 ')),
  }
})

// 라이브러리(IndexedDB)는 메모리 버전으로 바꿔서 화면 흐름만 확인 (저장 로직 자체는 library.test.ts)
vi.mock('@/features/library/lib/libraryDb', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/library/lib/libraryDb')>()
  type E = import('@/features/library/lib/libraryDb').LibraryEntry
  const db = new Map<string, E>()
  const blobs = new Map<string, File[]>()
  let n = 0
  return {
    ...real,
    libraryAvailable: () => true,
    listScores: async () => [...db.values()].sort((a, b) => b.openedAt - a.openedAt),
    findBySignature: async (sig: string) => [...db.values()].find((e) => e.signature === sig) ?? null,
    addScore: async (files: File[], meta: { title: string; pageCount: number; thumb: Blob | null }) => {
      const now = Date.now() + n
      const e: E = { id: `id${++n}`, title: meta.title, signature: real.fileSignature(files), fileNames: files.map((f) => f.name), size: 1, pageCount: meta.pageCount, createdAt: now, openedAt: now, lastPage: 0, thumb: meta.thumb }
      db.set(e.id, e)
      blobs.set(e.id, files)
      return e
    },
    getScoreFiles: async (id: string) => blobs.get(id)!,
    updateScore: async (id: string, patch: Partial<E>) => {
      const cur = db.get(id)
      if (!cur) return null
      const next = { ...cur, ...patch }
      db.set(id, next)
      return next
    },
    deleteScore: async (id: string) => {
      db.delete(id)
      blobs.delete(id)
    },
    restoreScore: async (entry: E, files: File[]) => {
      db.set(entry.id, entry)
      blobs.set(entry.id, files)
    },
    requestPersistence: async () => true,
    storageUsage: async () => 3 * 1024 * 1024,
    __reset: () => {
      db.clear()
      blobs.clear()
    },
  }
})

import App from './App'
import * as libraryModule from '@/features/library/lib/libraryDb'
import { NEXT_TARGET_INSET } from '@/features/score/components/ScoreViewer'
import { TOUR_KEY } from '@/features/tour'

const SCORE_RECT = { left: 0, top: 56, width: 700, height: 700 }

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  // 서버 없음 (계정 기능 숨김) — 계정 흐름 테스트에서만 따로 바꿈
  vi.stubGlobal('fetch', noServer)
  const orig = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.classList?.contains('score-wrap') || this.classList?.contains('score')) {
      const r = SCORE_RECT
      return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON() {} } as DOMRect
    }
    return orig.call(this)
  }
})

const noServer = async () => new Response('not found', { status: 404 })

beforeEach(() => {
  vi.stubGlobal('fetch', noServer)
  localStorage.clear()
  localStorage.setItem(TOUR_KEY, '1') // 30초 체험은 따로 테스트 (나머지는 이미 본 상태로)
  ;(libraryModule as unknown as { __reset: () => void }).__reset()
  // 앱이 쓰는 performance.now()를 가짜 프레임 시계에 맞춤
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(cleanup)

/** 화면 좌표(px)를 바라보는 얼굴을 흉내낸 인식 결과. 시선은 눈 블렌드쉐입에, 약간의 떨림 포함 */
let seed = 11
const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02
function lookingAt(px: number, py: number, extra: Record<string, number> = {}): FaceLandmarkerResult {
  const x = px / window.innerWidth
  const y = py / window.innerHeight
  const scores: Record<string, number> = {
    eyeLookOutRight: x + jitter(),
    eyeLookInLeft: x + jitter(),
    eyeLookInRight: 1 - x + jitter(),
    eyeLookOutLeft: 1 - x + jitter(),
    eyeLookUpLeft: 1 - y + jitter(),
    eyeLookUpRight: 1 - y + jitter(),
    eyeLookDownLeft: y + jitter(),
    eyeLookDownRight: y + jitter(),
    ...extra,
  }
  return {
    faceLandmarks: [Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))],
    faceBlendshapes: [
      {
        headIndex: 0,
        headName: '',
        categories: Object.entries(scores).map(([categoryName, score], index) => ({ categoryName, score, index, displayName: '' })),
      },
    ],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1] }],
  }
}

let clock = 1000
function feed(result: FaceLandmarkerResult, ms: number, step = 66) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    clock += step
    act(() => h.frame!({ t: clock, result, aspect: 4 / 3 }))
  }
}

async function setup() {
  render(<App />)
  // 처음 실행하면 라이브러리에 들어 있는 샘플 악보를 연다
  fireEvent.click(await screen.findByRole('button', { name: '샘플 연습곡 열기' }))
  await screen.findByText('1 / 6')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '카메라 켜기' })))
}

describe('시선 모드 흐름', () => {
  it('캘리브레이션 → ▶ 칸을 보면 넘어가고, 악보 가운데를 볼 때는 안 넘어감', async () => {
    await setup()
    fireEvent.click(screen.getByRole('tab', { name: '시선' }))
    expect(screen.getByText(/먼저 해 주세요/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '시선 캘리브레이션' }))
    // 오버레이에 나오는 점을 그대로 따라 본다
    for (let guard = 0; guard < 400 && document.querySelector('.gc-dot'); guard++) {
      const dot = document.querySelector<HTMLElement>('.gc-dot')!
      feed(lookingAt(parseFloat(dot.style.left), parseFloat(dot.style.top)), 66)
    }
    expect(document.querySelector('.gaze-calib')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/시선 캘리브레이션 완료/)

    // 악보 가운데를 3초 동안 읽음 → 그대로
    const r = SCORE_RECT
    feed(lookingAt(r.left + r.width / 2, r.top + r.height / 2), 3000)
    expect(screen.getByText('1 / 6')).toBeTruthy()

    // 마지막 줄 가운데 → 그대로
    feed(lookingAt(r.left + r.width / 2, r.top + r.height * 0.92), 2000)
    expect(screen.getByText('1 / 6')).toBeTruthy()

    // ▶ 버튼을 1.5초 바라봄 → 다음 페이지
    const target = { x: r.left + r.width - NEXT_TARGET_INSET, y: r.top + r.height - NEXT_TARGET_INSET }
    feed(lookingAt(target.x, target.y), 1500)
    expect(screen.getByText('2 / 6')).toBeTruthy()

    // 계속 보고 있어도 한 번만 넘어감 (칸을 벗어났다 돌아와야 다시)
    feed(lookingAt(target.x, target.y), 3000)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    feed(lookingAt(r.left + r.width / 3, r.top + r.height / 3), 1000)
    feed(lookingAt(target.x, target.y), 1500)
    expect(screen.getByText('3 / 6')).toBeTruthy()

    // 짧게 스치는 눈길(0.4초)은 무시
    feed(lookingAt(r.left + r.width / 3, r.top + r.height / 3), 2000)
    feed(lookingAt(target.x, target.y), 400)
    feed(lookingAt(r.left + r.width / 3, r.top + r.height / 3), 1000)
    expect(screen.getByText('3 / 6')).toBeTruthy()
  })

  it('빠른 보정: 시선이 어긋나도 ▶ 를 보며 보정하면 다시 넘어감', async () => {
    await setup()
    fireEvent.click(screen.getByRole('tab', { name: '시선' }))
    fireEvent.click(screen.getByRole('button', { name: '시선 캘리브레이션' }))
    for (let guard = 0; guard < 400 && document.querySelector('.gc-dot'); guard++) {
      const dot = document.querySelector<HTMLElement>('.gc-dot')!
      feed(lookingAt(parseFloat(dot.style.left), parseFloat(dot.style.top)), 66)
    }
    const r = SCORE_RECT
    const target = { x: r.left + r.width - NEXT_TARGET_INSET, y: r.top + r.height - NEXT_TARGET_INSET }
    // 자세가 바뀌어 시선 추정이 왼쪽 위로 250px 밀린 상황
    const drift = (x: number, y: number) => lookingAt(x - 250, y - 250)
    feed(drift(target.x, target.y), 2000)
    expect(screen.getByText('1 / 6')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '빠른 보정' }))
    feed(drift(target.x, target.y), 2400)
    expect(screen.getByRole('status').textContent).toMatch(/다시 보정/)

    feed(drift(r.left + r.width / 2, r.top + r.height / 2), 1000)
    feed(drift(target.x, target.y), 1500)
    expect(screen.getByText('2 / 6')).toBeTruthy()
  })
})

describe('고개 모드 흐름', () => {
  it('기본 고개 돌리기 + 이전 페이지 제스처 스위치', async () => {
    await setup()
    const head = (yawDeg: number): FaceLandmarkerResult => {
      const th = (-yawDeg * Math.PI) / 180
      const c = Math.cos(th)
      const s = Math.sin(th)
      const res = lookingAt(300, 300)
      res.facialTransformationMatrixes = [{ rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1] }]
      return res
    }
    feed(head(0), 500)
    feed(head(25), 800)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    feed(head(0), 2000)
    // 기본은 앞으로만 → 반대로 돌려도 그대로
    feed(head(-25), 800)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    feed(head(0), 2000)
    fireEvent.click(screen.getByRole('checkbox', { name: /이전 페이지 제스처/ }))
    feed(head(-25), 800)
    expect(screen.getByText('1 / 6')).toBeTruthy()
  })
})

describe('내 동작 흐름', () => {
  /** 블렌드쉐입 점수 + 고개 좌우 각도로 만든 인식 결과 */
  function face(scores: Record<string, number>, yawDeg = 0): FaceLandmarkerResult {
    const res = lookingAt(300, 300, scores)
    const th = (-yawDeg * Math.PI) / 180
    const c = Math.cos(th)
    const s = Math.sin(th)
    res.facialTransformationMatrixes = [{ rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1] }]
    return res
  }
  let phase = 0
  /** 악보를 읽으며 연주: 눈동자가 계속 움직이고 고개가 조금 흔들림 */
  const playing = () => {
    phase += 0.35
    return face(
      {
        eyeLookDownLeft: 0.35 + 0.25 * Math.sin(phase),
        eyeLookDownRight: 0.35 + 0.25 * Math.sin(phase),
        eyeLookOutRight: 0.3 + 0.3 * Math.sin(phase * 0.7),
        eyeLookInLeft: 0.3 + 0.3 * Math.sin(phase * 0.7),
        eyeBlinkLeft: 0.1 + jitter() * 3,
        eyeBlinkRight: 0.1 + jitter() * 3,
        jawOpen: 0.08 + jitter() * 3,
        browInnerUp: 0.05 + jitter(),
        cheekPuff: 0.02 + jitter(),
      },
      4 * Math.sin(phase * 0.3),
    )
  }
  const feedEach = (make: () => FaceLandmarkerResult, ms: number) => {
    for (let e = 0; e < ms; e += 66) feed(make(), 66)
  }
  const brows = () => {
    const r = playing()
    r.faceBlendshapes[0].categories.push(
      { categoryName: 'browInnerUp', score: 0.8 + jitter(), index: 90, displayName: '' },
      { categoryName: 'browOuterUpLeft', score: 0.6 + jitter(), index: 91, displayName: '' },
      { categoryName: 'browOuterUpRight', score: 0.6 + jitter(), index: 92, displayName: '' },
    )
    return r
  }
  const puff = () => {
    const r = playing()
    r.faceBlendshapes[0].categories.push({ categoryName: 'cheekPuff', score: 0.75 + jitter(), index: 93, displayName: '' })
    return r
  }

  it('녹화(평소 → 다음: 눈썹 올리기 → 이전: 볼 부풀리기) 후 연주 중엔 그대로, 동작하면 넘어감', async () => {
    await setup()
    fireEvent.click(screen.getByRole('tab', { name: '내 동작' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /이전 페이지 제스처/ }))
    fireEvent.click(screen.getByRole('button', { name: '동작 녹화' }))
    expect(screen.getByText(/1\/3 · 평소 연주 자세/)).toBeTruthy()

    feedEach(playing, 5100)
    expect(screen.getByText(/2\/3 · 다음 페이지 동작/)).toBeTruthy()
    feedEach(brows, 3600)
    expect(screen.getByText(/3\/3 · 이전 페이지 동작/)).toBeTruthy()
    feedEach(puff, 3600)

    expect(document.querySelector('.rec-banner')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/내 동작 저장 · 다음: 눈썹/)
    expect(screen.getByRole('status').textContent).toMatch(/이전: 볼 부풀리기/)

    // 8초 동안 평소처럼 연주 → 안 넘어감
    feedEach(playing, 8000)
    expect(screen.getByText('1 / 6')).toBeTruthy()

    // 눈썹 올리기 0.7초 → 다음
    feedEach(brows, 700)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    feedEach(playing, 2000)
    feedEach(brows, 700)
    expect(screen.getByText('3 / 6')).toBeTruthy()
    feedEach(playing, 2000)

    // 볼 부풀리기 → 이전
    feedEach(puff, 700)
    expect(screen.getByText('2 / 6')).toBeTruthy()

    // 짧게(0.2초) 스치면 무시
    feedEach(playing, 2000)
    feedEach(brows, 200)
    feedEach(playing, 1500)
    expect(screen.getByText('2 / 6')).toBeTruthy()
  })

  it('이전 페이지 제스처를 안 켜고 녹화했어도 → 이전 동작만 따로 추가 (처음부터 다시 안 해도 됨)', async () => {
    await setup()
    fireEvent.click(screen.getByRole('tab', { name: '내 동작' }))
    fireEvent.click(screen.getByRole('button', { name: '동작 녹화' }))
    expect(screen.getByText(/1\/2 · 평소 연주 자세/)).toBeTruthy()
    feedEach(playing, 5100)
    feedEach(brows, 3600)
    expect(screen.getByRole('status').textContent).toMatch(/내 동작 저장 · 다음: 눈썹/)

    // 나중에 이전 페이지 제스처를 켜면 → 바로 녹화할 수 있게 안내
    fireEvent.click(screen.getByRole('checkbox', { name: /이전 페이지 제스처/ }))
    expect(screen.getByRole('status').textContent).toMatch(/이전 페이지로 넘길 동작을 녹화해 주세요/)
    fireEvent.click(screen.getByRole('checkbox', { name: /이전 페이지 제스처/ })) // 다시 끔

    // 꺼진 상태에서도 「이전 동작 녹화」 버튼으로 이전 동작만 녹화 → 저장되면 자동으로 켜짐
    fireEvent.click(within(document.querySelector<HTMLElement>('.learned')!).getByRole('button', { name: /이전 동작 녹화/ }))
    expect(screen.getByText('이전 페이지 동작 녹화')).toBeTruthy()
    feedEach(puff, 3600)
    expect(document.querySelector('.rec-banner')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/이전 동작 저장 · 볼 부풀리기.*이전 페이지 제스처를 켰어요/)
    expect((screen.getByRole('checkbox', { name: /이전 페이지 제스처/ }) as HTMLInputElement).checked).toBe(true)

    // 연주 중엔 그대로, 눈썹 → 다음, 볼 → 이전
    feedEach(playing, 6000)
    expect(screen.getByText('1 / 6')).toBeTruthy()
    feedEach(brows, 700)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    feedEach(playing, 2000)
    feedEach(puff, 700)
    expect(screen.getByText('1 / 6')).toBeTruthy()

    // 다음 동작만 다시 녹화 (이전 동작은 그대로 남음)
    feedEach(playing, 2000)
    fireEvent.click(screen.getByRole('button', { name: '다음 동작만 다시 녹화' }))
    expect(screen.getByText('다음 페이지 동작 다시 녹화')).toBeTruthy()
    feedEach(brows, 3600)
    expect(screen.getByRole('status').textContent).toMatch(/다음 동작 저장/)
    expect(screen.getByRole('button', { name: '이전 동작만 다시 녹화' })).toBeTruthy()
  })

  it('평소 자세와 같은 동작을 녹화하면 경고', async () => {
    await setup()
    fireEvent.click(screen.getByRole('tab', { name: '내 동작' }))
    fireEvent.click(screen.getByRole('button', { name: '동작 녹화' }))
    feedEach(playing, 5100)
    feedEach(playing, 3600)
    expect(screen.getByRole('status').textContent).toMatch(/평소 자세와 거의 같아요|오작동이 날 수/)
  })
})

describe('라이브러리 흐름', () => {
  const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
  const pdf = (name: string, size = 10) => new File(['x'.repeat(size)], name, { type: 'application/pdf' })
  const addFiles = async (files: File[]) => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    await act(async () => {
      fireEvent.change(input, { target: { files } })
    })
  }
  const key = (k: string) => fireEvent.keyDown(window, { key: k })
  const openLibrary = () => fireEvent.click(screen.getByRole('button', { name: '라이브러리' }))

  it('추가하면 저장되고, 다시 열면 보던 쪽부터 · 이름 바꾸기 · 삭제', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: '샘플 연습곡 열기' })).toBeTruthy()

    // 악보 추가 → 라이브러리에 저장 + 바로 열림
    await addFiles([pdf('아리랑 변주곡.pdf')])
    expect(await screen.findByText('1 / 6')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/라이브러리에 저장했어요 · 아리랑 변주곡/)

    // 3쪽 넘기고 잠시 뒤 → 보던 쪽 저장
    key('ArrowRight')
    key('ArrowRight')
    key('ArrowRight')
    expect(screen.getByText('4 / 6')).toBeTruthy()
    await wait(750)

    // 라이브러리 열기 → 카드에 표시, 라이브러리가 열려 있는 동안은 넘김 무시
    openLibrary()
    expect(await screen.findByText(/4쪽까지 봄/)).toBeTruthy()
    expect(screen.getByText('보는 중')).toBeTruthy()
    key('ArrowRight')
    expect(screen.getByText('4 / 6')).toBeTruthy()

    // 다른 악보 추가
    await addFiles([pdf('캐논.pdf', 20)])
    expect(await screen.findByText('1 / 6')).toBeTruthy()
    expect(screen.getByText('캐논')).toBeTruthy()

    // 첫 악보를 라이브러리에서 다시 열기 → 4쪽부터
    openLibrary()
    fireEvent.click(await screen.findByRole('button', { name: '아리랑 변주곡 열기' }))
    expect(await screen.findByText('4 / 6')).toBeTruthy()

    // 같은 파일을 다시 추가하면 새로 만들지 않고 이어보기
    await addFiles([pdf('캐논.pdf', 20)])
    await screen.findByText(/이미 라이브러리에 있는 악보/)
    openLibrary()
    expect(await screen.findAllByRole('button', { name: /열기$/ })).toHaveLength(3) // 샘플 + 2곡

    // 검색
    fireEvent.change(screen.getByRole('searchbox', { name: '악보 검색' }), { target: { value: '아리' } })
    expect(screen.getAllByRole('button', { name: /열기$/ })).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox', { name: '악보 검색' }), { target: { value: '' } })

    // 이름 바꾸기
    const card = screen.getByRole('button', { name: '아리랑 변주곡 열기' }).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: /이름 바꾸기/ }))
    const input = within(card).getByRole('textbox', { name: '새 이름' })
    fireEvent.change(input, { target: { value: '아리랑 (2악장)' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(await screen.findByRole('button', { name: '아리랑 (2악장) 열기' })).toBeTruthy()

    // 카드의 삭제 → 바로 지워지고 「되돌리기」 가능
    const card2 = screen.getByRole('button', { name: '캐논 열기' }).closest('li')!
    await act(async () => {
      fireEvent.click(within(card2).getByRole('button', { name: /삭제/ }))
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: '캐논 열기' })).toBeNull())
    expect(screen.getAllByRole('button', { name: /열기$/ })).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toMatch(/「캐논」 삭제했어요/)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    })
    expect(await screen.findByRole('button', { name: '캐논 열기' })).toBeTruthy()

    // 선택해서 여러 개 삭제 → 되돌리기
    fireEvent.click(screen.getByRole('button', { name: '선택' }))
    expect(screen.getByText('0개 선택됨')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '캐논 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '아리랑 (2악장) 선택' }))
    expect(screen.getByText('2개 선택됨')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2개 삭제/ }))
    })
    await waitFor(() => expect(screen.getAllByRole('button', { name: /열기$/ })).toHaveLength(1)) // 샘플만 남음
    expect(screen.getByRole('status').textContent).toMatch(/2개 악보를 삭제했어요/)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    })
    expect(await screen.findAllByRole('button', { name: /열기$/ })).toHaveLength(3)

    // 모두 선택 → 지우고 (되돌리지 않음)
    fireEvent.click(screen.getByRole('button', { name: '선택' }))
    fireEvent.click(screen.getByRole('button', { name: '모두 선택' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3개 삭제/ }))
    })
    expect(await screen.findByText('아직 저장된 악보가 없어요')).toBeTruthy()

    // 라이브러리에서 지워도 지금 보던 악보(캐논)는 화면에 그대로 남음
    fireEvent.click(screen.getByRole('button', { name: '악보로 돌아가기' }))
    expect(document.querySelector('.library')).toBeNull()
    expect(screen.getByText('1 / 6')).toBeTruthy()
    expect(screen.getByText('캐논')).toBeTruthy()
  })

  it('처음엔 샘플 악보가 들어 있고, 지우면 다시 생기지 않음 · 빈 화면에서 다시 넣기', async () => {
    const first = render(<App />)
    const card = (await screen.findByRole('button', { name: '샘플 연습곡 열기' })).closest('li')!
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: /삭제/ }))
    })
    expect(await screen.findByText('아직 저장된 악보가 없어요')).toBeTruthy()

    // 다시 실행해도 샘플을 또 넣지 않음
    first.unmount()
    render(<App />)
    expect(await screen.findByText('아직 저장된 악보가 없어요')).toBeTruthy()

    // 빈 화면의 「샘플 악보 넣기」 → 라이브러리에 넣고 바로 열기
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '샘플 악보 넣기' }))
    })
    expect(await screen.findByText('1 / 6')).toBeTruthy()
    openLibrary()
    expect(await screen.findByRole('button', { name: '샘플 연습곡 열기' })).toBeTruthy()
  })
})

describe('넘기기 전 대기', () => {
  const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
  const head = (yawDeg: number): FaceLandmarkerResult => {
    const th = (-yawDeg * Math.PI) / 180
    const c = Math.cos(th)
    const s = Math.sin(th)
    const res = lookingAt(300, 300)
    res.facialTransformationMatrixes = [{ rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1] }]
    return res
  }

  it('제스처 → 1초 기다렸다 넘김 · 취소 · 손으로 넘기면 바로', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: '1초' }))

    // 고개 돌림 인식 → 바로는 안 넘어가고 카운트다운 표시
    feed(head(0), 500)
    feed(head(25), 800)
    expect(screen.getByText('1 / 6')).toBeTruthy()
    expect(screen.getByRole('timer').textContent).toMatch(/뒤 다음 페이지/)
    await wait(1100)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(screen.queryByRole('timer')).toBeNull()

    // 다시 제스처 → 「취소」 → 안 넘어감 (기록에는 '대기 중 취소')
    feed(head(0), 2000)
    feed(head(25), 800)
    expect(screen.getByRole('timer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await wait(1100)
    expect(screen.getByText('2 / 6')).toBeTruthy()

    // 다시 제스처 → Esc 로 취소
    feed(head(0), 2000)
    feed(head(25), 800)
    fireEvent.keyDown(window, { key: 'Escape' })
    await wait(1100)
    expect(screen.getByText('2 / 6')).toBeTruthy()

    // 기다리는 중에 키보드로 넘기면 바로 한 번만 넘어감
    feed(head(0), 2000)
    feed(head(25), 800)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('3 / 6')).toBeTruthy()
    await wait(1100)
    expect(screen.getByText('3 / 6')).toBeTruthy()

    // 테스트 기록: 넘김 4번 인식, 그중 2번은 대기 중 취소
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    fireEvent.click(screen.getByRole('button', { name: /테스트 기록/ }))
    expect(screen.getAllByText('대기 중 취소')).toHaveLength(3)

    // 「바로」로 되돌리면 즉시 넘김
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '바로' }))
    feed(head(0), 2000)
    feed(head(25), 800)
    expect(screen.getByText('4 / 6')).toBeTruthy()
  }, 20000)
})

describe('확대 · 축소', () => {
  const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
  const zoomLabel = () => screen.getByRole('button', { name: /배율 고르기/ }).textContent ?? ''
  const stage = () => document.querySelector<HTMLElement>('.stage')!
  const pick = (name: string | RegExp) => {
    fireEvent.click(screen.getByRole('button', { name: /배율 고르기/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name }))
  }

  it('버튼 · 프리셋 · 휠로 배율 조절, 고정하면 안 바뀜', async () => {
    await setup()
    expect(zoomLabel()).toBe('100%')
    fireEvent.click(screen.getByRole('button', { name: '확대' }))
    expect(zoomLabel()).toBe('110%')
    fireEvent.click(screen.getByRole('button', { name: '축소' }))
    fireEvent.click(screen.getByRole('button', { name: '축소' }))
    expect(zoomLabel()).toBe('90%')
    pick(/200%/)
    expect(zoomLabel()).toBe('200%')
    expect(stage().dataset.zoom).toBe('2.000')

    // 휠: 위로 굴리면 확대
    const score = document.querySelector<HTMLElement>('.score')!
    fireEvent.wheel(score, { deltaY: -100, clientX: 350, clientY: 350 })
    expect(Number(stage().dataset.zoom)).toBeGreaterThan(2)
    // 키보드 0 → 화면 맞춤
    fireEvent.keyDown(window, { key: '0' })
    expect(zoomLabel()).toBe('100%')

    // 고정: 버튼·휠로 안 바뀜
    fireEvent.click(screen.getByRole('button', { name: '확대·위치 고정' }))
    expect((screen.getByRole('button', { name: '확대' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.wheel(score, { deltaY: -300, clientX: 350, clientY: 350 })
    expect(stage().dataset.zoom).toBe('1.000')
    fireEvent.click(screen.getByRole('button', { name: '확대·위치 고정 풀기' }))
    expect((screen.getByRole('button', { name: '확대' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('확대 중 「다음」·「이전」: 바로 넘기고, 배율과 보던 위치(위아래·좌우)는 그대로', async () => {
    await setup()
    const score = document.querySelector<HTMLElement>('.score')!
    pick(/너비 맞춤/)
    expect(Number(stage().dataset.y)).toBe(10) // 너비 맞춤은 페이지 맨 위부터
    // 가로로만 움직인 휠은 배율을 바꾸지 않음 (너비 맞춤 유지)
    fireEvent.wheel(score, { deltaY: 0, deltaX: 30 })
    expect(zoomLabel()).toMatch(/^너비/)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(zoomLabel()).toMatch(/^너비/)

    // 페이지 아래쪽을 확대해서 보는 중
    pick(/200%/)
    fireEvent.wheel(score, { deltaY: -100, clientX: 500, clientY: 650 })
    const at = () => ({ x: Number(stage().dataset.x), y: Number(stage().dataset.y), z: stage().dataset.zoom })
    const before = at()
    expect(before.y).toBeLessThan(0) // 맨 위가 아님
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('3 / 6')).toBeTruthy()
    expect(at()).toEqual(before) // 다음 페이지도 같은 자리, 같은 배율
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(at()).toEqual(before)
  })

  it('설정에서 「확대 중엔 아래로 먼저 이동」을 켜면: 한 화면씩 내려간 뒤 넘김', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    fireEvent.click(screen.getByRole('button', { name: '화면·성능' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /확대 중엔 아래로 먼저 이동/ }))
    fireEvent.keyDown(window, { key: 'Escape' })
    pick(/너비 맞춤/)
    const top = Number(stage().dataset.y)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('1 / 6')).toBeTruthy()
    expect(Number(stage().dataset.y)).toBeLessThan(top)
    for (let i = 0; i < 5 && screen.queryByText('1 / 6'); i++) fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(Number(stage().dataset.y)).toBe(top)
    // 이전: 앞 페이지의 맨 아래로
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 6')).toBeTruthy()
    expect(Number(stage().dataset.y)).toBeLessThan(top)
  })

  it('배율은 악보마다 저장 · 다시 열면 그 배율', async () => {
    await setup()
    pick(/150%/)
    await wait(700)
    // 다른 악보 → 화면 맞춤으로 시작
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], '캐논.pdf', { type: 'application/pdf' })] } })
    })
    await screen.findByText('캐논')
    expect(zoomLabel()).toBe('100%')
    // 샘플 다시 열기 → 150%
    fireEvent.click(screen.getByRole('button', { name: '라이브러리' }))
    fireEvent.click(await screen.findByRole('button', { name: '샘플 연습곡 열기' }))
    await waitFor(() => expect(zoomLabel()).toBe('150%'))
  })

  it('카메라 패널은 사이드 탭으로 접고 펼침', async () => {
    await setup()
    const tab = screen.getByRole('button', { name: /내 화면/ })
    expect(tab.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(tab)
    expect(document.querySelector('.main')!.classList.contains('panel-closed')).toBe(true)
    expect(tab.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(tab)
    expect(document.querySelector('.main')!.classList.contains('panel-closed')).toBe(false)
  })
})

describe('30초 체험', () => {
  const head = (yawDeg: number): FaceLandmarkerResult => {
    const th = (-yawDeg * Math.PI) / 180
    const c = Math.cos(th)
    const s = Math.sin(th)
    const res = lookingAt(300, 300)
    res.facialTransformationMatrixes = [{ rows: 4, columns: 4, data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1] }]
    return res
  }
  const card = () => screen.getByRole('region', { name: 'Volti 체험 안내' })
  const firstVisit = async () => {
    localStorage.removeItem(TOUR_KEY)
    render(<App />)
    return screen.findByRole('dialog', { name: /직접 넘겨 볼까요/ })
  }

  it('처음 열면 체험 안내 · 건너뛰면 다시 안 나옴 · 설정에서 다시 시작', async () => {
    await firstVisit()
    expect(screen.getByText(/직접 녹화한 나만의 동작/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }))
    expect(screen.queryByRole('dialog', { name: /직접 넘겨 볼까요/ })).toBeNull()
    cleanup()
    render(<App />)
    await screen.findByRole('button', { name: '샘플 연습곡 열기' })
    expect(screen.queryByRole('dialog', { name: /직접 넘겨 볼까요/ })).toBeNull()
    // 설정에서 다시
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '체험하기' })))
    await screen.findByText('1 / 6') // 샘플 악보가 열림
    expect(within(card()).getByText('카메라를 켜 주세요')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Volti 체험 안내' })).toBeNull()
  })

  it('카메라 → 기준 → 고개 돌려 두 번 넘기기 → 끝 (원래 모드로 돌아감)', async () => {
    await firstVisit()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '체험 시작' })))
    await screen.findByText('1 / 6')
    expect(screen.getByRole('tab', { name: '고개' }).getAttribute('aria-selected')).toBe('true')
    await act(async () => fireEvent.click(within(card()).getByRole('button', { name: '카메라 켜기' })))

    // 얼굴이 보이면 기준 잡기 → 2.5초 뒤 넘겨 보기
    feed(head(0), 300)
    expect(within(card()).getByText('편하게 화면을 바라보세요')).toBeTruthy()
    feed(head(0), 2600)
    expect(card().textContent).toMatch(/고개를 오른쪽으로 돌리고잠깐 멈추세요/)

    feed(head(25), 800)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(within(card()).getByText(/한 번 더/)).toBeTruthy()
    // 돌린 채로 있으면 한 번만
    feed(head(25), 2500)
    expect(screen.getByText('2 / 6')).toBeTruthy()
    feed(head(0), 1500)
    feed(head(25), 800)
    expect(screen.getByText('3 / 6')).toBeTruthy()
    expect(within(card()).getByText(/준비 끝/)).toBeTruthy()

    // 끝 카드에서 나만의 동작 안내 → 「내 동작」 탭으로
    expect(card().textContent).toMatch(/나만의 동작 만들기/)
    fireEvent.click(within(card()).getByRole('button', { name: '나만의 동작 만들기' }))
    expect(screen.queryByRole('region', { name: 'Volti 체험 안내' })).toBeNull()
    expect(screen.getByRole('tab', { name: '내 동작' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('status').textContent).toMatch(/동작 녹화/)
    expect(localStorage.getItem(TOUR_KEY)).toBe('1')
  })

  it('반대쪽으로 돌려도 받아 주고, 그쪽을 「다음」으로 정함 · 체험이 끝나면 원래 모드로', async () => {
    localStorage.removeItem(TOUR_KEY)
    localStorage.setItem('pageturn-gesture-lab/settings/v1', JSON.stringify({ mode: 'wink' }))
    render(<App />)
    await screen.findByRole('dialog', { name: /직접 넘겨 볼까요/ })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '체험 시작' })))
    await screen.findByText('1 / 6')
    expect(screen.getByRole('tab', { name: '고개' }).getAttribute('aria-selected')).toBe('true')
    await act(async () => fireEvent.click(within(card()).getByRole('button', { name: '카메라 켜기' })))
    feed(head(0), 3000)
    feed(head(-25), 800) // 왼쪽으로
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(within(card()).getByText(/왼쪽으로 돌리는 걸 「다음」으로 정했어요/)).toBeTruthy()
    feed(head(0), 1500)
    feed(head(-25), 800)
    expect(screen.getByText('3 / 6')).toBeTruthy()
    fireEvent.click(within(card()).getByRole('button', { name: '샘플로 더 연습' }))
    expect(screen.getByRole('tab', { name: '윙크' }).getAttribute('aria-selected')).toBe('true')
    const saved = JSON.parse(localStorage.getItem('pageturn-gesture-lab/settings/v1')!)
    expect(saved.modes.head.direction).toBe(-1)
  })

  it('카메라 없이 둘러보기: 손으로 넘기면 끝 · 내 악보 추가하기는 라이브러리로', async () => {
    await firstVisit()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '체험 시작' })))
    await screen.findByText('1 / 6')
    fireEvent.click(within(card()).getByRole('button', { name: '카메라 없이 둘러보기' }))
    expect(within(card()).getByRole('img', { name: /고개를 돌린 채/ })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 6')).toBeTruthy()
    expect(within(card()).getByText(/이렇게 넘겨요/)).toBeTruthy()
    fireEvent.click(within(card()).getByRole('button', { name: '내 악보 추가하기' }))
    expect(screen.getByRole('region', { name: '내 악보 라이브러리' })).toBeTruthy()
  })
})

describe('계정 · 백업', () => {
  const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  /** Google 로그인이 설정된 서버 + 로그인 안 한 상태 */
  const signedOutServer = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/config')) return jsonRes({ google: true, devLogin: false })
    if (url.endsWith('/api/me')) return jsonRes({ user: null })
    return jsonRes({ error: 'not_found', message: '' }, 404)
  }

  it('서버가 없으면 계정 탭 · 백업 안내를 숨김 (정책 링크는 라이브러리 아래에 항상)', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '샘플 연습곡 열기' })
    const lib = screen.getByRole('region', { name: '내 악보 라이브러리' })
    expect(within(lib).getByRole('link', { name: '개인정보처리방침' }).getAttribute('href')).toBe('/privacy.html')
    expect(screen.getByText(/이 브라우저에 저장돼요/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '로그인하고 계정에 백업하기' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.queryByRole('button', { name: '계정' })).toBeNull()
  })

  it('로그인 안 했으면 라이브러리에 백업 안내 → 누르면 설정 › 계정에서 Google 로그인', async () => {
    vi.stubGlobal('fetch', signedOutServer)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '로그인하고 계정에 백업하기' }))
    expect(screen.getByRole('button', { name: '계정' }).className).toContain('on')
    expect(screen.getByText('악보를 계정에 백업하세요')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Google 계정으로 로그인' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '테스트 계정으로 로그인' })).toBeNull() // 개발용은 내 컴퓨터에서만
  })

  it('로그인 안 했으면 「악보 추가」 전에 권유 창 → 이 기기에만 저장 · 다시 묻지 않기', async () => {
    vi.stubGlobal('fetch', signedOutServer)
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)
    await screen.findByRole('button', { name: '로그인하고 계정에 백업하기' })
    fireEvent.click(screen.getByRole('button', { name: '악보 추가' }))
    const dlg = screen.getByRole('dialog', { name: '악보를 계정에 백업할까요?' })
    expect(within(dlg).getByRole('button', { name: 'Google 계정으로 로그인' })).toBeTruthy()
    expect(within(dlg).getByRole('link', { name: '개인정보처리방침' }).getAttribute('href')).toBe('/privacy.html')
    expect(within(dlg).getByRole('link', { name: '이용약관' }).getAttribute('href')).toBe('/terms.html')
    expect(pick).not.toHaveBeenCalled() // 아직 파일 고르기 창을 열지 않음

    // 닫기(Esc)는 아무것도 안 함
    fireEvent.keyDown(within(dlg).getByRole('button', { name: 'Google 계정으로 로그인' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '악보를 계정에 백업할까요?' })).toBeNull()
    expect(pick).not.toHaveBeenCalled()

    // 다시 → 「다시 묻지 않기」 + 이 기기에만 → 파일 고르기 창
    fireEvent.click(screen.getByRole('button', { name: '악보 추가' }))
    const dlg2 = screen.getByRole('dialog', { name: '악보를 계정에 백업할까요?' })
    fireEvent.click(within(dlg2).getByRole('checkbox', { name: '다시 묻지 않기' }))
    fireEvent.click(within(dlg2).getByRole('button', { name: '로그인 없이 이 기기에만 저장' }))
    expect(screen.queryByRole('dialog', { name: '악보를 계정에 백업할까요?' })).toBeNull()
    expect(pick).toHaveBeenCalledTimes(1)

    // 이제는 묻지 않고 바로
    fireEvent.click(screen.getByRole('button', { name: '악보 추가' }))
    expect(screen.queryByRole('dialog', { name: '악보를 계정에 백업할까요?' })).toBeNull()
    expect(pick).toHaveBeenCalledTimes(2)
    pick.mockRestore()
  })

  it('로그인 안 하고 내 악보를 넣으면 라이브러리에 경고 띠 (샘플만 있을 땐 없음)', async () => {
    vi.stubGlobal('fetch', signedOutServer)
    render(<App />)
    await screen.findByRole('button', { name: '로그인하고 계정에 백업하기' })
    expect(screen.queryByRole('note')).toBeNull() // 샘플만 있음
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], '월광.pdf', { type: 'application/pdf' })] } })
    })
    await screen.findByText('1 / 6')
    fireEvent.click(screen.getByRole('button', { name: '라이브러리' }))
    const warn = await screen.findByRole('note')
    expect(warn.textContent).toContain('악보 1개가 이 브라우저에만 있어요')
    expect(within(warn).getByRole('button', { name: '로그인해서 백업' })).toBeTruthy()
  })

  it('서버가 없으면 권유 창 없이 바로 파일 고르기', async () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)
    await screen.findByRole('button', { name: '샘플 연습곡 열기' })
    fireEvent.click(screen.getByRole('button', { name: '악보 추가' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pick).toHaveBeenCalledTimes(1)
    pick.mockRestore()
  })

  it('권유 창에서 로그인하고 돌아오면 알림의 「악보 추가」로 바로 이어서', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/config')) return jsonRes({ google: true, devLogin: false })
      if (url.endsWith('/api/me')) return jsonRes({ user: { id: 'u1', email: 'a@b.c', name: '연주자', picture: null } })
      return jsonRes({ error: 'offline_test', message: '' }, 503)
    })
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    window.history.replaceState(null, '', '/?next=add&login=ok')
    render(<App />)
    await screen.findByText(/이제 넣는 악보는 계정에 백업돼요/)
    expect(window.location.search).toBe('')
    const toast = screen.getByText(/이제 넣는 악보는 계정에 백업돼요/).closest('.toast') as HTMLElement
    fireEvent.click(within(toast).getByRole('button', { name: '악보 추가' }))
    expect(pick).toHaveBeenCalledTimes(1)
    pick.mockRestore()
  })

  it('Google 로그인에서 실패하고 돌아오면 알림 · 주소의 ?login= 은 지움', async () => {
    vi.stubGlobal('fetch', signedOutServer)
    window.history.replaceState(null, '', '/?login=error')
    render(<App />)
    await screen.findByText(/Google 로그인을 마치지 못했어요/)
    expect(window.location.search).toBe('')
  })
})
