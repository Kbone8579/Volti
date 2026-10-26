/**
 * DB 표 만들기 — 처음 요청이 올 때 한 번 (이미 있으면 그대로).
 * 따로 「마이그레이션」 명령을 돌리지 않아도 배포하자마자 동작하도록.
 * 표를 바꿀 일이 생기면 ALTER 문을 아래 STATEMENTS 끝에 추가 (IF NOT EXISTS 처럼 여러 번 돌아도 안전하게).
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    picture TEXT,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS scores (
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    signature TEXT NOT NULL,
    file_names TEXT NOT NULL,
    file_types TEXT NOT NULL,
    size INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    opened_at INTEGER NOT NULL,
    last_page INTEGER NOT NULL DEFAULT 0,
    zoom TEXT,
    has_thumb INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  // 무료 한도 지키기용: 달마다 R2 쓰기(A) · 읽기(B) 횟수 (freeGuard.ts)
  `CREATE TABLE IF NOT EXISTS r2_usage (
    month TEXT PRIMARY KEY,
    class_a INTEGER NOT NULL DEFAULT 0,
    class_b INTEGER NOT NULL DEFAULT 0
  )`,
]

let ready: Promise<void> | null = null

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db
    .batch(STATEMENTS.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      ready = null
      throw err
    })
  return ready
}
