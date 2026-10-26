/**
 * 시선 모드 — 눈 신호로 화면의 어디를 보는지 추정, 시선 보정(캘리브레이션), ▶ 칸 판정
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/gaze`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './gaze.css'

export { GazeCalibrationOverlay, GazeDot, type GazeCalibUi } from './components/GazeCalibrationOverlay'
export { GazeMap } from './components/GazeMap'
export { calibrationPoints, correctOffset, fitGaze, gazeFeatures, type GazeModel, type GazeSample, GazeSmoother, inNextZone, type Point, predictGaze, predictGazeRaw, type Rect, ZONE_FRACTION, type ZoneSize } from './lib/gaze'
