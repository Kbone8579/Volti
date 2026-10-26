import { useCallback, useEffect, useRef, useState } from 'react'
import { createSampleFiles, makeThumbnailFromFile, SAMPLE_TITLE } from '@/features/score'
import { addScore, fileSignature, findBySignature, libraryAvailable, listScores, storageUsage, type LibraryEntry } from '../lib/libraryDb'

const SAMPLE_SEEDED_KEY = 'pageturn-gesture-lab/sample-seeded'

/** 샘플 악보를 라이브러리에 추가 (이미 있으면 그대로) */
async function addSampleToLibrary(): Promise<void> {
  const files = await createSampleFiles()
  if (await findBySignature(fileSignature(files))) return
  const thumb = await makeThumbnailFromFile(files[0])
  await addScore(files, { title: SAMPLE_TITLE, pageCount: files.length, thumb })
}

/**
 * 라이브러리 목록 상태.
 * - entries: 저장된 악보 목록 (null = 불러오는 중)
 * - usage: 쓰고 있는 저장 공간(바이트)
 * - available: 이 환경에서 보관함(IndexedDB)을 쓸 수 있는지 (시크릿 모드 등에선 false)
 * - refresh(): 저장소에서 목록을 다시 읽기
 * 처음 실행하면 샘플 악보를 한 번 넣어 둠 (사용자가 지우면 다시 넣지 않음).
 */
export function useLibrary() {
  const [available, setAvailable] = useState(libraryAvailable)
  const [entries, setEntries] = useState<LibraryEntry[] | null>(() => (libraryAvailable() ? null : []))
  const [usage, setUsage] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    if (!libraryAvailable()) return
    try {
      setEntries(await listScores())
      setUsage(await storageUsage())
    } catch (err) {
      console.error(err)
      setAvailable(false)
      setEntries([])
    }
  }, [])

  const seedOnce = useRef(false)
  useEffect(() => {
    if (seedOnce.current) return
    seedOnce.current = true
    ;(async () => {
      if (libraryAvailable()) {
        let seeded = false
        try {
          seeded = localStorage.getItem(SAMPLE_SEEDED_KEY) === '1'
        } catch {
          seeded = true // 저장이 막힌 환경에선 매번 넣지 않도록
        }
        if (!seeded) {
          try {
            if ((await listScores()).length === 0) await addSampleToLibrary()
            localStorage.setItem(SAMPLE_SEEDED_KEY, '1')
          } catch (err) {
            console.error(err)
          }
        }
      }
      refresh()
    })()
  }, [refresh])

  return { available, entries, setEntries, usage, refresh }
}
