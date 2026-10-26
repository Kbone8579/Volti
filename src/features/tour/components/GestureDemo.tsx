/** 고개를 돌린 채 잠깐 멈추면 → 막대가 차고 → 악보가 넘어가는 짧은 반복 그림 */
export function GestureDemo({ side = 'right' }: { side?: 'right' | 'left' }) {
  const staff = (y: number) => (
    <g className="gd-staff">
      {[0, 3, 6].map((k) => (
        <line key={k} x1="113" x2="145" y1={y + k} y2={y + k} />
      ))}
    </g>
  )
  return (
    <svg className={`gesture-demo ${side}`} viewBox="0 0 168 86" role="img" aria-label="고개를 돌린 채 잠깐 멈추면 악보가 넘어가는 그림">
      <g className="gd-head">
        <ellipse cx="42" cy="38" rx="19" ry="23" className="gd-face" />
        <g className="gd-feat">
          <circle cx="35.5" cy="35" r="2.3" />
          <circle cx="48.5" cy="35" r="2.3" />
          <path d="M42 39 l-2.6 7 h4.2" className="gd-line" />
          <path d="M36 51.5 q6 3.6 12 0" className="gd-line" />
        </g>
      </g>
      <rect x="22" y="74" width="40" height="5" rx="2.5" className="gd-track" />
      <rect x="22" y="74" width="40" height="5" rx="2.5" className="gd-fill" />
      <path d="M78 42 h16 m-6 -6 l6 6 l-6 6" className="gd-arrow" />
      <g>
        <rect x="106" y="10" width="46" height="64" rx="3" className="gd-page" />
        {staff(22)}
        {staff(38)}
        {staff(54)}
        <text x="146" y="70" className="gd-num">
          2
        </text>
      </g>
      <g className="gd-top">
        <rect x="106" y="10" width="46" height="64" rx="3" className="gd-page" />
        {staff(22)}
        {staff(38)}
        {staff(54)}
        <text x="146" y="70" className="gd-num">
          1
        </text>
      </g>
    </svg>
  )
}
