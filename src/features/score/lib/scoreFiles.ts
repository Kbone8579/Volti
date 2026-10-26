/**
 * 악보 파일 불러오기 + PDF 페이지 렌더링.
 * - PDF: 페이지마다 하나씩 (pdf.js)
 * - 이미지: JPG/PNG/WEBP/GIF/BMP/AVIF 는 모든 브라우저, HEIC/TIFF 는 Safari에서만
 * - 여러 파일을 고르면 파일 이름 순(숫자 인식: 2 < 10)으로 이어 붙여 한 악보로 만듦
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const PDF_ASSETS = `${import.meta.env.BASE_URL}pdfjs/`

export const ACCEPT =
  '.pdf,application/pdf,image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff'

export type PageSource = { kind: 'image'; url: string } | { kind: 'pdf'; doc: PDFDocumentProxy; pageNumber: number }

export interface ScorePage {
  id: string
  label: string
  source: PageSource
}

export interface LoadedScore {
  title: string
  pages: ScorePage[]
  warnings: string[]
  /** 실제로 열린 원본 파일 (라이브러리에 저장할 것). 샘플 악보는 빈 배열 */
  sources: File[]
  dispose: () => void
}

let seq = 0
const uid = () => `p${++seq}`

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(f.name)
const stripExt = (name: string) => name.replace(/\.[^.]+$/, '')

export function sortFiles(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

async function decodable(url: string): Promise<boolean> {
  const img = new Image()
  img.src = url
  try {
    await img.decode()
    return img.naturalWidth > 0
  } catch {
    return false
  }
}

export async function loadScoreFiles(input: File[]): Promise<LoadedScore> {
  const files = sortFiles(input)
  const pages: ScorePage[] = []
  const warnings: string[] = []
  const urls: string[] = []
  const docs: PDFDocumentProxy[] = []
  const opened: string[] = [] // 실제로 열린 파일 이름 (제목용)
  const sources: File[] = []

  for (const file of files) {
    if (isPdf(file)) {
      try {
        const data = new Uint8Array(await file.arrayBuffer())
        const doc = await pdfjs.getDocument({
          data,
          cMapUrl: `${PDF_ASSETS}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDF_ASSETS}standard_fonts/`,
          wasmUrl: `${PDF_ASSETS}wasm/`,
          iccUrl: `${PDF_ASSETS}iccs/`,
        }).promise
        docs.push(doc)
        opened.push(file.name)
        sources.push(file)
        for (let n = 1; n <= doc.numPages; n++) {
          pages.push({ id: uid(), label: `${stripExt(file.name)} · ${n}쪽`, source: { kind: 'pdf', doc, pageNumber: n } })
        }
      } catch (err) {
        const name = (err as { name?: string })?.name
        warnings.push(
          name === 'PasswordException'
            ? `${file.name}: 암호가 걸린 PDF는 아직 열 수 없어요.`
            : `${file.name}: PDF를 읽지 못했어요.`,
        )
      }
    } else if (isImage(file)) {
      const url = URL.createObjectURL(file)
      if (await decodable(url)) {
        urls.push(url)
        opened.push(file.name)
        sources.push(file)
        pages.push({ id: uid(), label: stripExt(file.name), source: { kind: 'image', url } })
      } else {
        URL.revokeObjectURL(url)
        const special = /\.(heic|heif)$/i.test(file.name)
          ? 'HEIC 사진은 Safari에서만 열려요. JPG로 바꿔서 올려 주세요.'
          : /\.tiff?$/i.test(file.name)
            ? 'TIFF는 Safari에서만 열려요. PDF나 PNG로 바꿔서 올려 주세요.'
            : '이미지를 읽지 못했어요.'
        warnings.push(`${file.name}: ${special}`)
      }
    } else {
      warnings.push(`${file.name}: 지원하지 않는 형식이에요. (PDF, JPG, PNG 등)`)
    }
  }

  const title =
    opened.length === 0 ? '' : opened.length === 1 ? stripExt(opened[0]) : `${stripExt(opened[0])} 외 ${opened.length - 1}개`

  return {
    title,
    pages,
    warnings,
    sources,
    dispose: () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      for (const doc of docs) {
        forgetDoc(doc)
        doc.loadingTask.destroy().catch(() => {})
      }
    },
  }
}

/* ───────────── PDF 페이지 → 이미지 URL (캐시 + 미리 렌더) ───────────── */

const MAX_RENDER_PX = 4000
const MAX_RENDER_AREA = 14_000_000 // 약 14MP (태블릿 메모리 보호)
const CACHE_LIMIT = 30
const pageProxyCache = new Map<string, Promise<PDFPageProxy>>()
const renderCache = new Map<string, Promise<string>>() // 삽입 순서 = LRU
const docKeys = new WeakMap<PDFDocumentProxy, Set<string>>()
/** 페이지별 마지막으로 완성된 이미지 URL — 넘길 때 깜빡임 없이 즉시 표시용 */
const lastUrl = new Map<string, string>()

/** 바로 보여줄 수 있는 URL이 있으면 동기적으로 돌려줌 */
export function peekPageUrl(page: ScorePage): string | null {
  return page.source.kind === 'image' ? page.source.url : (lastUrl.get(page.id) ?? null)
}

function revoke(p: Promise<string>) {
  p.then((u) => {
    for (const [id, v] of lastUrl) if (v === u) lastUrl.delete(id)
    URL.revokeObjectURL(u)
  }).catch(() => {})
}

function track(doc: PDFDocumentProxy, key: string) {
  let set = docKeys.get(doc)
  if (!set) docKeys.set(doc, (set = new Set()))
  set.add(key)
}

function forgetDoc(doc: PDFDocumentProxy) {
  for (const key of docKeys.get(doc) ?? []) {
    const p = renderCache.get(key)
    if (p) revoke(p)
    renderCache.delete(key)
    pageProxyCache.delete(key)
  }
  docKeys.delete(doc)
}

function evict() {
  while (renderCache.size > CACHE_LIMIT) {
    const [oldest, p] = renderCache.entries().next().value as [string, Promise<string>]
    renderCache.delete(oldest)
    revoke(p)
  }
}

/**
 * 페이지를 화면 칸(slotW×slotH, 기기 픽셀) 크기에 맞춰 이미지 URL로 돌려줌.
 * 크기를 200px 단위로 묶어 캐시하므로 창 크기를 조금 바꿔도 다시 그리지 않음.
 */
export async function getPageUrl(page: ScorePage, slotW: number, slotH: number): Promise<string> {
  if (page.source.kind === 'image') return page.source.url
  const { doc, pageNumber } = page.source

  let proxyP = pageProxyCache.get(page.id)
  if (!proxyP) {
    proxyP = doc.getPage(pageNumber)
    pageProxyCache.set(page.id, proxyP)
    track(doc, page.id)
  }
  const proxy = await proxyP
  const base = proxy.getViewport({ scale: 1 })
  const fit = Math.min(slotW / base.width, slotH / base.height)
  const areaCap = Math.sqrt(MAX_RENDER_AREA / Math.max(0.1, base.width / base.height))
  const targetH = Math.min(MAX_RENDER_PX, areaCap, Math.max(400, Math.ceil((base.height * fit) / 200) * 200))
  const key = `${page.id}@${targetH}`

  const hit = renderCache.get(key)
  if (hit) {
    renderCache.delete(key)
    renderCache.set(key, hit)
    return hit
  }

  const job = (async () => {
    const viewport = proxy.getViewport({ scale: targetH / base.height })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await proxy.render({ canvas, viewport, background: '#ffffff' }).promise
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 실패'))), 'image/jpeg', 0.92),
    )
    canvas.width = canvas.height = 0
    const url = URL.createObjectURL(blob)
    lastUrl.set(page.id, url)
    return url
  })()
  renderCache.set(key, job)
  track(doc, key)
  job.catch(() => renderCache.delete(key))
  evict()
  return job
}

/* ───────────── 샘플 악보 (파일 없이 바로 테스트) ───────────── */

export const SAMPLE_TITLE = '샘플 연습곡'

/** 앱이 만든 샘플 악보 파일인지 (「샘플 연습곡 01.png」 …) — 이름을 바꿔도 파일 이름으로 알아봄 */
export const isSampleFiles = (fileNames: string[]): boolean =>
  fileNames.length > 0 && fileNames.every((n) => n.startsWith(`${SAMPLE_TITLE} `) && n.endsWith('.png'))

/** 샘플 악보 (파일 없이 바로 테스트) — 라이브러리에 넣지 않고 이번에만 보기 */
export async function createSampleScore(pageCount = 8): Promise<LoadedScore> {
  const files = await createSampleFiles(pageCount)
  const loaded = await loadScoreFiles(files)
  return { ...loaded, title: SAMPLE_TITLE, sources: [] }
}

/**
 * 샘플 악보를 PNG 파일들로 생성 ("샘플 연습곡 01.png" …).
 * 내용이 항상 같아서, 라이브러리에 이미 있는지 파일 서명으로 알아볼 수 있음.
 */
export async function createSampleFiles(pageCount = 8): Promise<File[]> {
  const files: File[] = []
  let rnd = 7
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647)

  for (let n = 1; n <= pageCount; n++) {
    const W = 1240
    const H = 1754
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)

    // 큰 페이지 번호 (넘어간 걸 멀리서도 확인)
    ctx.fillStyle = 'rgba(20, 30, 50, 0.07)'
    ctx.font = 'bold 700px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), W / 2, H / 2 + 40)

    ctx.fillStyle = '#1d2433'
    ctx.textBaseline = 'alphabetic'
    if (n === 1) {
      ctx.font = 'bold 54px Georgia, serif'
      ctx.fillText('샘플 연습곡', W / 2, 130)
      ctx.font = '28px Georgia, serif'
      ctx.fillText('페이지 넘김 테스트용', W / 2, 180)
    }

    const top = n === 1 ? 260 : 150
    const systems = n === 1 ? 9 : 10
    const gap = (H - top - 120) / systems
    ctx.strokeStyle = '#1d2433'
    for (let s = 0; s < systems; s++) {
      const y0 = top + s * gap
      ctx.lineWidth = 1.6
      for (let l = 0; l < 5; l++) {
        ctx.beginPath()
        ctx.moveTo(90, y0 + l * 14)
        ctx.lineTo(W - 90, y0 + l * 14)
        ctx.stroke()
      }
      ctx.lineWidth = 2.4
      for (const x of [90, W - 90, 90 + (W - 180) / 2]) {
        ctx.beginPath()
        ctx.moveTo(x, y0)
        ctx.lineTo(x, y0 + 56)
        ctx.stroke()
      }
      for (let k = 0; k < 14; k++) {
        const x = 150 + k * ((W - 260) / 14) + rand() * 12
        const y = y0 - 7 + Math.floor(rand() * 10) * 7
        ctx.beginPath()
        ctx.ellipse(x, y, 9, 6.5, -0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x + 8, y)
        ctx.lineTo(x + 8, y - 44)
        ctx.stroke()
      }
    }

    ctx.font = '26px Georgia, serif'
    ctx.textAlign = 'right'
    ctx.fillText(`— ${n} —`, W - 90, H - 50)

    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
    canvas.width = canvas.height = 0
    files.push(new File([blob], `${SAMPLE_TITLE} ${String(n).padStart(2, '0')}.png`, { type: 'image/png', lastModified: 0 }))
  }
  return files
}

/** 이미지 파일 하나로 썸네일 만들기 */
export async function makeThumbnailFromFile(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  try {
    return await makeThumbnail({ id: `thumb-${uid()}`, label: file.name, source: { kind: 'image', url } })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 라이브러리 카드용 작은 첫 페이지 이미지 (실패하면 null) */
export async function makeThumbnail(page: ScorePage, width = 240): Promise<Blob | null> {
  try {
    const url = await getPageUrl(page, width * 2, width * 2 * 1.5)
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = width / img.naturalWidth
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82))
  } catch {
    return null
  }
}
