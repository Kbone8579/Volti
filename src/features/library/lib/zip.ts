/**
 * 아주 작은 ZIP 만들기 (압축 없이 묶기만 — PDF · JPG 는 이미 압축돼 있어서 다시 압축해도 거의 안 줄어듦).
 * 한글 파일 이름이 깨지지 않게 UTF-8 표시를 켬. 외부 라이브러리 없이 브라우저 · Node 에서 같이 동작.
 * 한도: 파일 6만 5천 개 · 전체 4GB 미만 (ZIP64 는 쓰지 않음)
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array, prev = 0): number {
  let c = (prev ^ 0xffffffff) >>> 0
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipItem {
  /** ZIP 안의 경로 ("월광/1악장.pdf") */
  path: string
  data: Blob
  /** 파일 시각 (ms) */
  modified?: number
}

const MAX_BYTES = 0xffffffff
const MAX_ENTRIES = 0xffff

/** ZIP 안 시각 형식 (DOS) — 1980년 이전은 1980-01-01 로 */
function dosTime(ms: number): { time: number; date: number } {
  const d = new Date(ms)
  const year = d.getFullYear()
  if (!Number.isFinite(year) || year < 1980) return { time: 0, date: (0 << 9) | (1 << 5) | 1 }
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.min(year, 2107) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export class ZipTooLargeError extends Error {}

/** 파일들을 ZIP 하나로. onProgress(끝난 수, 전체) */
export async function makeZip(items: ZipItem[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  if (items.length > MAX_ENTRIES) throw new ZipTooLargeError('파일이 너무 많아요.')
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const name = enc.encode(item.path)
    const bytes = new Uint8Array(await item.data.arrayBuffer())
    const crc = crc32(bytes)
    const size = bytes.length
    const { time, date } = dosTime(item.modified ?? Date.now())
    if (offset + 30 + name.length + size > MAX_BYTES) throw new ZipTooLargeError('한 번에 묶기엔 너무 커요 (4GB).')

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // 풀 때 필요한 버전 2.0
    local.setUint16(6, 0x0800, true) // 이름이 UTF-8
    local.setUint16(8, 0, true) // 압축 없음
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(local.buffer, name, item.data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, time, true)
    cd.setUint16(14, date, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, size, true)
    cd.setUint32(24, size, true)
    cd.setUint16(28, name.length, true)
    // 30~41: 추가 필드 · 설명 · 디스크 · 속성 = 0
    cd.setUint32(42, offset, true)
    const entry = new Uint8Array(46 + name.length)
    entry.set(new Uint8Array(cd.buffer), 0)
    entry.set(name, 46)
    central.push(entry)

    offset += 30 + name.length + size
    onProgress?.(i + 1, items.length)
  }

  const cdSize = central.reduce((a, c) => a + c.length, 0)
  if (offset + cdSize + 22 > MAX_BYTES) throw new ZipTooLargeError('한 번에 묶기엔 너무 커요 (4GB).')
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, items.length, true)
  end.setUint16(10, items.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  parts.push(...central, end.buffer)
  return new Blob(parts, { type: 'application/zip' })
}
