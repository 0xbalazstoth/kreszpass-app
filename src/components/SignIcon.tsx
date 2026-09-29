import type { SignType } from '../domain/questions'

interface Props {
  type: SignType
  speed?: number
  size?: number
  /** SVG-n belüli elhelyezéshez */
  x?: number
  y?: number
}

/** Egyszerűsített magyar (bécsi egyezmény szerinti) jelzőtáblák */
export function SignGlyph({ type, speed, size = 40, x = 0, y = 0 }: Props) {
  const s = size / 100
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${s})`
  switch (type) {
    case 'stop':
      return (
        <g transform={t} aria-label="STOP tábla">
          <polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" fill="#fff" />
          <polygon points="32,7 68,7 93,32 93,68 68,93 32,93 7,68 7,32" fill="#d71920" />
          <text x="50" y="61" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">
            STOP
          </text>
        </g>
      )
    case 'give_way':
      return (
        <g transform={t} aria-label="Elsőbbségadás kötelező tábla">
          <polygon points="2,6 98,6 50,94" fill="#d71920" />
          <polygon points="17,15 83,15 50,76" fill="#fff" />
        </g>
      )
    case 'priority_road':
      return (
        <g transform={t} aria-label="Főútvonal tábla">
          <polygon points="50,1 99,50 50,99 1,50" fill="#fff" stroke="#222" strokeWidth="2" />
          <polygon points="50,20 80,50 50,80 20,50" fill="#f6c000" />
        </g>
      )
    case 'speed':
      return (
        <g transform={t} aria-label={`${speed} km/h sebességkorlátozás`}>
          <circle cx="50" cy="50" r="48" fill="#d71920" />
          <circle cx="50" cy="50" r="36" fill="#fff" />
          <text
            x="50"
            y="63"
            textAnchor="middle"
            fontSize={speed && speed >= 100 ? 32 : 40}
            fontWeight="800"
            fill="#111"
            fontFamily="Arial, sans-serif"
          >
            {speed ?? ''}
          </text>
        </g>
      )
    case 'crossing':
      return (
        <g transform={t} aria-label="Kijelölt gyalogos-átkelőhely tábla">
          <rect x="2" y="2" width="96" height="96" rx="8" fill="#1060b0" />
          <polygon points="50,12 90,86 10,86" fill="#fff" />
          <rect x="24" y="72" width="52" height="5" fill="#111" />
          <circle cx="52" cy="38" r="5" fill="#111" />
          <path d="M51 44 L46 60 L40 70 M47 58 L56 70 M50 48 L60 54" stroke="#111" strokeWidth="5" strokeLinecap="round" fill="none" />
        </g>
      )
    case 'roundabout':
      return (
        <g transform={t} aria-label="Körforgalom tábla">
          <circle cx="50" cy="50" r="48" fill="#1060b0" />
          {[0, 120, 240].map((r) => (
            <g key={r} transform={`rotate(${r} 50 50)`}>
              <path d="M50 18 A32 32 0 0 1 78 34" stroke="#fff" strokeWidth="9" fill="none" />
              <polygon points="84,26 84,44 68,38" fill="#fff" />
            </g>
          ))}
        </g>
      )
  }
}

export function SignIcon(props: Props) {
  const size = props.size ?? 40
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" className="sign-icon">
      <SignGlyph {...props} x={size / 2} y={size / 2} />
    </svg>
  )
}
