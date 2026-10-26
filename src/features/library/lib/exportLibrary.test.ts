import { describe, expect, it } from 'vitest'
import { exportFileName, exportLibraryZip, exportPaths, safeName } from './exportLibrary'
import { crc32 } from './zip'

/** 만든 ZIP 을 다시 읽어서 (이름, 내용) 목록으로 — 중앙 목록 · 로컬 헤더 · CRC 까지 확인 */
async function readZip(blob: Blob): Promise<{ name: string; text: string; flags: number }[]> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(buf.buffer)
  const eocd = buf.length - 22
  expect(view.getUint32(eocd, true)).toBe(0x06054b50)
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const out = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50)
    const flags = view.getUint16(p + 8, true)
    const crc = view.getUint32(p + 16, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const local = view.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = buf.subarray(dataStart, dataStart + size)
    expect(crc32(data)).toBe(crc)
    out.push({ name, text: dec.decode(data), flags })
    p += 46 + nameLen
  }
  return out
}

const file = (name: string, text: string) => new File([text], name, { lastModified: Date.UTC(2026, 9, 26, 7, 30) })

describe('내 악보 내려받기', () => {
  it('파일 하나는 「제목.확장자」, 여러 장은 「제목/원래 이름」, 겹치면 (2)', () => {
    expect(
      exportPaths([
        { title: '월광 소나타', fileNames: ['moonlight.pdf'] },
        { title: '월광 소나타', fileNames: ['other.PDF'] },
        { title: '스캔 악보', fileNames: ['p1.jpg', 'p2.jpg', 'p2.jpg'] },
        { title: 'Hotel California', fileNames: ['hotel.gp5'] },
        { title: 'a/b:c*?', fileNames: ['x.png'] },
        { title: '이미 확장자.pdf', fileNames: ['x.pdf'] },
        { title: '   ', fileNames: ['x.pdf'] },
      ]),
    ).toEqual([
      ['월광 소나타.pdf'],
      ['월광 소나타 (2).PDF'],
      ['스캔 악보/p1.jpg', '스캔 악보/p2.jpg', '스캔 악보/p2 (2).jpg'],
      ['Hotel California.gp5'],
      ['a_b_c__.png'],
      ['이미 확장자.pdf'],
      ['악보.pdf'],
    ])
    expect(safeName('끝에 점...  ')).toBe('끝에 점')
    expect(exportFileName(new Date(2026, 9, 6))).toBe('Volti 악보 2026-10-06.zip')
  })

  it('ZIP 으로 묶으면 한글 이름 · 내용 · CRC 가 그대로', async () => {
    const zip = await exportLibraryZip([
      { title: '아리랑', files: [file('arirang.pdf', '%PDF-아리랑')], createdAt: 0 },
      { title: '스캔', files: [file('1.jpg', 'JPG-1'), file('2.jpg', 'JPG-2')], createdAt: 0 },
    ])
    expect(zip.type).toBe('application/zip')
    const entries = await readZip(zip)
    expect(entries.map((e) => [e.name, e.text])).toEqual([
      ['아리랑.pdf', '%PDF-아리랑'],
      ['스캔/1.jpg', 'JPG-1'],
      ['스캔/2.jpg', 'JPG-2'],
    ])
    expect(entries.every((e) => e.flags & 0x0800)).toBe(true) // UTF-8 이름 표시 (맥 · 윈도우에서 한글이 안 깨짐)
  })

  it('빈 목록도 올바른 빈 ZIP', async () => {
    expect(await readZip(await exportLibraryZip([]))).toEqual([])
  })
})
