/**
 * 설정 — 저장되는 설정 값(모드·임계값·보기 등), 설정 서랍 화면, 테스트 기록
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/settings`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './settings.css'

export { type DrawerTab, SettingsDrawer } from './components/SettingsDrawer'
export { useSettings } from './hooks/useSettings'
export { DEFAULT_SETTINGS, formatValue, type GestureMode, MODE_META, roundToStep, type Settings } from './lib/settings'
export { buildReport, type LogEntry } from './lib/testLog'
