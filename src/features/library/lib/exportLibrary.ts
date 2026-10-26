/**
 * 내 악보 내려받기 — 라이브러리의 원본 파일(PDF · 이미지 등)을 ZIP 하나로 묶음.
 * - 파일 하나짜리 악보: 「제목.pdf」
 * - 여러 파일(이미지 여러 장 등): 「제목/원래 파일 이름」 폴더
 * 윈도우 · 맥에서 못 쓰는 글자는 바꾸고, 이름이 겹치면 「(2)」를 붙임.
 */
import { makeZip, type ZipItem } from './zip'

export interface ExportScore {
  title: string
  files: File[]
  createdAt: number
}

const BAD = /[\\/:*?"<>|\u0000-\u001f]/g

/** 파일 · 폴더 이름으로 쓸 수 있게 */
export function safeName(raw: string, fallback = '악보'): string {
  const s = raw
    .replace(BAD, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // 윈도우는 끝의 점 · 공백을 못 씀
    .slice(0, 100)
    .trim()
  return s || fallback
}

const extOf = (name: string) => {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(name)
  return m ? m[0] : ''
}

/** 겹치지 않는 이름 (대소문자 무시) — 「이름 (2).pdf」 */
function unique(base: string, ext: string, used: Set<string>): string {
  let n = 1
  let candidate = base + ext
  while (used.has(candidate.toLowerCase())) candidate = `${base} (${++n})${ext}`
  used.add(candidate.toLowerCase())
  return candidate
}

/** ZIP 안의 경로 정하기 (순수 함수 — 테스트용으로 따로) */
export function exportPaths(scores: { title: string; fileNames: string[] }[]): string[][] {
  const used = new Set<string>()
  return scores.map((s) => {
    const title = safeName(s.title)
    if (s.fileNames.length === 1) {
      const ext = extOf(s.fileNames[0])
      const base = ext && title.toLowerCase().endsWith(ext.toLowerCase()) ? title.slice(0, -ext.length) || title : title
      return [unique(base, ext, used)]
    }
    const folder = unique(title, '', used)
    const inner = new Set<string>()
    return s.fileNames.map((n) => {
      const ext = extOf(n)
      const base = safeName(ext ? n.slice(0, -ext.length) : n, '페이지')
      return `${folder}/${unique(base, ext, inner)}`
    })
  })
}

export async function exportLibraryZip(scores: ExportScore[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const paths = exportPaths(scores.map((s) => ({ title: s.title, fileNames: s.files.map((f) => f.name) })))
  const items: ZipItem[] = scores.flatMap((s, i) =>
    s.files.map((f, j) => ({ path: paths[i][j], data: f, modified: f.lastModified || s.createdAt })),
  )
  return makeZip(items, onProgress)
}

/** 「Volti 악보 2026-10-26.zip」 */
export function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Volti 악보 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`
}

/** 브라우저에서 파일로 저장 (내려받기) */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 바로 지우면 일부 브라우저(사파리)가 받기 전에 끊길 수 있어 조금 뒤에
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
