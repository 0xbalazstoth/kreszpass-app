/** Kormánykerék-ikon: a fordulat szerint elforgatva (1,5 fordulatnál a jelölés is körbefordul) */
export function Wheel({ turns }: { turns: number }) {
  return (
    <svg viewBox="-12 -12 24 24" className="steer-icon" aria-hidden>
      <g transform={`rotate(${turns * 360})`}>
        <circle r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle r="2.6" fill="currentColor" />
        <path d="M-9.5 1 L-2.6 0.5 M9.5 1 L2.6 0.5 M0 2.6 L0 9.6" stroke="currentColor" strokeWidth="2.2" />
        <rect x="-1.2" y="-11.5" width="2.4" height="3" fill="#f59e0b" />
      </g>
    </svg>
  )
}
