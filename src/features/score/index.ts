/**
 * 악보 — 파일(PDF·이미지) 읽기, 페이지 표시, 넘기기(한 쪽/펼치기), 확대·축소, 넘기기 전 대기
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/score`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './score.css'

export { PendingBadge } from './components/PendingBadge'
export { type FlashKind, NEXT_TARGET_INSET, ScoreViewer, type ViewerHandle, type ViewInfo } from './components/ScoreViewer'
export { ZoomControl } from './components/ZoomControl'
export { maxStart, type NavState, nextIndex, normalizeIndex, pageLabel, prevIndex, visibleIndices } from './lib/navigation'
export { ACCEPT, createSampleFiles, createSampleScore, isSampleFiles, type LoadedScore, loadScoreFiles, makeThumbnail, makeThumbnailFromFile, SAMPLE_TITLE } from './lib/scoreFiles'
export { type PendingTurn, type TurnKind, TurnScheduler } from './lib/turnScheduler'
export { nextStep, type Zoom } from './lib/zoom'
