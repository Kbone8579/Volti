/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { cloudflare } from '@cloudflare/vite-plugin'
import { fileURLToPath } from 'node:url'

// `npm run dev:https` → 같은 와이파이의 태블릿에서 https://<노트북IP>:5173 으로 접속해 테스트
// (카메라는 HTTPS 또는 localhost에서만 켜집니다)
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'https' ? [basicSsl()] : []),
    // 서버(server/index.ts)를 개발 서버 안에서 같이 실행 · 빌드 (테스트 때는 끔)
    ...(process.env.VITEST ? [] : [cloudflare()]),
  ],
  // @/ = src/, @server/ = server/ (tsconfig.json 의 paths 와 같게)
  resolve: {
    alias: {
      '@server': fileURLToPath(new URL('./server', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 화면 흐름 테스트는 가짜 카메라 프레임을 수백 장 흘려보내서 시간이 걸림
  test: { testTimeout: 30000 },
}))
