/**
 * 처음 쓰는 사람을 위한 「30초 체험」.
 * 샘플 악보를 열고 ① 카메라 켜기 → ② 정면 기준 잡기 → ③ 고개를 돌려 직접 두 번 넘겨 보기.
 * 카메라를 못 쓰면 동작 그림을 보고 탭·키보드로 넘겨 보는 「둘러보기」로.
 */
export type Tour =
  | { step: 'off' }
  | { step: 'welcome' }
  | { step: 'camera' }
  | { step: 'neutral'; failed: boolean }
  | { step: 'try'; turns: number; flipped: boolean }
  | { step: 'nocam'; from: number }
  | { step: 'done'; viaCamera: boolean }

export type TourStep = Tour['step']

export const TOUR_KEY = 'volti/tour-seen'
/** 체험 중 「넘겨 보기」 횟수 (두 번째는 정면으로 돌아왔다가 다시 하는 연습) */
export const TOUR_TURNS = 2

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return true // 저장이 막힌 환경에선 매번 띄우지 않음
  }
}
export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    // 무시
  }
}
