/**
 * 무료 한도 지키기 — 요금이 절대 나가지 않게 서버가 스스로 세고, 한도 전에 멈춤.
 *
 * - Workers · D1: 무료 플랜이면 한도를 넘어도 요금 없이 그날 잠깐 멈추기만 해서 따로 지킬 필요 없음
 * - R2(파일 저장소): 무료 한도를 넘으면 등록된 카드로 바로 청구되고, Cloudflare 에 「여기서 멈춤」 설정이 없음
 *   → 여기서 직접 셈
 *
 * R2 무료 (매달): 저장 10GB, 쓰기(Class A: 올리기 · 목록) 100만 번, 읽기(Class B: 받기 · 확인) 1000만 번
 * 청구 기간은 달력의 달과 어긋날 수 있어서(예: 15일 ~ 다음 달 14일), 달마다 무료 한도의 절반보다 아래에서 멈춤
 * → 어느 청구 기간이든 걸쳐 있는 두 달을 합쳐도 무료 한도 안
 */
import type { Env } from './env'
import { HttpError } from './http'
import { MB } from './limits'

export const FREE = {
  /** 모든 사용자 악보 파일 합 — 10GB 중 9GB (썸네일 · 올리다 만 파일 몫으로 1GB 여유) */
  storageBytes: 9_000_000_000,
  /** 한 달(UTC 달력) 쓰기 횟수 — 무료 100만 번의 45% */
  classAPerMonth: 450_000,
  /** 한 달(UTC 달력) 읽기 횟수 — 무료 1000만 번의 45% */
  classBPerMonth: 4_500_000,
}

const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7)

export async function opsThisMonth(env: Env): Promise<{ a: number; b: number }> {
  const row = await env.DB.prepare('SELECT class_a, class_b FROM r2_usage WHERE month = ?').bind(monthKey()).first<{ class_a: number; class_b: number }>()
  return { a: row?.class_a ?? 0, b: row?.class_b ?? 0 }
}

/**
 * R2 작업 횟수를 쓰기 전에 확인하고 셈. 한도를 넘게 되면 HttpError (status: 올리기 쪽은 413 → 화면이 「이 기기에만」으로 건너뜀).
 * force = 지우기처럼 저장 공간을 줄이는 일은 막지 않고 세기만 함
 */
export async function spendOps(env: Env, ops: { a?: number; b?: number }, opts: { status?: number; force?: boolean } = {}): Promise<void> {
  const a = ops.a ?? 0
  const b = ops.b ?? 0
  if (!a && !b) return
  if (!opts.force) {
    const used = await opsThisMonth(env)
    if (used.a + a > FREE.classAPerMonth || used.b + b > FREE.classBPerMonth) {
      throw new HttpError(
        opts.status ?? 503,
        opts.status === 413 ? 'server_full' : 'free_limit',
        '이번 달 서버 무료 사용량을 다 써서 다음 달까지 잠시 멈춰요. 이 기기에 있는 악보는 그대로 쓸 수 있어요.',
      )
    }
  }
  await env.DB.prepare(
    `INSERT INTO r2_usage (month, class_a, class_b) VALUES (?1, ?2, ?3)
     ON CONFLICT(month) DO UPDATE SET class_a = class_a + ?2, class_b = class_b + ?3`,
  )
    .bind(monthKey(), a, b)
    .run()
}

/** 모든 사용자의 악보 파일 합 (지운 것 제외) */
export async function storageUsed(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM scores WHERE deleted = 0').first<{ used: number }>()
  return row?.used ?? 0
}

/** 이만큼 더 올려도 서버 전체 무료 공간 안인지 (아니면 413 → 화면이 「이 기기에만」으로 건너뜀) */
export async function assertStorage(env: Env, extraBytes: number): Promise<void> {
  if ((await storageUsed(env)) + extraBytes > FREE.storageBytes) {
    throw new HttpError(413, 'server_full', '서버 전체 무료 공간이 가득 차서 지금은 올릴 수 없어요. 이 기기에는 그대로 저장돼요.')
  }
}

/** 지금 올리기를 받을 수 있는지 (목록에 같이 알려 줘서, 화면이 큰 파일을 보냈다가 거절당하지 않게) */
export async function uploadsPaused(env: Env): Promise<boolean> {
  const [used, ops] = await Promise.all([storageUsed(env), opsThisMonth(env)])
  return used >= FREE.storageBytes - MB || ops.a >= FREE.classAPerMonth - 10 || ops.b >= FREE.classBPerMonth - 1000
}
