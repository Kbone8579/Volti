// 런타임에 필요한 정적 파일을 node_modules → public/ 으로 복사한다. (npm install / dev / build 때 자동 실행)
//  - MediaPipe WASM  → public/mediapipe/wasm   (CDN 없이 설치된 버전 그대로 사용)
//  - pdf.js 리소스   → public/pdfjs/{cmaps,standard_fonts,wasm,iccs}
//    (한글 제목 폰트, 스캔본에 많은 JBIG2/JPEG2000 이미지 해석에 필요)
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jobs = [
  ['node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm', /module_internal/],
  ['node_modules/pdfjs-dist/cmaps', 'public/pdfjs/cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'public/pdfjs/standard_fonts'],
  ['node_modules/pdfjs-dist/wasm', 'public/pdfjs/wasm'],
  ['node_modules/pdfjs-dist/iccs', 'public/pdfjs/iccs'],
]

// 세 번째 값: 복사하지 않을 파일 패턴 (MediaPipe의 ES 모듈용 변형은 쓰지 않음 → 13MB 절약)
for (const [from, to, exclude] of jobs) {
  const src = resolve(root, from)
  if (!existsSync(src)) {
    console.warn(`[copy-assets] 건너뜀 (없음): ${from}`)
    continue
  }
  const dest = resolve(root, to)
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, filter: (p) => !(exclude && exclude.test(p)) })
}
console.log('[copy-assets] 완료')
