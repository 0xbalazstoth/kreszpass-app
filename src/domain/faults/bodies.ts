import { carCorners, rectCorners, type Pose } from '../maneuvers/geometry'
import type { ActorKind } from './types'

/** A nem személyautó szereplők mérete [szélesség, hossz] (m); a pózuk a test közepe */
export const BODY_SIZE: Record<Exclude<ActorKind, 'own' | 'car'>, [number, number]> = {
  bus: [2.55, 12],
  ambulance: [2.1, 5.6],
  bike: [0.6, 1.8],
  ped: [0.55, 0.45],
}

/** A szereplő körvonala (négy sarok) a világban */
export function bodyCorners(kind: ActorKind, p: Pose): [number, number][] {
  if (kind === 'own' || kind === 'car') return carCorners(p)
  const [w, d] = BODY_SIZE[kind]
  return rectCorners(p.x, p.z, w, d, p.heading)
}

/** A körvonal pontjai (sarkok és oldalfelezők): a távolságméréshez */
export function bodyPoints(kind: ActorKind, p: Pose): [number, number][] {
  const c = bodyCorners(kind, p)
  const mids = c.map((a, i) => {
    const b = c[(i + 1) % c.length]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number]
  })
  return [...c, ...mids]
}

/** A két szereplő legközelebbi pontpárja és távolsága (m) */
export function bodyGap(ka: ActorKind, a: Pose, kb: ActorKind, b: Pose): { d: number; from: [number, number]; to: [number, number] } {
  let best = { d: Infinity, from: [0, 0] as [number, number], to: [0, 0] as [number, number] }
  for (const p of bodyPoints(ka, a))
    for (const q of bodyPoints(kb, b)) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (d < best.d) best = { d, from: p, to: q }
    }
  return best
}
