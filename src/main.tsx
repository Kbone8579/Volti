// 앱 시작점: 전역 스타일(색 변수 → 기본 → 뼈대 순서)을 먼저 불러온 뒤 App 을 그림.
// 각 기능의 스타일은 그 기능의 index.ts 가 불러와요 (전역 스타일 다음에 붙어서 덮어쓸 수 있게).
import './app/styles/tokens.css'
import './app/styles/base.css'
import './app/styles/layout.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
