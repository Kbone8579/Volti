/**
 * 라이브러리 — 이 브라우저(IndexedDB)에 악보 파일을 보관하고 목록·검색·이름 바꾸기·삭제
 *
 * 이 파일이 이 기능의 「바깥 공개 목록」이에요. 다른 기능·App 은 여기서만 가져다 써요
 * (`@/features/library`). 기능 안쪽 파일끼리는 상대 경로로 바로 가져와요.
 */
import './library.css'

export { LibraryView } from './components/LibraryView'
export { useLibrary } from './hooks/useLibrary'
export { exportFileName, exportLibraryZip, saveBlob } from './lib/exportLibrary'
export {
  addScore,
  deleteScore,
  entryUpdatedAt,
  fileSignature,
  findBySignature,
  formatBytes,
  forgetDeleted,
  getEntry,
  getScoreFiles,
  type LibraryEntry,
  listDeleted,
  listScores,
  onLibraryChange,
  rekeyScore,
  relativeTime,
  requestPersistence,
  restoreScore,
  saveScore,
  storageUsage,
  updateScore,
} from './lib/libraryDb'
