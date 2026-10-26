/** Worker 가 받는 환경: wrangler.jsonc 의 바인딩과 변수 */
export interface Env {
  /** D1 데이터베이스: 계정 · 세션 · 악보 목록 · 설정 */
  DB: D1Database
  /** R2 저장소: 악보 파일 · 썸네일 */
  FILES: R2Bucket
  GOOGLE_CLIENT_ID?: string
  /** 한 사람 저장 용량 (MB) */
  USER_QUOTA_MB?: string
  /** 내 컴퓨터 개발용(.dev.vars): '1' 이면 Google 없이 테스트 로그인 허용. 배포에는 절대 넣지 않음 */
  DEV_LOGIN?: string
}
