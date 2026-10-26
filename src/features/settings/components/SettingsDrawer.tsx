import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MODE_META, formatValue, type ModeConfig, type Settings } from '../lib/settings'
import type { FaceSignals } from '@/features/camera'
import { formatClock, summarize, type LogEntry } from '../lib/testLog'

export type DrawerTab = 'gesture' | 'view' | 'account' | 'log'

interface Props {
  open: boolean
  tab: DrawerTab
  onTab: (t: DrawerTab) => void
  onClose: () => void
  settings: Settings
  update: (patch: Partial<Settings>) => void
  updateMode: (patch: Partial<ModeConfig>) => void
  onResetMode: () => void
  sig: FaceSignals | null
  running: boolean
  activeDelegate: 'GPU' | 'CPU' | null
  onRestartCamera: () => void
  log: LogEntry[]
  sessionMs: number
  onToggleFalse: (id: number) => void
  onClearLog: () => void
  tester: string
  onTester: (v: string) => void
  onCopyReport: () => void
  /** 30초 체험 다시 하기 */
  onTour: () => void
  /** 「계정」 탭 내용 (features/account 의 AccountPanel). 없으면 탭을 숨김 */
  account?: ReactNode
}

function Field({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-head">
        <span>{label}</span>
        {value !== undefined && <strong>{value}</strong>}
      </span>
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange, desc }: { label: string; checked: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <label className="toggle">
      <span>
        {label}
        {desc && <small className="muted">{desc}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg small">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsDrawer(p: Props) {
  const s = p.settings
  const meta = MODE_META[s.mode]
  const cfg = s.modes[s.mode]
  const isGaze = s.mode === 'gaze'
  const isCustom = s.mode === 'custom'
  const stats = summarize(p.log, p.sessionMs)
  // 계정 탭이 사라졌으면(서버에 닿지 않음 등) 첫 탭으로
  const tab: DrawerTab = p.tab === 'account' && !p.account ? 'gesture' : p.tab

  return (
    <>
      <div className={`scrim ${p.open ? 'open' : ''}`} onClick={p.onClose} />
      <section className={`drawer ${p.open ? 'open' : ''}`} aria-hidden={!p.open} aria-label="설정">
        <header className="drawer-head">
          <div className="seg">
            <button className={tab === 'gesture' ? 'on' : ''} onClick={() => p.onTab('gesture')}>
              제스처
            </button>
            <button className={tab === 'view' ? 'on' : ''} onClick={() => p.onTab('view')}>
              화면·성능
            </button>
            {p.account && (
              <button className={tab === 'account' ? 'on' : ''} onClick={() => p.onTab('account')}>
                계정
              </button>
            )}
            <button className={tab === 'log' ? 'on' : ''} onClick={() => p.onTab('log')}>
              테스트 기록 {p.log.length > 0 && <span className="badge">{p.log.length}</span>}
            </button>
          </div>
          <button className="btn ghost icon" onClick={p.onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </header>

        <div className="drawer-body">
          {tab === 'account' && p.account}
          {tab === 'gesture' && (
            <>
              <div className="tour-callout">
                <span>
                  <b>30초 체험</b>
                  <small className="muted">샘플 악보로 카메라 켜기부터 동작으로 넘기기까지 직접 해 봐요</small>
                </span>
                <button className="btn small" onClick={p.onTour}>
                  체험하기
                </button>
              </div>

              <h3>넘기는 시점</h3>
              <Field label="넘기기 전 대기" value={s.turnDelayMs === 0 ? '바로' : `${Number((s.turnDelayMs / 1000).toFixed(2))}초`}>
                <input
                  type="range"
                  min={0}
                  max={5000}
                  step={250}
                  value={s.turnDelayMs}
                  onChange={(e) => p.update({ turnDelayMs: Number(e.target.value) })}
                  aria-label="넘기기 전 대기 시간"
                />
              </Field>
              <p className="muted small">
                제스처를 인식한 뒤 이 시간만큼 기다렸다가 넘겨요. 마지막 마디를 연주하면서 미리 동작해 둘 때 좋아요. 기다리는 동안 화면의 「취소」, Esc, 반대
                방향 동작으로 취소할 수 있고, 버튼·키보드·페달로 넘기면 바로 넘어가요.
              </p>

              <h3>{meta.label}</h3>
              {isGaze ? (
                <>
                  <Field label="바라보는 시간" value={`${(s.gazeDwellMs / 1000).toFixed(2)}초`}>
                    <input type="range" min={300} max={2000} step={50} value={s.gazeDwellMs} onChange={(e) => p.update({ gazeDwellMs: Number(e.target.value) })} />
                  </Field>
                  <p className="muted small">오른쪽 아래 칸을 이 시간만큼 계속 보면 넘어가요. 짧으면 빠르지만 지나가는 눈길에도 넘어갈 수 있어요.</p>
                  <Field label="넘김 칸 크기">
                    <Choice
                      value={s.gazeZone}
                      onChange={(v) => p.update({ gazeZone: v })}
                      options={[
                        { value: 'small', label: '작게' },
                        { value: 'medium', label: '보통' },
                        { value: 'large', label: '크게' },
                      ]}
                    />
                  </Field>
                  <p className="muted small">시선 추정이 자주 빗나가면 크게, 마지막 줄을 읽다가 너무 일찍 넘어가면 작게 해 보세요.</p>
                </>
              ) : (
                <>
                  <Field label="임계값" value={formatValue(s.mode, cfg.threshold)}>
                    <input
                      type="range"
                      min={meta.minThreshold}
                      max={meta.maxThreshold}
                      step={meta.step}
                      value={cfg.threshold}
                      onChange={(e) => p.updateMode({ threshold: Number(e.target.value) })}
                    />
                  </Field>
                  <p className="muted small">높이면 오작동이 줄고, 낮추면 작은 동작으로도 넘어가요.</p>

                  <Field label="유지 시간" value={`${s.holdMs}ms`}>
                    <input type="range" min={0} max={1200} step={50} value={s.holdMs} onChange={(e) => p.update({ holdMs: Number(e.target.value) })} />
                  </Field>
                  <p className="muted small">이 시간만큼 동작을 유지해야 넘어가요. 스치는 움직임을 걸러줘요.</p>
                </>
              )}

              <Field label="쿨다운" value={`${(s.cooldownMs / 1000).toFixed(1)}초`}>
                <input type="range" min={300} max={4000} step={100} value={s.cooldownMs} onChange={(e) => p.update({ cooldownMs: Number(e.target.value) })} />
              </Field>
              <p className="muted small">넘긴 뒤 이 시간 동안은 다시 넘어가지 않아요. 중립으로 돌아와야 다음 동작을 받아요.</p>

              {isGaze ? (
                <>
                  <Toggle label="시선 점 · 넘김 칸 표시" desc="테스트할 때 켜 두면 어디를 본다고 인식하는지 보여요" checked={s.showGazeDot} onChange={(v) => p.update({ showGazeDot: v })} />
                  <div className="kv">
                    <span>시선 보정</span>
                    <strong>{s.gazeModel ? `완료 · 오차 약 ${Math.round(s.gazeModel.errorPx)}px` : '아직 안 함'}</strong>
                    {s.gazeModel && (
                      <>
                        <span>보정한 화면 크기</span>
                        <strong>
                          {s.gazeModel.viewW}×{s.gazeModel.viewH}
                        </strong>
                      </>
                    )}
                  </div>
                  <p className="muted small">창 크기나 앉은 위치가 바뀌면 다시 캘리브레이션 하는 게 좋아요.</p>
                  <div className="row gap">
                    <button className="btn ghost" onClick={p.onResetMode} disabled={!s.gazeModel}>
                      시선 보정 지우기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Toggle label="앞으로만 넘기기" desc="반대 방향(이전 페이지)은 무시" checked={s.forwardOnly} onChange={(v) => p.update({ forwardOnly: v })} />

                  {isCustom ? (
                    <>
                      <div className="kv">
                        <span>다음 동작</span>
                        <strong>{s.customModel ? s.customModel.next.summary.join(', ') || '작은 변화들' : '녹화 안 함'}</strong>
                        <span>이전 동작</span>
                        <strong>{s.customModel?.prev ? s.customModel.prev.summary.join(', ') || '작은 변화들' : '없음'}</strong>
                        {s.customModel && (
                          <>
                            <span>평소 자세 점수 (95%)</span>
                            <strong>{s.customModel.next.quality.neutralP95.toFixed(2)}</strong>
                            <span>동작 점수 (하위 25%)</span>
                            <strong>{s.customModel.next.quality.gestureP25.toFixed(2)}</strong>
                          </>
                        )}
                      </div>
                      <p className="muted small">평소 자세 점수와 동작 점수 사이에 임계값이 있어야 해요. 둘이 가까우면 다른 동작으로 다시 녹화해 보세요.</p>
                      <div className="row gap">
                        <button className="btn ghost" onClick={p.onResetMode} disabled={!s.customModel}>
                          내 동작 지우기
                        </button>
                      </div>
                    </>
                  ) : (
                  <>
                  <div className="kv">
                    <span>기준값</span>
                    <strong>{formatValue(s.mode, cfg.baseline)}</strong>
                    <span>방향</span>
                    <strong>{cfg.direction === 1 ? '+ 쪽이 다음' : '− 쪽이 다음'}</strong>
                  </div>
                  <div className="row gap">
                    <button className="btn" onClick={() => p.updateMode({ direction: cfg.direction === 1 ? -1 : 1 })}>
                      방향 반전
                    </button>
                    <button className="btn ghost" onClick={p.onResetMode}>
                      이 제스처 초기화
                    </button>
                  </div>
                  </>
                  )}
                </>
              )}

              <h3>원시 수치</h3>
              <p className="muted small">새 제스처를 구상할 때 참고용. 좌우 값은 연주자 기준 오른쪽이 + 예요.</p>
              <div className="raw">
                {p.sig ? (
                  <>
                    <span>고개 좌우</span>
                    <b>{p.sig.yaw.toFixed(1)}°</b>
                    <span>고개 위아래</span>
                    <b>{p.sig.pitch.toFixed(1)}°</b>
                    <span>고개 기울기</span>
                    <b>{p.sig.roll.toFixed(1)}°</b>
                    <span>입 왼/오</span>
                    <b>
                      {p.sig.mouthL.toFixed(2)} / {p.sig.mouthR.toFixed(2)}
                    </b>
                    <span>눈 감음 왼/오</span>
                    <b>
                      {p.sig.blinkL.toFixed(2)} / {p.sig.blinkR.toFixed(2)}
                    </b>
                    <span>입 벌림</span>
                    <b>{p.sig.jawOpen.toFixed(2)}</b>
                    <span>홍채 좌우 / 상하</span>
                    <b>
                      {p.sig.irisH.toFixed(3)} / {p.sig.irisV.toFixed(3)}
                    </b>
                    <span>시선 좌우 / 상하</span>
                    <b>
                      {p.sig.lookH.toFixed(2)} / {p.sig.lookV.toFixed(2)}
                    </b>
                  </>
                ) : (
                  <span className="muted">카메라를 켜고 얼굴이 보이면 표시돼요</span>
                )}
              </div>
            </>
          )}

          {tab === 'view' && (
            <>
              <h3>악보 보기</h3>
              <Field label="페이지 배치">
                <Choice
                  value={s.viewMode}
                  onChange={(v) => p.update({ viewMode: v })}
                  options={[
                    { value: 'auto', label: '자동' },
                    { value: 'single', label: '한 페이지' },
                    { value: 'spread', label: '펼치기' },
                  ]}
                />
              </Field>
              <p className="muted small">자동: 화면이 가로로 넓으면 두 페이지를 펼쳐서 보여줘요.</p>
              <Field label="펼치기에서 넘기는 양">
                <Choice
                  value={s.spreadStep}
                  onChange={(v) => p.update({ spreadStep: v })}
                  options={[
                    { value: 2, label: '두 장씩 (책처럼)' },
                    { value: 1, label: '한 장씩 (밀어내기)' },
                  ]}
                />
              </Field>
              <p className="muted small">한 장씩: 오른쪽 페이지가 왼쪽으로 오면서 다음 장이 나타나요. 넘기는 타이밍에 여유가 생겨요.</p>

              <h3>확대 · 축소</h3>
              <Field label="마우스 휠">
                <Choice
                  value={s.wheelMode}
                  onChange={(v) => p.update({ wheelMode: v })}
                  options={[
                    { value: 'zoom', label: '확대·축소' },
                    { value: 'scroll', label: '위아래 이동' },
                  ]}
                />
              </Field>
              <p className="muted small">위아래 이동을 고르면 Ctrl(⌘)+휠로 확대해요. 트랙패드는 두 손가락 벌리기로도 확대돼요.</p>
              <Toggle
                label="확대 중엔 아래로 먼저 이동"
                desc="꺼짐(기본): 확대해도 바로 넘어가고, 보던 위치(위아래·좌우)가 다음 페이지에서도 그대로예요. 켜면 페이지가 화면보다 길 때 「다음」에 한 화면씩 내려간 뒤 넘기고, 새 페이지는 맨 위부터 보여줘요."
                checked={s.zoomScrollFirst}
                onChange={(v) => p.update({ zoomScrollFirst: v })}
              />
              <Toggle label="확대·위치 고정" desc="휠·핀치·끌기로 배율과 위치가 바뀌지 않아요 (연주 중 실수 방지)" checked={s.zoomLocked} onChange={(v) => p.update({ zoomLocked: v })} />
              <p className="muted small">
                태블릿: 두 손가락으로 벌리고 오므려 확대, 한 손가락으로 끌어서 이동, 가운데를 두 번 탭하면 2배와 화면 맞춤을 오가요. 화면 맞춤일 땐 좌우로 밀어서 넘길 수
                있어요. 정한 배율은 악보마다 저장돼요.
              </p>

              <h3>카메라</h3>
              <Toggle label="거울 모드" desc="내 모습을 거울처럼 보기" checked={s.mirror} onChange={(v) => p.update({ mirror: v })} />
              <Toggle label="얼굴 인식선 표시" checked={s.showMesh} onChange={(v) => p.update({ showMesh: v })} />

              <h3>성능</h3>
              <Field label="인식 횟수 (초당)">
                <Choice
                  value={s.maxFps}
                  onChange={(v) => p.update({ maxFps: v })}
                  options={[
                    { value: 10, label: '10' },
                    { value: 15, label: '15' },
                    { value: 30, label: '30' },
                  ]}
                />
              </Field>
              <p className="muted small">낮출수록 배터리·발열이 줄어요. 15면 페이지 넘김에는 충분해요.</p>
              <Field label="카메라 해상도">
                <Choice
                  value={s.resolution}
                  onChange={(v) => p.update({ resolution: v })}
                  options={[
                    { value: 'low', label: '낮음 320px' },
                    { value: 'mid', label: '중간 640px' },
                  ]}
                />
              </Field>
              <Field label="연산 장치">
                <Choice
                  value={s.delegate}
                  onChange={(v) => p.update({ delegate: v })}
                  options={[
                    { value: 'GPU', label: 'GPU' },
                    { value: 'CPU', label: 'CPU' },
                  ]}
                />
              </Field>
              <p className="muted small">
                현재: {p.activeDelegate ?? '—'} · 해상도·연산 장치는 카메라를 다시 켜야 적용돼요.
              </p>
              {p.running && (
                <button className="btn" onClick={p.onRestartCamera}>
                  카메라 다시 켜기
                </button>
              )}
            </>
          )}

          {tab === 'log' && (
            <>
              <div className="stats">
                <div>
                  <small>테스트 시간</small>
                  <strong>{formatClock(p.sessionMs)}</strong>
                </div>
                <div>
                  <small>넘김</small>
                  <strong>{stats.total}</strong>
                </div>
                <div>
                  <small>오작동</small>
                  <strong className={stats.wrong ? 'error' : ''}>{stats.wrong}</strong>
                </div>
                <div>
                  <small>분당 오작동</small>
                  <strong>{stats.perMinute.toFixed(2)}</strong>
                </div>
              </div>
              <p className="muted small">
                연주를 마친 뒤, 의도하지 않았는데 넘어간 기록을 눌러 <b>오작동</b>으로 표시하세요.
              </p>
              <Field label="악기 · 테스터">
                <input type="text" value={p.tester} placeholder="예: 바이올린 / 김OO" onChange={(e) => p.onTester(e.target.value)} />
              </Field>
              <div className="row gap">
                <button className="btn primary grow" onClick={p.onCopyReport}>
                  결과 복사
                </button>
                <button className="btn ghost" onClick={p.onClearLog}>
                  기록 초기화
                </button>
              </div>
              <ul className="log">
                {p.log.length === 0 && <li className="muted">아직 넘김 기록이 없어요.</li>}
                {p.log.map((e) => (
                  <li key={e.id}>
                    <button className={`log-item ${e.falsePositive ? 'bad' : ''}`} onClick={() => p.onToggleFalse(e.id)}>
                      <span className="mono">{formatClock(e.at)}</span>
                      <span className={e.kind === 'next' ? 'next-text' : 'prev-text'}>{e.kind === 'next' ? (
                          <span className="icon-text">
                            다음 <ChevronRight size={14} strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span className="icon-text">
                            <ChevronLeft size={14} strokeWidth={2.5} /> 이전
                          </span>
                        )}</span>
                      <span className="muted">
                        {MODE_META[e.mode].short}
                        {e.mode !== 'gaze' && ` ${formatValue(e.mode, e.peak)}`}
                      </span>
                      <span className="tag">{e.falsePositive ? '오작동' : e.cancelled ? '대기 중 취소' : '정상'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  )
}
