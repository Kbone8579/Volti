/**
 * 내 동작 — 직접 녹화한 동작을 학습해서 판별 (평소 자세 vs 녹화한 동작)
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/custom-gesture`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './custom-gesture.css'

export { RecordingBanner, type RecordingUi } from './components/RecordingBanner'
export { blendVector, customFeatures, type CustomModel, customValue, MIN_NEUTRAL, rebaseCustom, trainCustom, withGesture } from './lib/customGesture'
