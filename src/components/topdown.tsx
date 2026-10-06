import { CAR } from '../domain/maneuvers/geometry'
import type { SiteRect } from '../domain/maneuvers/types'
import { toDeg } from './topdownGeom'

/** Felülnézeti rajzelemek (manőverek, hibakód-leckék): méterben, a 3D jelenet koordinátáival */

/** Téglalap a helyszínről; a 3D jelenet rotY-ja felülnézetben ellentétes irányú forgatás */
export function SiteBox({ r, fill }: { r: SiteRect; fill: string }) {
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
export function CarShape({ color, ghost, own, liveWheels }: { color: string; ghost?: boolean; own?: boolean; liveWheels?: boolean }) {
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
