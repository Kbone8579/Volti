/**
 * 카메라 — 웹캠 + 얼굴 인식(MediaPipe), 얼굴 → 신호(고개 각도·입·윙크·표정) 변환, 카메라 패널 화면
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/camera`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './camera.css'

export { type CalibStep, CameraPanel } from './components/CameraPanel'
export { type ChartPoint } from './components/SignalChart'
export { type TrackerFrame, type TrackerStatus, useFaceTracker } from './hooks/useFaceTracker'
export { extractSignals, type FaceSignals, modeValue } from './lib/signals'
