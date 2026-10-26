/**
 * 30초 체험 — 처음 쓰는 사람용 안내 (환영 창 · 단계별 안내 카드 · 동작 그림)
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/tour`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './tour.css'

export { TourLayer } from './components/TourLayer'
export { markTourSeen, type Tour, TOUR_KEY, TOUR_TURNS, tourSeen } from './lib/tourState'
