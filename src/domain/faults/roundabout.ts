import type { Pose, Segment } from '../maneuvers/geometry'
import type { SiteRect } from '../maneuvers/types'
import { arcL, arcR, st } from './motion'
import type { World, WorldSign } from './types'
import { buildingRow, LANE } from './world'

/**
 * Körforgalom: a középpont az origó, a körpálya belső sugara 7 m, külső 14 m (mint a 3D kérdésjelenetekben).
 * Az ágak egyenletesen állnak; a 0. ág délen van (onnan érkezünk észak felé). Az ág szögét a 3D jelenet
 * egyezménye szerint adjuk meg: irányvektora (cos a, −sin a), így a déli ág a = −π/2, a keleti a = 0.
 * A körben az óramutató járásával ellentétesen (felülről nézve) haladunk.
 */

export const RING_INNER = 7
export const RING_OUTER = 14
/** A behajtó és a kihajtó ív sugara (a hátsó tengely közepén) */
const TURN_R = 8

export const armAngle = (k: number, arms = 4) => -Math.PI / 2 + (k * 2 * Math.PI) / arms
const dirOf = (a: number): [number, number] => [Math.cos(a), -Math.sin(a)]
/** Az ágra merőleges egységvektor: a befelé haladók jobb keze felé */
const perpOf = (a: number): [number, number] => [Math.sin(a), Math.cos(a)]

/** A körpálya sávjának középvonala */
export function ringRadius(lanes: 1 | 2, lane: 'inner' | 'outer' = 'outer'): number {
  if (lanes === 1) return (RING_INNER + RING_OUTER) / 2
  const w = (RING_OUTER - RING_INNER) / 2
  return lane === 'inner' ? RING_INNER + w / 2 : RING_OUTER - w / 2
}

function armRect(a: number, from: number, to: number, w: number, across = 0): SiteRect {
  const [dx, dz] = dirOf(a)
  const [px, pz] = perpOf(a)
  const m = (from + to) / 2
  return { x: dx * m + px * across, z: dz * m + pz * across, w, d: to - from, rotY: a - Math.PI / 2 }
}

/** Pont az ágon: `along` távolságra a középponttól, `across` oldalt (+ = a befelé haladók jobb keze felé) */
export function onArm(k: number, along: number, across: number, arms = 4): [number, number] {
  const a = armAngle(k, arms)
  const [dx, dz] = dirOf(a)
  const [px, pz] = perpOf(a)
  return [dx * along + px * across, dz * along + pz * across]
}

/** Póz az ágon befelé (a középpont felé) haladva, a befelé vezető sáv közepén */
export function inbound(k: number, along: number, arms = 4): Pose {
  const [x, z] = onArm(k, along, LANE / 2, arms)
  // A középpont felé mutató irány: a déli ágon észak (0)
  return { x, z, heading: -armAngle(k, arms) - Math.PI / 2 }
}

export interface RoundaboutOpts {
  arms?: number
  lanes?: 1 | 2
  /** Az ágak hossza a középponttól */
  arm?: number
  /** Zebra az ágakon (a körpályától ennyire) */
  zebraAt?: number
}

export function roundabout(o: RoundaboutOpts = {}): World {
  const n = o.arms ?? 4
  const L = o.arm ?? 70
  const R = RING_OUTER
  const asphalt: SiteRect[] = []
  const markings: SiteRect[] = []
  const signs: WorldSign[] = []
  for (let k = 0; k < n; k++) {
    const a = armAngle(k, n)
    asphalt.push(armRect(a, R - 2, L, 2 * LANE))
    for (let p = R + 4; p < L; p += 6) markings.push(armRect(a, p, p + 3, 0.15))
    // Cápafogak a befelé vezető sávban, a körpálya szélén
    for (const off of [0.4, 1.2, 2.0, 2.8]) markings.push({ ...armRect(a, R + 0.75, R + 1.25, 0.5, off) })
    if (o.zebraAt) for (let off = -LANE + 0.5; off < LANE - 0.2; off += 0.9) markings.push(armRect(a, R + o.zebraAt, R + o.zebraAt + 3, 0.5, off))
    // Tábla a behajtás előtt, a befelé haladók jobb oldalán: elsőbbségadás kötelező és körforgalom
    const [sx, sz] = onArm(k, R + 2.5, LANE + 1.2, n)
    const facing = -a - Math.PI / 2
    signs.push({ code: 'B-001', x: sx, z: sz, facing }, { code: 'D-017', x: onArm(k, R + 4.2, LANE + 1.2, n)[0], z: onArm(k, R + 4.2, LANE + 1.2, n)[1], facing })
  }
  if ((o.lanes ?? 1) === 2) {
    const r = (RING_INNER + R) / 2
    for (let i = 0; i < 48; i += 2) {
      const a = (i / 48) * Math.PI * 2
      const [dx, dz] = dirOf(a)
      markings.push({ x: dx * r, z: dz * r, w: 0.15, d: 1.0, rotY: a })
    }
  }
  return {
    asphalt,
    sidewalks: [],
    markings,
    signs,
    ring: { inner: RING_INNER, outer: R },
    buildings: [...buildingRow(LANE + 6, R + 10, L, 7), ...buildingRow(-(LANE + 6), R + 10, L, 8)],
    bounds: [-34, -34, 34, 46],
  }
}

/** A be- és kihajtó ív adatai r sugarú körsávhoz: hol kezdődik a behajtó ív, mennyit fordul, és hol érinti a kört */
function ringGeom(r: number) {
  const Re = TURN_R
  const off = LANE / 2
  // Behajtó ív: középpontja (off + Re, z0), és a körrel (r sugár) kívülről érintkezik
  const z0 = Math.sqrt((r + Re) ** 2 - (off + Re) ** 2)
  const theta = Math.acos((off + Re) / (r + Re))
  const px = ((off + Re) * r) / (r + Re)
  const pz = (z0 * r) / (r + Re)
  // Az érintési pont szöge a körön (pont = r·(cos ψ, −sin ψ)); a kihajtás a déli ág tükörképe
  return { Re, z0, theta, psiIn: Math.atan2(-pz, px), psiOutSouth: Math.atan2(-pz, -px) }
}

const toDeg = (x: number) => (x * 180) / Math.PI

/** A k. ágon való kihajtás érintési pontjának szöge a körön */
export function ringExitPsi(k: number, r: number, arms = 4): number {
  return ringGeom(r).psiOutSouth + (armAngle(k, arms) - armAngle(0, arms))
}

/** A k. ágon való behajtás érintési pontjának szöge a körön */
export function ringEntryPsi(k: number, r: number, arms = 4): number {
  return ringGeom(r).psiIn + (armAngle(k, arms) - armAngle(0, arms))
}

/** Körözés a ψ0 szögtől a ψ1 szögig (az óramutatóval ellentétesen, legalább egy kis szakasz) */
export function ringArc(psi0: number, psi1: number, r: number): Segment {
  let alpha = psi1 - psi0
  while (alpha <= 0.05) alpha += Math.PI * 2
  while (alpha > Math.PI * 2 + 0.05) alpha -= Math.PI * 2
  return arcL(r, toDeg(alpha))
}

/** Kihajtás a körből (a kihajtás érintési pontjától): jobb ív, majd `after` méter egyenesen */
export function ringExitTail(r: number, after = 20): Segment[] {
  const g = ringGeom(r)
  return [arcR(g.Re, toDeg(g.theta)), st(after)]
}

/** Behajtás a k. ágon `from` távolságról: egyenes, majd jobb ív a körre (a végén ψ = ringEntryPsi) */
export function ringEntry(r: number, from: number): Segment[] {
  const g = ringGeom(r)
  return [st(from - g.z0), arcR(g.Re, toDeg(g.theta))]
}

/**
 * Út a körforgalmon át: a 0. ágon befelé (a megadott távolságról), behajtás jobb ívvel, körözés a körpályán, majd
 * kihajtás jobb ívvel a `exit`. ágon, és onnan `after` métert kifelé. A két ív érintőlegesen csatlakozik a körhöz.
 */
export function ringRoute(exit: number, opts: { from: number; after?: number; r?: number; arms?: number }): { path: Segment[]; entryAt: number; exitAt: number } {
  const n = opts.arms ?? 4
  const r = opts.r ?? ringRadius(1)
  const g = ringGeom(r)
  const entry = ringEntry(r, opts.from)
  const ring = ringArc(ringEntryPsi(0, r, n), ringExitPsi(exit, r, n), r)
  const path: Segment[] = [...entry, ring, ...ringExitTail(r, opts.after ?? 20)]
  const entryAt = opts.from - g.z0
  const exitAt = entryAt + g.Re * g.theta + (ring.kind === 'arc' ? r * ring.angle : 0)
  return { path, entryAt, exitAt }
}
