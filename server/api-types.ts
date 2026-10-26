/**
 * 서버 API 가 주고받는 데이터 모양 — 서버(server/)와 화면(src/) 이 같이 씀.
 * 런타임 코드 없이 타입만 둬서 양쪽 어디서 가져와도 안전해요.
 */

export interface ApiUser {
  id: string
  email: string
  name: string
  picture: string | null
}

export interface ApiConfig {
  /** Google 로그인이 켜져 있는지 (서버에 OAuth 클라이언트 ID 가 설정됨) */
  google: boolean
  /** 내 컴퓨터에서 개발할 때만: Google 없이 테스트 계정으로 로그인 */
  devLogin: boolean
}

export type ApiZoom = number | 'width' | null

/** 서버에 저장된 악보 한 개 (파일 내용은 따로 받음) */
export interface ApiScore {
  id: string
  title: string
  signature: string
  fileNames: string[]
  fileTypes: string[]
  /** 원본 파일 크기 합 (byte) */
  size: number
  pageCount: number
  createdAt: number
  openedAt: number
  lastPage: number
  zoom: ApiZoom
  hasThumb: boolean
  /** 마지막으로 바뀐 시각 — 기기끼리 다를 때 더 나중 것을 씀 */
  updatedAt: number
  /** 지운 악보 (다른 기기에서도 지우도록 기록만 남김) */
  deleted: boolean
}

/** 악보 정보 올리기 (파일은 먼저 올려 둔 상태여야 함) */
export type ApiScoreInput = Omit<ApiScore, 'id' | 'deleted' | 'hasThumb'> & { hasThumb?: boolean }

export interface ApiScoreList {
  scores: ApiScore[]
  /** 서버에 올린 파일 용량 (byte) */
  usage: number
  quota: number
  /** 서버 무료 한도에 닿아서 지금은 올리기를 받지 않음 (받기 · 지우기는 됨) */
  uploadsPaused: boolean
}

export interface ApiSettings {
  data: Record<string, unknown> | null
  updatedAt: number
}

export interface ApiError {
  error: string
  message: string
}
