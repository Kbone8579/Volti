/**
 * 서버 한도 — 서버(routes/scores.ts)와 화면(동기화)이 같이 씀.
 * 화면은 올리기 전에 미리 확인해서, 어차피 거절될 큰 파일을 보내느라 데이터를 쓰지 않게 해요.
 * (실행 코드가 상수뿐이라 화면에서 가져와도 안전)
 */
export const MB = 1024 * 1024
/** 악보 하나의 파일 수 (이미지 여러 장을 한 악보로 묶을 때) */
export const MAX_FILES = 300
/** 파일 하나 크기 — Workers 요청 한 번 한도(100MB) 아래 */
export const MAX_FILE_BYTES = 95 * MB
export const MAX_THUMB_BYTES = 2 * MB
