/**
 * 제스처 판정 — 신호 값이 기준을 넘고 잠깐 유지되면 「다음/이전」을 내는 판정기와 캘리브레이션 계산
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/gestures`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
export { calibrateGesture, median, MIN_SAMPLES } from './lib/calibration'
export { type DetectorPhase, type DetectorUpdate, GestureDetector, type GestureEvent } from './lib/gestureDetector'
