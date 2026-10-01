import { useEffect, useMemo, useRef } from 'react'
import { stepStarts } from '../../domain/maneuvers/check'
import { CAR, pathLength, pointOnCar, poseAlong, wheelAngle, type Pose, type Segment } from '../../domain/maneuvers/geometry'
import type { Maneuver } from '../../domain/maneuvers'
import type { SiteRect } from '../../domain/maneuvers/types'
import type { ManeuverClock } from './clock'

interface Props {
  maneuver: Maneuver
  /** Élő lejátszás; nélküle állókép: a teljes útvonal, a kiinduló és a célhelyzet */
  clock?: ManeuverClock
  /** Az aktuális lépés (a kiemelt útszakaszhoz és a referenciaponthoz) */
  step?: number
  className?: string
}

const toDeg = (r: number) => (r * 180) / Math.PI

/** Téglalap a helyszínről; a 3D jelenet rotY-ja felülnézetben ellentétes irányú forgatás */
function SiteBox({ r, fill }: { r: SiteRect; fill: string }) {
  return (
    <rect
      x={r.x - r.w / 2}
      y={r.z - r.d / 2}
      width={r.w}
      height={r.d}
      fill={fill}
      transform={r.rotY ? `rotate(${toDeg(-r.rotY)} ${r.x} ${r.z})` : undefined}
    />
  )
}

/** A kocsi felülről: a hátsó tengely közepe az origó, az eleje a −y felé (észak), mint a pózban */
function CarShape({ color, ghost, own, liveWheels }: { color: string; ghost?: boolean; own?: boolean; liveWheels?: boolean }) {
  const w = CAR.width
  const wheelRect = (x: number, y: number, angle = 0) => (
    <rect x={x - 0.1} y={y - 0.31} width={0.2} height={0.62} rx={0.05} fill="#111827" transform={angle ? `rotate(${toDeg(angle)} ${x} ${y})` : undefined} />
  )
  return (
    <g opacity={ghost ? 0.9 : 1}>
      {!ghost && (
        <>
          {wheelRect(-0.76, 0)}
          {wheelRect(0.76, 0)}
          {/* A kormányzott első kerekeket élő lejátszáskor külön, elforgatva rajzoljuk */}
          {!liveWheels && wheelRect(-0.76, -CAR.wheelbase)}
          {!liveWheels && wheelRect(0.76, -CAR.wheelbase)}
        </>
      )}
      <rect
        x={-w / 2}
        y={-CAR.front}
        width={w}
        height={CAR.length}
        rx={0.35}
        fill={ghost ? 'none' : color}
        stroke={ghost ? color : '#111827'}
        strokeWidth={ghost ? 0.08 : 0.05}
        strokeDasharray={ghost ? '0.25 0.18' : undefined}
      />
      {!ghost && (
        <>
          {/* Szélvédő és hátsó ablak: ebből látszik, merre van az eleje */}
          <rect x={-0.75} y={-CAR.front + 1.0} width={1.5} height={0.55} rx={0.1} fill={own ? '#bfdbfe' : '#cbd5e1'} />
          <rect x={-0.7} y={0.05} width={1.4} height={0.4} rx={0.1} fill={own ? '#93c5fd' : '#94a3b8'} />
          {/* Tükrök */}
          <rect x={-1.05} y={-1.95 - 0.08} width={0.15} height={0.16} fill="#111827" />
          <rect x={0.9} y={-1.95 - 0.08} width={0.15} height={0.16} fill="#111827" />
        </>
      )}
    </g>
  )
}

function transformOf(p: Pose): string {
  return `translate(${p.x} ${p.z}) rotate(${toDeg(p.heading)})`
}

/** Egy mozgás útja a hátsó tengely közepén, 20 cm-enként */
function pathPoints(start: Pose, motion: Segment[]): string {
  const len = pathLength(motion)
  const pts: string[] = []
  for (let d = 0; d <= len + 1e-6; d += 0.2) {
    const p = poseAlong(start, motion, d).pose
    pts.push(`${p.x.toFixed(2)},${p.z.toFixed(2)}`)
  }
  const end = poseAlong(start, motion, len).pose
  pts.push(`${end.x.toFixed(2)},${end.z.toFixed(2)}`)
  return pts.join(' ')
}

/**
 * Felülnézeti rajz méretarányosan: úttest, szegélyek, burkolati jelek, parkoló autók, a cél (szaggatott zöld),
 * a teljes útvonal halványan, az aktuális lépés kéken, a kocsi a valódi kerékállással, és a lépés referenciapontja.
 */
export function ManeuverDiagram({ maneuver: m, clock, step = 0, className }: Props) {
  const carRef = useRef<SVGGElement>(null)
  const frontWheels = useRef<SVGGElement>(null)
  const starts = useMemo(() => stepStarts(m), [m])
  const [w, n, e, s] = m.site.bounds

  useEffect(() => {
    if (!clock) return
    let raf = 0
    const draw = () => {
      const { pose, segment } = clock.now()
      carRef.current?.setAttribute('transform', transformOf(pose))
      const angle = toDeg(wheelAngle(segment))
      frontWheels.current?.querySelectorAll('rect').forEach((r) => {
        const x = Number(r.getAttribute('data-x'))
        r.setAttribute('transform', `rotate(${angle} ${x} ${-CAR.wheelbase})`)
      })
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [clock])

  const allPath = m.steps.map((st, i) => (st.motion.length ? pathPoints(starts[i], st.motion) : '')).filter(Boolean)
  const current = m.steps[step]
  const reversing = current?.gear === 'R'
  const ref = clock ? current?.ref : undefined
  const refPoint = ref ? pointOnCar(starts[step], ref.car) : null
  const target = m.site.target.pose
  const showTarget = m.site.target.posTol < 5

  return (
    <svg viewBox={`${w} ${n} ${e - w} ${s - n}`} className={`maneuver-diagram ${className ?? ''}`} role="img" aria-label={`${m.id} felülnézetben`}>
      <rect x={w} y={n} width={e - w} height={s - n} fill="#cfe3c6" />
      {m.site.asphalt.map((r, i) => (
        <SiteBox key={`a${i}`} r={r} fill="#6b7280" />
      ))}
      {m.site.kerbs.map((r, i) => (
        <SiteBox key={`k${i}`} r={r} fill="#d1d5db" />
      ))}
      {m.site.markings.map((r, i) => (
        <SiteBox key={`m${i}`} r={r} fill="#f9fafb" />
      ))}
      {m.site.cars.map((c, i) => (
        <g key={`c${i}`} transform={transformOf(c.pose)}>
          <CarShape color={c.color} />
        </g>
      ))}
      {showTarget && (
        <g transform={transformOf(target)}>
          <CarShape color="#16a34a" ghost />
        </g>
      )}
      {allPath.map((pts, i) => (
        <polyline key={`p${i}`} points={pts} fill="none" stroke="#1d4ed8" strokeOpacity={0.25} strokeWidth={0.08} />
      ))}
      {clock && current?.motion.length > 0 && (
        <polyline
          points={pathPoints(starts[step], current.motion)}
          fill="none"
          stroke={reversing ? '#dc2626' : '#2563eb'}
          strokeWidth={0.14}
          strokeDasharray={reversing ? '0.35 0.2' : undefined}
        />
      )}
      {ref && refPoint && (
        <g aria-label={ref.label}>
          {ref.axis === 'z' ? (
            <line x1={refPoint[0] - 3} x2={refPoint[0] + 3} y1={ref.at[1]} y2={ref.at[1]} stroke="#f59e0b" strokeWidth={0.1} strokeDasharray="0.3 0.15" />
          ) : (
            <line x1={ref.at[0]} x2={ref.at[0]} y1={refPoint[1] - 3} y2={refPoint[1] + 3} stroke="#f59e0b" strokeWidth={0.1} strokeDasharray="0.3 0.15" />
          )}
          <circle cx={refPoint[0]} cy={refPoint[1]} r={0.22} fill="#f59e0b" stroke="#111827" strokeWidth={0.05} />
        </g>
      )}
      {clock ? (
        <g ref={carRef} transform={transformOf(clock.now().pose)}>
          <CarShape color="#2563eb" own liveWheels />
          <g ref={frontWheels}>
            {[-0.76, 0.76].map((x) => (
              <rect key={x} data-x={x} x={x - 0.1} y={-CAR.wheelbase - 0.31} width={0.2} height={0.62} rx={0.05} fill="#111827" />
            ))}
          </g>
        </g>
      ) : (
        <>
          <g transform={transformOf(m.start)} opacity={0.55}>
            <CarShape color="#2563eb" own />
          </g>
          <g transform={transformOf(starts.at(-1)!)}>
            <CarShape color="#2563eb" own />
          </g>
        </>
      )}
    </svg>
  )
}
