# Volti 폴더 구조 안내

이 문서는 **어떤 파일이 어디에 있고, 무슨 일을 하고, 새 코드를 어디에 넣으면 되는지**를 정리한 지도예요.
React 프로젝트에서 요즘 가장 많이 쓰는 **기능(feature) 단위 구조**로 정리돼 있어요.
화면(`src/`)과 서버(`server/`, Cloudflare Worker)가 한 프로젝트에 같이 있어요.

- 실행·사용법·배포는 [README.md](README.md)를 보세요.
- 이 문서는 코드를 고치거나 기능을 더할 때 보는 문서예요.

---

## 1. 한눈에 보기

```
volti/
├── README.md                 사용법 · 실행 · 배포 안내
├── STRUCTURE.md              ← 지금 이 문서 (폴더 구조 안내)
├── index.html                웹페이지 껍데기 (제목, 아이콘, 앱이 들어갈 #root)
├── package.json              의존성 · 명령어 (npm run dev / test / build / deploy)
├── vite.config.ts            Vite 설정 (React, Cloudflare 서버 같이 실행, https 모드, @/ · @server/ 별칭, 테스트 설정)
├── tsconfig.json             화면 코드 TypeScript 설정 (@/ · @server/ 별칭)
├── tsconfig.server.json      서버 코드 TypeScript 설정 (Workers 타입)
├── wrangler.jsonc            Cloudflare 설정: 서버 · DB(D1) · 파일 저장소(R2) · 로그인 클라이언트 ID
├── .dev.vars                 내 컴퓨터 개발용 설정 (개발용 로그인 켜기) — git · 배포에 안 올라감
├── scripts/
│   └── copy-assets.mjs       MediaPipe · pdf.js 리소스를 public/ 으로 복사 (npm install·dev·build 때 자동)
├── public/                   그대로 서비스되는 파일 (로고 · 아이콘 · 매니페스트 · 복사된 리소스)
│
├── server/                   ── 서버 (Cloudflare Worker): 로그인 · 악보/설정을 계정에 저장
│   ├── index.ts              시작점: /api/* 주소 → 처리 함수 연결
│   ├── api-types.ts          서버 ↔ 화면이 주고받는 데이터 모양 (양쪽이 같이 씀)
│   ├── env.ts · http.ts · schema.ts   환경 타입 · 응답/쿠키/CSRF 도구 · DB 표 만들기
│   ├── limits.ts             파일 크기 · 개수 한도 (화면도 올리기 전에 미리 확인)
│   ├── freeGuard.ts          무료 한도 지키기 (R2 공간 · 횟수를 세서 요금 나가기 전에 멈춤)
│   ├── auth/                 Google 토큰 확인 · 로그인 유지(세션)
│   └── routes/               auth(로그인) · scores(악보) · settings(설정)
│
└── src/
    ├── main.tsx              앱 시작점: 전역 스타일 → App 그리기
    │
    ├── app/                  ── 앱 껍데기: 화면 조립 · 기능 연결 · 전역 스타일
    │   ├── App.tsx           화면 전체 조립 + 카메라 → 제스처 → 넘김 흐름 연결
    │   ├── App.flow.test.tsx 앱 전체 흐름 테스트 (가짜 카메라로 클릭·제스처 → 화면 확인)
    │   ├── Toolbar.tsx       상단 바 (로고 · 라이브러리 · ◀ 쪽수 ▶ · 배치 · 확대 · 설정)
    │   ├── hooks/
    │   │   └── useShortcuts.ts   키보드 · 블루투스 페달 단축키
    │   └── styles/
    │       ├── tokens.css    색 · 크기 변수 (밝은/어두운 화면), 글꼴
    │       ├── base.css      기본 스타일 · 버튼 · 세그먼트 · 꼬리표 · 진행 막대 · 작은 유틸
    │       └── layout.css    뼈대: 툴바 · 본문(악보 + 패널) 그리드 · 패널 탭 · 화면 크기별 배치
    │
    ├── features/             ── 기능별 폴더 (화면 · 로직 · 스타일 · 테스트가 한 폴더에)
    │   ├── score/            악보 보기 · 넘기기 · 확대 · 넘기기 전 대기
    │   ├── library/          내 악보 보관함 (IndexedDB)
    │   ├── camera/           웹캠 + 얼굴 인식 + 카메라 패널
    │   ├── gestures/         제스처 판정기 · 캘리브레이션 계산 (모든 모드 공통)
    │   ├── gaze/             시선 모드
    │   ├── custom-gesture/   내 동작 (녹화해서 학습)
    │   ├── settings/         설정 값 · 설정 서랍 · 테스트 기록
    │   ├── tour/             30초 체험 (처음 쓰는 사람용 안내)
    │   ├── account/          Google 로그인 · 로그아웃 · 계정 탭 화면
    │   └── sync/             로그인하면 라이브러리 · 설정을 서버와 맞추기
    │
    └── shared/               ── 특정 기능에 속하지 않는 공용 조각
        ├── api/
        │   └── voltiApi.ts        서버(/api) 호출 모음 (account · sync 가 같이 씀)
        ├── hooks/
        │   ├── useElementSize.ts  요소 크기 따라가기
        │   └── useNotice.ts       아래쪽 알림(토스트) 상태
        └── ui/
            ├── Toast.tsx          아래쪽 알림 화면
            └── toast.css
```

모든 기능 폴더는 같은 모양이에요.

```
features/<기능>/
├── index.ts          바깥에 공개하는 목록 (다른 기능·App 은 여기서만 가져다 씀) + 이 기능의 CSS 불러오기
├── <기능>.css        이 기능 화면의 스타일
├── components/       React 화면 조각 (.tsx)
├── hooks/            React 훅 (useXxx.ts) — 상태를 들고 있는 로직
└── lib/              React 와 상관없는 순수 로직 (.ts) + 그 테스트 (*.test.ts)
```

필요 없는 칸은 만들지 않아요. 예를 들어 `gestures/` 는 화면이 없어서 `lib/` 만 있어요.

---

## 2. 정리 원칙 (왜 이렇게 나눴나)

### ① 종류가 아니라 **기능**으로 묶어요
예전에는 `components/`(화면 전부)와 `lib/`(로직 전부)로 나눠서, "확대 기능"을 고치려면 여러 폴더를 오가야 했어요.
지금은 확대에 관련된 화면(`ZoomControl.tsx`), 계산(`zoom.ts`), 테스트(`zoom.test.ts`), 스타일(`score.css`)이
모두 `features/score/` 안에 있어요. **고치려는 기능의 폴더 하나만 열면 돼요.**

### ② 기능 안에서는 역할로 나눠요
| 폴더 | 들어가는 것 | 규칙 |
|---|---|---|
| `components/` | 화면에 그려지는 React 컴포넌트 | 파일 이름 = 컴포넌트 이름 (PascalCase.tsx) |
| `hooks/` | 상태·효과를 가진 React 훅 | `use` 로 시작 (useLibrary.ts) |
| `lib/` | React 없이 돌아가는 계산·저장 로직 | 화면 없이 테스트할 수 있게. 테스트는 바로 옆 `*.test.ts` |

`lib/` 가 React 와 분리돼 있어서, 판정·학습·확대 계산 같은 핵심 로직을 **브라우저 없이 빠르게 테스트**할 수 있어요.

### ③ `index.ts` = 기능의 "공개 창구"
- 다른 기능이나 App 에서는 **`@/features/<기능>`** 으로만 가져와요. 기능 안쪽 파일 경로를 직접 쓰지 않아요.
  ```ts
  import { ScoreViewer, ZoomControl, type Zoom } from '@/features/score'   // ✅
  import { ScoreViewer } from '@/features/score/components/ScoreViewer'  // ✖ (테스트의 가짜 모듈 같은 특별한 경우만)
  ```
- 기능 **안쪽 파일끼리는** 상대 경로(`../lib/zoom`)로 바로 가져와요.
- 그래서 기능 안쪽 파일을 옮기거나 이름을 바꿔도 `index.ts` 한 곳만 고치면 돼요.
- `index.ts` 에 없는 것은 "그 기능 안에서만 쓰는 것"이라는 뜻이에요.

### ④ `@/` = `src/`, `@server/` = `server/`
`../../../` 처럼 깊은 상대 경로 대신 `@/features/score`, `@/shared/hooks/useNotice` 처럼 써요.
화면 코드가 서버와 주고받는 데이터 모양은 `@server/api-types` 에서 가져와요 (타입만 있는 파일).
`tsconfig.json` 의 `paths` 와 `vite.config.ts` 의 `resolve.alias` 에 같은 내용이 들어 있어요.

### ⑤ 테스트는 대상 바로 옆에
`zoom.ts` 의 테스트는 `zoom.test.ts`, 같은 폴더. 앱 전체 흐름 테스트만 `app/App.flow.test.tsx` 에 있어요.

### ⑥ 스타일은 "전역 → 기능" 순서로
1. `main.tsx` 가 **전역 스타일**을 먼저 불러와요: `tokens.css`(변수) → `base.css`(버튼 등) → `layout.css`(뼈대)
2. 각 기능의 `index.ts` 가 **그 기능의 CSS** 를 불러와요 (`import './score.css'`)
3. 기능 CSS 가 전역 CSS 뒤에 붙으니, 기능 쪽에서 버튼 모양 등을 덮어쓸 수 있어요.

색은 꼭 `tokens.css` 의 변수(`var(--accent)` 등)를 써요. 그래야 어두운 화면에서도 자동으로 맞춰져요.

---

## 3. 폴더별 자세한 설명

### 3-1. 루트 파일

| 파일 | 하는 일 |
|---|---|
| `index.html` | 페이지 제목·설명, 탭 아이콘, 홈 화면 아이콘(manifest), 상단 색(theme-color), 앱이 들어갈 `<div id="root">` |
| `package.json` | 의존성과 명령어. `dev`(개발 서버 + 서버 같이) · `dev:https`(태블릿 테스트) · `test` · `typecheck`(화면 + 서버) · `build` · `deploy` |
| `vite.config.ts` | React 플러그인, **Cloudflare 플러그인**(개발 서버 안에서 `server/` 를 진짜처럼 실행 — DB·파일 저장소는 내 컴퓨터의 `.wrangler/` 폴더에 흉내), `--mode https` 일 때 임시 인증서, 별칭, 테스트 제한 시간. 테스트 때는 Cloudflare 플러그인을 끔 |
| `tsconfig.json` | 화면 코드 엄격한 타입 검사, `@/*` → `src/*`, `@server/*` → `server/*` |
| `tsconfig.server.json` | 서버 코드 타입 검사 (Cloudflare Workers 타입) |
| `wrangler.jsonc` | Cloudflare 설정. 화면 파일은 정적 파일로(무료 · 무제한), `/api/*` 만 서버 코드로. DB(`DB` = D1), 파일 저장소(`FILES` = R2), `GOOGLE_CLIENT_ID`(로그인), `USER_QUOTA_MB`(한 사람 서버 공간) |
| `.dev.vars` | 내 컴퓨터에서만 쓰는 설정. `DEV_LOGIN=1` 이면 Google 없이 「테스트 계정으로 로그인」 (localhost 에서만 동작) |
| `scripts/copy-assets.mjs` | `node_modules` 의 MediaPipe WASM · pdf.js 글꼴/cmap 을 `public/` 으로 복사 (git 에는 안 올라감) |
| `public/brand/` | 로고 SVG (가로형·세로형·마크, 밝은/어두운) |
| `public/*.png, favicon.svg, manifest.webmanifest` | 탭 아이콘 · 홈 화면 아이콘 · PWA 정보 |
| `public/_headers` | 화면 파일에 붙는 보안 헤더 (Cloudflare 가 읽음): 불러와도 되는 곳 목록(CSP — 우리 사이트 · 글꼴 CDN · 얼굴 인식 모델 · Google 프로필 사진), 다른 사이트에 품기 금지, 카메라만 허용 등. 새 외부 주소를 쓰면 여기에 추가 |
| `public/privacy.html` · `public/terms.html` · `public/legal.css` | 개인정보처리방침 · 이용약관 (앱과 따로인 정적 페이지, 같은 색 · 글꼴). 배포하면 `/privacy` · `/terms` 로 열리고(`.html` 주소는 그쪽으로 넘어감), Google 로그인 설정의 브랜딩 링크로 씀. 앱 안에서는 라이브러리 아래 · 로그인 권유 창 · 계정 탭에서 링크 |

### 3-2. `src/main.tsx` — 시작점
전역 스타일 3개를 먼저 불러오고, `<App />` 을 `#root` 에 그려요. 개발 중 실수를 잡아 주는 `StrictMode` 로 감싸요.

### 3-3. `src/app/` — 앱 껍데기

| 파일 | 하는 일 |
|---|---|
| `App.tsx` | **모든 기능을 이어 붙이는 곳.** 상태(지금 악보, 쪽, 배율, 카메라, 캘리브레이션, 체험 단계 …)를 들고, 카메라 프레임마다 제스처를 판정해서 페이지를 넘겨요. 화면 배치(툴바 · 악보 · 카메라 패널 · 라이브러리 · 설정 서랍 · 알림)도 여기서 조립해요. 아래 [5. App.tsx 구역 지도](#5-apptsx-구역-지도) 참고 |
| `Toolbar.tsx` | 상단 바. 확대 컨트롤은 `zoom` 자리, 동기화 구름 버튼은 `sync` 자리로 받아서 끼워 넣어요 |
| `hooks/useShortcuts.ts` | 키보드·페달: →↓PageDown Space = 다음, ←↑PageUp = 이전, +/−/0 = 확대, Esc = 열린 것 닫기. 글자 입력 칸에선 무시 |
| `styles/tokens.css` | 색·크기 변수. `@media (prefers-color-scheme: dark)` 에서 어두운 색으로 바뀜. 글꼴(Pretendard) 불러오기 |
| `styles/base.css` | 기본 글꼴·크기, `.btn`(버튼), `.seg`(세그먼트), `.tag`(꼬리표), `.calib-bar`(진행 막대), `.icon-text`, `.muted` 같은 공용 클래스 |
| `styles/layout.css` | `.toolbar`, `.main`(악보 + 패널 그리드), `.panel-tab`(패널 접기 탭), 끌어다 놓기 안내, 그리고 폰(≤760px)·아주 좁은 폰(≤480px)·태블릿 세로(761~1100px) 배치 |
| `App.flow.test.tsx` | 앱 전체를 jsdom 에 그리고, 카메라·악보 파일·저장소·서버(fetch)를 가짜로 바꿔서 실제 사용 흐름을 확인 (26개) |

### 3-4. `src/features/` — 기능별

#### `score/` — 악보 보기 · 넘기기 · 확대
| 파일 | 하는 일 |
|---|---|
| `components/ScoreViewer.tsx` | 악보 페이지 표시 (한 쪽/펼치기), 다음 페이지 미리 그리기, 넘김 효과, **확대·이동**(휠 · 핀치 · 끌기 · 두 번 탭), 화면 양옆 탭·밀기로 넘기기, 시선 모드의 ▶ 칸 |
| `components/ZoomControl.tsx` | 툴바의 [− 배율 + 🔒] 와 배율 메뉴 (화면 맞춤 · 너비 맞춤 · 125~300%) |
| `components/PendingBadge.tsx` | "1.4초 뒤 다음 페이지 · 취소" 카운트다운 배지 |
| `lib/scoreFiles.ts` | 파일 읽기: PDF(pdf.js) · 이미지 → 페이지 목록, 페이지 그림 캐시(해상도 제한), 썸네일, 샘플 악보 만들기 |
| `lib/navigation.ts` | 한 쪽/펼치기에서 다음·이전 쪽 번호 계산, "3–4 / 8" 표시 |
| `lib/zoom.ts` | 확대 계산 (화면/너비 맞춤, 커서 기준 확대, 핀치, 빈틈 없게 보정, 넘겨도 보던 위치 유지) |
| `lib/turnScheduler.ts` | 넘기기 전 대기: 제스처 → N초 뒤 넘김 예약 · 취소 |
| `score.css` | 악보 화면 · 넘김 효과 · 확대 메뉴 · 대기 배지 |
| 테스트 | `zoom.test.ts`(11) · `navigation.test.ts`(4) · `turnScheduler.test.ts`(5) |

#### `library/` — 내 악보 보관함
| 파일 | 하는 일 |
|---|---|
| `components/LibraryView.tsx` | 라이브러리 화면: 썸네일 목록, 검색, 정렬, 선택 삭제 · 내려받기, 전체 내려받기, 이름 바꾸기, 30초 체험 버튼. 「어디에 저장되는지」 한 줄은 `storageNote` 자리(sync 의 `BackupNote`), 제목 아래 알림 띠는 `notice` 자리(account 의 `BackupWarning`)로 받음 |
| `hooks/useLibrary.ts` | 목록 상태 (불러오기 · 새로고침 · 저장 공간), 처음 실행 때 샘플 악보 한 번 넣기 |
| `lib/exportLibrary.ts` | 「내려받기」: 원본 파일을 ZIP 하나로 (파일 하나 → 「제목.pdf」, 여러 장 → 「제목/원래 이름」, 못 쓰는 글자 · 겹치는 이름 정리), 브라우저 저장(`saveBlob`) |
| `lib/zip.ts` | 외부 라이브러리 없는 작은 ZIP 만들기 (압축 없이 묶기, 한글 이름 UTF-8, CRC32) |
| `lib/libraryDb.ts` | IndexedDB 저장소 (`scores` 정보 · `files` 원본 · `deleted` 지운 기록): 같은 파일 찾기(서명), 보던 쪽·배율 저장, 삭제·되돌리기, **고친 시각(`updatedAt`)** 기록, 바뀔 때 알림(`onLibraryChange`), 동기화용 그대로 저장(`saveScore`) · id 바꾸기(`rekeyScore`) |
| `library.css` | 라이브러리 화면 스타일 |
| 테스트 | `libraryDb.test.ts`(7) — 가짜 IndexedDB 로 저장·조회·삭제 · 지운 기록 · id 바꾸기 확인, `exportLibrary.test.ts`(3) — ZIP 이름 규칙 · 만든 ZIP 을 다시 읽어 내용 · CRC 확인 |

#### `camera/` — 웹캠 + 얼굴 인식
| 파일 | 하는 일 |
|---|---|
| `hooks/useFaceTracker.ts` | 카메라 켜기/끄기, MediaPipe FaceLandmarker 로 프레임마다 얼굴 인식 (GPU→CPU 대체, 해상도·fps 조절), 인식선 그리기 |
| `lib/signals.ts` | 얼굴 인식 결과 → 쓰기 좋은 신호: 고개 각도(좌우·위아래·기울기), 입 옆으로, 윙크, 눈동자 위치, 표정 수치 51개 |
| `components/CameraPanel.tsx` | 오른쪽(폰은 아래) 패널: 내 모습, 제스처 종류 탭, 넘기기 전 대기, 이전 페이지 스위치, 게이지·그래프, 캘리브레이션 버튼, 내 동작 학습 결과 |
| `components/SignalMeter.tsx` | 가운데가 중립인 막대 게이지 (◀ 이전 · 다음 ▶ 구역) |
| `components/SignalChart.tsx` | 최근 10초 신호 그래프 (canvas) |
| `camera.css` | 카메라 패널 · 게이지 · 대기 시간 고르기 |
| 테스트 | `signals.test.ts`(5) |

#### `gestures/` — 제스처 판정 (모든 모드 공통)
| 파일 | 하는 일 |
|---|---|
| `lib/gestureDetector.ts` | 판정 상태머신: 기준을 넘고 → 잠깐 유지하면 → 넘김 1번 → 쉬는 시간 → 중립으로 돌아와야 다시. 스치는 움직임·떨림 무시 |
| `lib/calibration.ts` | 캘리브레이션 계산: 평소 자세(중앙값)와 동작 크기로 기준값·방향·임계값 정하기 |
| 테스트 | `gestures.test.ts`(13) |

#### `gaze/` — 시선 모드
| 파일 | 하는 일 |
|---|---|
| `lib/gaze.ts` | 눈 신호 → 화면 좌표 추정(릿지 회귀), 9점 보정, 빠른 보정(위치만 다시), ▶ 칸 안인지 판정, 흔들림 줄이기 |
| `components/GazeMap.tsx` | 패널의 작은 화면 지도 (지금 보는 곳 표시) |
| `components/GazeCalibrationOverlay.tsx` | 화면 전체를 덮는 시선 보정 화면 + 시선 점(`GazeDot`) |
| `gaze.css` | ▶ 칸, 시선 점, 보정 화면 |
| 테스트 | `gaze.test.ts`(6) |

#### `custom-gesture/` — 내 동작
| 파일 | 하는 일 |
|---|---|
| `lib/customGesture.ts` | 표정 51개 + 고개 각도로 "평소 자세 vs 녹화한 동작" 학습 (대각 선형판별), 점수 계산, 품질 판단, 평소 자세만 다시 맞추기, **동작 하나만 추가·다시 녹화** |
| `components/RecordingBanner.tsx` | 녹화 중 악보 위에 뜨는 배너 (지금 할 일 · 진행 막대 · 취소) |
| `custom-gesture.css` | 학습 결과 상자 · 녹화 배너 |
| 테스트 | `customGesture.test.ts`(7) |

#### `settings/` — 설정 · 테스트 기록
| 파일 | 하는 일 |
|---|---|
| `lib/settings.ts` | 설정 값의 모양(`Settings`)과 기본값, 모드 설명(`MODE_META`), localStorage 저장·불러오기 (예전 키 정리 포함) |
| `lib/testLog.ts` | 테스트 기록: 넘김 기록 요약, 결과 복사용 글 만들기 |
| `hooks/useSettings.ts` | 설정 상태 + 바뀌면 자동 저장. 매 프레임 읽기용 `settingsRef` |
| `components/SettingsDrawer.tsx` | 오른쪽에서 열리는 설정 서랍: 제스처 · 화면·성능 · 계정 · 테스트 기록 탭. 계정 탭 내용은 `account` 자리로 받음 (서버가 없으면 탭을 숨김) |
| `settings.css` | 설정 서랍 · 테스트 기록 표 |

#### `tour/` — 30초 체험
| 파일 | 하는 일 |
|---|---|
| `lib/tourState.ts` | 체험 단계(`Tour`: welcome → camera → neutral → try → done / nocam), 본 적 있는지 저장 |
| `hooks/useCoach.ts` | 안내 카드 위치 계산: 가리킬 요소 옆(같은 높이)에 붙이고 화살표 위치 정하기, 테두리 위치 |
| `components/TourLayer.tsx` | 환영 창 + 단계별 안내 카드 (진행은 App 이 하고 여기선 그리기만) |
| `components/GestureDemo.tsx` | "고개 돌림 → 막대 참 → 악보 넘어감" 반복 그림 (SVG) |
| `tour.css` | 체험 화면 · 동작 그림 애니메이션 · 설정의 체험 버튼 |

#### `account/` — 로그인 · 계정
| 파일 | 하는 일 |
|---|---|
| `hooks/useAccount.ts` | 로그인 상태(`loading` · `unavailable` 서버 없음 · `disabled` 로그인 설정 안 됨 · `signedOut` · `signedIn`). Google 로그인 페이지로 보내기(`next` = 돌아와서 이어 할 일, 예: `add`), Google 에서 돌아왔을 때 `?login=` 결과 알림 (+ 「악보 추가」 같은 이어 하기 버튼), 로그아웃, 계정 삭제, 오프라인이면 기억해 둔 계정으로 표시 |
| `components/LoginPrompt.tsx` | 로그인 안 한 채로 「악보 추가」·끌어다 놓기를 하면 먼저 뜨는 「악보를 계정에 백업할까요?」 창 (Google 로그인 / 이 기기에만 저장 / 다시 묻지 않기 — `loginPromptOff()`) |
| `components/BackupWarning.tsx` | 라이브러리 위 경고 띠: 「악보 N개가 이 브라우저에만 있어요 · 로그인해서 백업」 (로그인 안 했고 샘플 말고 내 악보가 있을 때) |
| `components/AccountPanel.tsx` | 설정 › 계정 탭: 로그인 안내(무엇이 맞춰지는지) · 계정 정보 · 동기화 상태 · 서버 공간 · 지금 맞추기 · 로그아웃 · 계정 삭제(한 번 더 확인). 개발용 로그인 칸 (localhost + `DEV_LOGIN=1` 일 때만) |
| `account.css` | 계정 탭 스타일 |

#### `sync/` — 계정과 맞추기 (동기화)
| 파일 | 하는 일 |
|---|---|
| `lib/syncPlan.ts` | **무엇을 할지 정하기** (순수 함수): 이 기기 목록 · 지운 기록 · 서버 목록을 비교 → 올리기 / 받기 / 정보만 올리기·받기 / 지우기 / 같은 파일 합치기(id 바꾸기) |
| `lib/syncEngine.ts` | **실제로 하기**: 계획대로 서버 호출 · 저장소 쓰기. 받는 사이 이 기기에서 더 고쳤으면 덮어쓰지 않음, 공간이 모자라면 그 악보만 건너뜀, 로그인 풀림·오프라인이면 멈춤. 설정 맞추기(`syncSettings`)도 여기 |
| `lib/syncedSettings.ts` | 어떤 설정을 같이 쓰는지(`SYNCED_KEYS`) · 기기마다 따로인지, 이 기기 설정을 고친 시각 기록 |
| `lib/fakeServer.ts` | 테스트용 가짜 서버 (서버와 같은 규칙을 메모리에서) — 앱 코드에서는 안 씀 |
| `hooks/useSync.ts` | 언제 맞출지: 로그인 직후 · 악보 고치고 5초 뒤 · 설정 바꾸고 3초 뒤 · 다시 연결됐을 때 · 앱으로 돌아왔을 때 · 5분마다. 한 번에 하나만, 도는 중에 바뀌면 끝나고 한 번 더 |
| `components/SyncIndicator.tsx` | 상단 바 구름 버튼(맞춤 · 맞추는 중 · 오프라인 · 문제), 라이브러리의 「이 브라우저에만 저장돼요 · 로그인하고 백업하기」 한 줄(`BackupNote`) |
| `sync.css` | 구름 버튼 · 백업 한 줄 |
| 테스트 | `syncPlan.test.ts`(6) · `syncEngine.test.ts`(9) — 두 기기(진짜 라이브러리 코드 + 가짜 IndexedDB 두 개) + 가짜 서버로 추가 · 고치기 · 동시에 고치기 · 지우기 · 되살리기 · 샘플 합치기 · 공간 부족 · 서버 무료 한도 · 오프라인 · 설정 |

### 3-5. `src/shared/` — 공용
| 파일 | 하는 일 |
|---|---|
| `api/voltiApi.ts` | 서버 호출 모음 (`api.listScores()`, `api.putFile()` …). 데이터를 바꾸는 요청엔 `X-Volti` 헤더, 오류는 `ApiError`(상태 · 코드 · 화면에 보여 줄 글), 서버에 닿지 않으면 상태 0 (`isOffline`) |
| `hooks/useElementSize.ts` | 요소 크기를 따라가는 훅 (악보 영역 크기 → 펼치기 자동 판단 등) |
| `hooks/useNotice.ts` | `notify('저장했어요')` 로 알림 띄우기, 몇 초 뒤 자동으로 사라짐, 버튼 하나 달기(되돌리기 등) |
| `ui/Toast.tsx` · `ui/toast.css` | 아래쪽 알림 화면 |

`shared/` 에는 **어느 기능에도 속하지 않고 두 곳 이상에서 쓰는 것**만 넣어요. 한 기능에서만 쓰면 그 기능 폴더에 둬요.

### 3-6. `server/` — 서버 (Cloudflare Worker)

화면 파일(HTML · JS · 그림)은 Cloudflare 가 정적 파일로 바로 보내요. **`/api/*` 주소만** 이 코드가 처리해요.

| 파일 | 하는 일 |
|---|---|
| `index.ts` | 시작점. 주소 표(`ROUTES`)로 처리 함수 연결, 데이터를 바꾸는 요청은 CSRF 확인, 처음 요청 때 DB 표 만들기 |
| `api-types.ts` | 서버와 화면이 주고받는 모양 (`ApiScore`, `ApiSettings` …). 타입만 있어서 화면에서도 가져다 씀 |
| `freeGuard.ts` | **요금이 나가지 않게** R2 를 쓸 때마다 횟수(달마다 쓰기 45만 · 읽기 450만)와 전체 공간(9GB)을 세서 넘기 전에 멈춤. 횟수는 DB 의 `r2_usage` 표. 지우기는 막지 않음. 목록에 `uploadsPaused` 로 알려 줘서 화면이 큰 파일을 보내지 않음 |
| `limits.ts` | 한도 상수 (파일 하나 95MB · 악보 하나 300개 파일 · 썸네일 2MB). 화면의 동기화도 올리기 전에 이 값으로 미리 걸러요 |
| `env.ts` | 서버가 받는 것: `DB`(D1) · `FILES`(R2) · `GOOGLE_CLIENT_ID` · `USER_QUOTA_MB` · `DEV_LOGIN` |
| `http.ts` | JSON 응답 · 오류 응답(`HttpError`) · 보안 헤더(`secure()`) · 쿠키 읽기/만들기 · CSRF 확인(`X-Volti` 헤더 + 같은 출처) · 무작위 토큰 · 해시 |
| `schema.ts` | DB 표 5개(`users` · `sessions` · `scores` · `settings` · `r2_usage`). 따로 마이그레이션 없이 처음 요청 때 `CREATE TABLE IF NOT EXISTS` |
| `auth/google.ts` | Google ID 토큰 확인: Google 공개키로 서명 · 우리 앱용인지 · 만료 · 이메일 인증 · 일회용 값(nonce) |
| `auth/session.ts` | 로그인 유지: 무작위 토큰을 HttpOnly 쿠키로 주고 DB 엔 해시만, 180일 (쓰면 연장) |
| `routes/auth.ts` | Google 로그인(페이지 이동 방식: `start` → Google → `callback`), 개발용 로그인, 로그아웃, 내 정보, 계정 삭제 |
| `routes/scores.ts` | 악보 목록 · 파일 올리기/받기(R2 `u/<사용자>/<악보>/f0…`) · 썸네일 · 정보 저장(나중에 고친 것이 이김, 파일 다 있는지 · 공간 확인) · 지우기(파일 · 제목 · 파일 이름은 지우고 「지운 기록」(번호 · 시각)만 남김) |
| `routes/settings.ts` | 같이 쓰는 설정 저장/받기 (나중에 고친 것이 이김) |
| 테스트 | `auth/google.test.ts`(2) — 직접 만든 키로 진짜 · 위조 · 다른 앱 · 만료 · nonce 다름 토큰 확인 |

---

## 4. 데이터가 흐르는 길

### 제스처로 넘기기 (핵심 흐름)
```
 카메라 프레임 (useFaceTracker, 초당 15회 정도)
        │  얼굴 랜드마크 · 표정 수치 · 머리 회전 행렬
        ▼
 extractSignals  (camera/lib/signals.ts)
        │  고개 각도 · 입 · 윙크 · 눈동자 · 표정 51개
        ▼
 지금 모드의 값 하나로  ─ 고개·입·윙크: modeValue
        │              ─ 시선: predictGaze → ▶ 칸 안인지 (gaze)
        │              ─ 내 동작: customValue (custom-gesture)
        ▼
 (값 − 기준값) × 방향
        ▼
 GestureDetector.update  (gestures/lib/gestureDetector.ts)
        │  기준 넘고 잠깐 유지 → 「다음」/「이전」 이벤트
        ▼
 handleGesture  (App.tsx) ── 테스트 기록에 남기기
        ▼
 TurnScheduler.request  (score/lib/turnScheduler.ts)
        │  「넘기기 전 대기」 시간만큼 기다림 (취소 가능)
        ▼
 turn()  (App.tsx) ── 쪽 번호 계산 (navigation.ts)
        ▼
 ScoreViewer 가 새 페이지를 그림 (확대 배율 · 보던 위치 유지)
```
버튼 · 키보드 · 페달 · 화면 탭 · 밀기는 `manualTurn()` → 예약 지우고 바로 `turn()` 으로 가요.
**모든 넘김은 `turn()` 한 곳을 지나요.**

### 악보 열기
```
 파일 고르기 / 끌어다 놓기 / 라이브러리에서 고르기
        ▼
 loadScoreFiles  (score/lib/scoreFiles.ts) ── PDF·이미지 → 페이지 목록
        ▼
 openScore  (App.tsx) ── 새 파일이면 라이브러리에 저장 (library/lib/libraryDb.ts), 있던 파일이면 보던 쪽·배율로
        ▼
 ScoreViewer 표시 ── 넘길 때마다 보던 쪽, 배율 바꿀 때마다 배율을 라이브러리에 저장
```

---

### 계정과 맞추기 (동기화)
```
 이 기기에서 악보 추가 · 쪽 넘김 · 배율 · 이름 · 삭제  ──  libraryDb 가 고친 시각(updatedAt) 기록, 지우면 지운 기록
        │  onLibraryChange
        ▼
 useSync  (sync/hooks) ── 5초 모아서 한 번
        ▼
 syncLibrary  (sync/lib/syncEngine.ts)
        │  ① 서버 목록 받기 (GET /api/scores)
        │  ② planSync: 이 기기 ↔ 서버 비교 → 할 일 목록
        │  ③ 하기: 파일 올리기(PUT …/files/0) → 정보 올리기(PUT /api/scores/:id)
        │          또는 파일 받기 → saveScore, 정보만 받기 → updateScore, 지우기 …
        ▼
 App.onSynced ── 목록 새로고침, 보던 악보 id 가 바뀌었으면 따라감
```
- **충돌 규칙**: 악보 하나의 정보(제목 · 보던 쪽 · 배율)는 통째로 「나중에 고친 쪽」이 이겨요. 지우기도 같은 규칙이라, 지운 뒤에 다른 기기에서 더 나중에 고쳤으면 되살아나요.
- **같은 파일**: 두 기기에서 같은 파일(이름 + 크기가 같음)을 따로 넣었으면 서버 쪽 id 로 맞춰 하나로 합쳐요 (샘플 악보가 그 예).
- **로그인 안 하면** 아무 일도 안 해요. 서버가 없는 곳(예: 정적 파일만 올린 곳)에서는 계정 기능 자체가 숨어요.

### Google 로그인
```
 [Google 계정으로 로그인] → /api/auth/google/start  ── state · nonce 를 10분짜리 쿠키에
        ▼
 Google 로그인 페이지 (계정 고르기)
        ▼  id_token 을 POST
 /api/auth/google/callback  ── state · nonce · 서명 확인 → 사용자 만들기/찾기 → 로그인 쿠키
        ▼
 원래 화면으로 (?login=ok) → useAccount 가 알림 띄우고 주소 정리 → 동기화 시작
```
팝업 · Google 스크립트를 쓰지 않아서 태블릿 「홈 화면에 추가」 앱에서도 똑같이 동작하고, 클라이언트 비밀키도 필요 없어요.

---

## 5. App.tsx 구역 지도

`App.tsx` 는 기능들을 잇는 곳이라 아직 가장 큰 파일이에요 (약 1,300줄). 위에서부터 이 순서로 돼 있어요.
각 구역은 `/* ───────── 이름 ───────── */` 줄로 시작해요.

| 구역 | 내용 |
|---|---|
| 맨 위 타입 · 상수 | `Live`(화면에 보여 줄 실시간 값), 캘리브레이션·시선 보정·녹화 진행 상태 타입, 시간 상수 |
| 설정 · 알림 | `useSettings()`, `useNotice()` |
| 라이브러리 | 라이브러리 열림 여부, `useLibrary()`, 지금 연 악보 id |
| 계정 · 동기화 | `useAccount()`, `useSync()`, 맞춘 뒤 처리(`onSynced`: 목록 새로고침 · 보던 악보 id 따라가기 · 알림), 로그인 권유(`requestAdd` · `requestOpenFiles` → `LoginPrompt`, 백업 안 된 악보 수) |
| 악보 · 확대 · 축소 | 지금 악보·쪽·배율, **`turn()`**, `openScore()`, 열기·이름 바꾸기·삭제(되돌리기), 보던 쪽·배율 자동 저장, 끌어다 놓기 |
| 테스트 기록 | 넘김 기록, 측정 시간 |
| 넘김 예약 | `TurnScheduler`, `manualTurn()` |
| 카메라 · 제스처 | 판정기, 캘리브레이션 · 시선 보정 · 내 동작 녹화의 진행, `handleGesture()`, **`onFrame()`**(매 프레임 처리), `useFaceTracker()` |
| 30초 체험 | 체험 단계 상태, 단계 넘기기, 시작·끝 |
| 설정 서랍 | 결과 복사, 기록 지우기 |
| 키보드 · 블루투스 페달 | `useShortcuts()` |
| 화면 | 툴바 · 악보 · 카메라 패널 · 라이브러리 · 시선 보정 · 설정 서랍 · 알림 조립 |

> 카메라 · 제스처 구역(`onFrame` 과 캘리브레이션들)은 서로 같은 값(판정기, 진행 상태, 체험 단계, 넘김 예약)을
> 많이 함께 써서 한 곳에 두었어요. 더 나눈다면 `useGestureEngine()` 같은 훅으로 빼는 것이 다음 후보예요 (9장).

---

## 6. 기능끼리 서로 쓰는 관계

| 기능 | 가져다 쓰는 기능 (무엇을) |
|---|---|
| `score` | 없음 (가장 아래층) |
| `gestures` | 없음 |
| `library` | `score` (배율 타입, 샘플 악보 만들기) |
| `camera` | `settings` (모드 설명), `gaze` (패널의 시선 지도), `custom-gesture` (표정 순서) |
| `gaze` | `camera` (신호 타입만) |
| `custom-gesture` | `camera` (신호 타입만) |
| `settings` | `gaze` · `custom-gesture` (저장할 모델 타입), `camera` (신호 타입) — 타입만 |
| `tour` | `gestures` · `camera` (타입만) |
| `sync` | `library` (저장소 함수 · 날짜 표시), `settings` (기본값 · 타입), `shared/api` |
| `account` | `sync` (상태 글 · 타입), `library` (용량 표시), `shared/api` |
| `app/App.tsx` | 전부 |

"타입만"은 실행 코드가 아니라 TypeScript 타입 정보만 가져온다는 뜻이라, 실제로 서로 묶이지 않아요.
**기능끼리 값(함수·컴포넌트)을 주고받는 것은 최소로** 하고, 여러 기능을 함께 써야 하는 일은 `App.tsx` 에서 이어 줘요.

---

## 7. 테스트

```bash
npm test            # 전체 (104개)
npm run typecheck   # 타입 검사 (화면 + 서버)
```

| 파일 | 개수 | 확인하는 것 |
|---|---|---|
| `app/App.flow.test.tsx` | 26 | 실제 사용 흐름 — 시선·고개·내 동작 넘김, 라이브러리(내려받기 포함), 넘기기 전 대기, 확대, 30초 체험, 계정 · 백업 안내 · 악보 추가 전 로그인 권유 |
| `features/sync/lib/syncEngine.test.ts` | 9 | 두 기기 동기화 (추가 · 고치기 · 지우기 · 되살리기 · 합치기 · 공간 부족 · 서버 무료 한도 · 오프라인 · 설정) |
| `features/sync/lib/syncPlan.test.ts` | 6 | 동기화 계획 규칙 |
| `features/gestures/lib/gestures.test.ts` | 13 | 판정기(유지·쿨다운·중립 복귀·떨림), 캘리브레이션 |
| `features/score/lib/zoom.test.ts` | 11 | 확대 계산, 넘겨도 위치 유지 |
| `features/custom-gesture/lib/customGesture.test.ts` | 7 | 내 동작 학습·구분, 이전 동작만 추가 |
| `features/gaze/lib/gaze.test.ts` | 6 | 시선 추정·보정·▶ 칸 판정 |
| `features/library/lib/libraryDb.test.ts` | 7 | 라이브러리 저장·조회·삭제 · 지운 기록 · id 바꾸기 |
| `features/library/lib/exportLibrary.test.ts` | 3 | 내려받기 ZIP (이름 규칙 · 내용 · CRC · 한글) |
| `features/camera/lib/signals.test.ts` | 5 | 얼굴 → 신호 변환 |
| `features/score/lib/turnScheduler.test.ts` | 5 | 넘기기 전 대기 · 취소 |
| `features/score/lib/navigation.test.ts` | 4 | 한 쪽/펼치기 쪽 계산 |
| `server/auth/google.test.ts` | 2 | Google 로그인 토큰 확인 |

흐름 테스트는 진짜 카메라·IndexedDB 대신 가짜를 써요. 맨 위의 `vi.mock(...)` 3개가 그 부분이에요
(`camera/hooks/useFaceTracker`, `score/lib/scoreFiles`, `library/lib/libraryDb`). 이 파일들을 옮기면 경로도 같이 바꿔 주세요.
서버는 `fetch` 를 가짜로 바꿔서 흉내 내요 (기본은 「서버 없음」 → 계정 기능이 숨은 상태).

서버까지 진짜로 돌려 보는 확인은 `npm run dev` 로 켠 뒤 브라우저 두 개(일반 창 + 시크릿 창)에서
설정 › 계정 › 「테스트 계정으로 로그인」을 같은 이메일로 해 보면 돼요.

---

## 8. 새 코드를 넣을 때

### 어디에 넣을까?
| 만들려는 것 | 위치 |
|---|---|
| 어떤 기능의 화면 조각 | `features/<기능>/components/NewThing.tsx` |
| 상태를 가진 로직 (React 훅) | `features/<기능>/hooks/useNewThing.ts` |
| 계산·변환·저장 (React 없이) | `features/<기능>/lib/newThing.ts` + 옆에 `newThing.test.ts` |
| 그 기능의 스타일 | `features/<기능>/<기능>.css` 에 추가 |
| 두 기능 이상에서 쓰는 작은 훅·UI | `shared/hooks/`, `shared/ui/` |
| 새 서버 API | `server/routes/<이름>.ts` 에 처리 함수 → `server/index.ts` 의 `ROUTES` 에 한 줄 → 주고받는 모양은 `server/api-types.ts` → 화면 쪽 호출은 `shared/api/voltiApi.ts` |
| 앱 전체 배치·툴바 | `app/` |
| 새 기능 (예: "메트로놈") | `features/metronome/` 폴더 + `index.ts` + `metronome.css` |

### 순서
1. 파일을 만들고, 기능 안에서는 상대 경로로 가져와요.
2. 바깥(App·다른 기능)에서 써야 하면 그 기능의 `index.ts` 에 `export` 를 한 줄 추가해요.
3. 바깥에서는 `import { NewThing } from '@/features/<기능>'` 으로 써요.
4. `npm run typecheck` · `npm test` 로 확인해요.

### 이름 규칙
| 종류 | 규칙 | 예 |
|---|---|---|
| 컴포넌트 | PascalCase.tsx, 파일 하나에 주 컴포넌트 하나 | `ScoreViewer.tsx` |
| 훅 | `use` + PascalCase .ts | `useLibrary.ts` |
| 로직 | camelCase.ts | `turnScheduler.ts` |
| 테스트 | 대상 이름 + `.test.ts(x)` | `zoom.test.ts` |
| 기능 폴더 | 소문자, 여러 단어는 `-` | `custom-gesture/` |
| CSS 클래스 | 소문자-하이픈, 기능 접두어 | `.lib-card`, `.tour-card`, `.zoom-menu` |
| 아이콘 | `lucide-react` 선 아이콘만 (색 이모지 ✖) | `<ChevronRight size={18} />` |

---

## 9. 예전 위치 → 지금 위치

| 예전 | 지금 |
|---|---|
| `src/App.tsx` | `src/app/App.tsx` (+ 상단 바 → `app/Toolbar.tsx`, 단축키 → `app/hooks/useShortcuts.ts`, 녹화 배너 → `custom-gesture/components/RecordingBanner.tsx`, 시선 보정 화면 → `gaze/components/GazeCalibrationOverlay.tsx`, 알림 → `shared/`) |
| `src/App.flow.test.tsx` | `src/app/App.flow.test.tsx` |
| `src/index.css` | `app/styles/tokens.css` · `base.css` · `layout.css` + 각 기능의 `<기능>.css` + `shared/ui/toast.css` |
| `src/components/ScoreViewer.tsx` · `ZoomControl.tsx` · `PendingBadge.tsx` | `features/score/components/` |
| `src/components/LibraryView.tsx` | `features/library/components/` |
| `src/components/CameraPanel.tsx` · `SignalMeter.tsx` · `SignalChart.tsx` | `features/camera/components/` |
| `src/components/GazeMap.tsx` | `features/gaze/components/` |
| `src/components/SettingsDrawer.tsx` | `features/settings/components/` |
| `src/components/Tour.tsx` | `features/tour/` 안에서 4개로: `lib/tourState.ts` · `hooks/useCoach.ts` · `components/TourLayer.tsx` · `components/GestureDemo.tsx` |
| `src/lib/score.ts` | `features/score/lib/scoreFiles.ts` |
| `src/lib/navigation.ts` · `zoom.ts` · `turnScheduler.ts` | `features/score/lib/` |
| `src/lib/library.ts` | `features/library/lib/libraryDb.ts` (+ 목록 상태 → `hooks/useLibrary.ts`) |
| `src/lib/useFaceTracker.ts` | `features/camera/hooks/useFaceTracker.ts` |
| `src/lib/signals.ts` | `features/camera/lib/signals.ts` |
| `src/lib/gestureDetector.ts` · `calibration.ts` | `features/gestures/lib/` |
| `src/lib/gaze.ts` | `features/gaze/lib/gaze.ts` |
| `src/lib/customGesture.ts` | `features/custom-gesture/lib/customGesture.ts` |
| `src/lib/settings.ts` | `features/settings/lib/settings.ts` (+ 상태 → `hooks/useSettings.ts`) |
| `src/lib/log.ts` | `features/settings/lib/testLog.ts` |
| `src/lib/logic.test.ts` (하나로 모여 있던 테스트) | 대상별로 나눔: `gestures.test.ts` · `signals.test.ts` · `navigation.test.ts` · `gaze.test.ts` · `customGesture.test.ts` · `turnScheduler.test.ts` |
| `src/lib/zoom.test.ts` · `library.test.ts` | `features/score/lib/zoom.test.ts` · `features/library/lib/libraryDb.test.ts` |

정리하면서 **화면은 1px도 바뀌지 않게** 했어요 (정리 전·후 57개 화면을 찍어 비교).

---

## 10. 앞으로 더 나눌 후보

- **`useGestureEngine()` 훅**: `App.tsx` 의 카메라 · 제스처 구역(`onFrame`, 캘리브레이션 · 시선 보정 · 녹화 진행)을
  `features/gestures/hooks/` 로 빼면 App 이 화면 조립 위주로 가벼워져요. 함께 쓰는 값이 많아서 넘김 예약 · 체험과의
  연결을 인자로 넘기는 설계가 필요해요.
- **`useScoreSession()` 훅**: 악보 열기 · 쪽 · 배율 · 자동 저장을 `features/score/hooks/` 로.
- **`useTour()` 훅**: 체험 단계 진행을 `features/tour/hooks/` 로.
- 큰 화면 컴포넌트(`SettingsDrawer`, `TourLayer`)를 탭·단계별 작은 컴포넌트로 나누기.
