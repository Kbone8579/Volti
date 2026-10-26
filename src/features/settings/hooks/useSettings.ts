import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadSettings, saveSettings, type GestureMode, type ModeConfig, type Settings } from '../lib/settings'

/**
 * 앱 설정 상태. 바뀔 때마다 이 브라우저(localStorage)에 저장되고, 다음에 열 때 그대로 불러옴.
 * - settingsRef: 카메라 프레임 처리처럼 매 프레임 도는 코드에서 최신 설정을 읽을 때 씀 (다시 그리기 없이)
 * - update({ ... }): 일부만 바꾸기
 * - applyMode('head', { threshold }): 제스처 모드 하나의 판정 기준만 바꾸기
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const settingsRef = useRef(settings)
  useLayoutEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => saveSettings(settings), [settings])

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  const applyMode = useCallback((mode: GestureMode, patch: Partial<ModeConfig>) => {
    setSettings((s) => ({ ...s, modes: { ...s.modes, [mode]: { ...s.modes[mode], ...patch } } }))
  }, [])
  return { settings, settingsRef, update, applyMode }
}
