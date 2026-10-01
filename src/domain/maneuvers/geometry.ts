/**
 * A manőverek geometriája: a saját autó valós méretekkel, egyenes és körív menti mozgással (a hátsó tengely közepe
 * körül, mint a valóságban). A felülnézeti rajz, a 3D nézet és a tesztek is ebből számolnak, így az utasítás, a kép és
 * a valóság nem válhat el egymástól.
 *
 * Koordináták (mint a 3D jelenetben): x kelet felé, z dél felé (méter). Az irány (heading) radiánban: 0 = észak (−z),
 * π/2 = kelet; jobbra kanyarodva nő. A póz a hátsó tengely közepe.
 */

export const CAR = {
  length: 4.4,
  width: 1.8,
  wheelbase: 2.65,
  /** A hátsó tengely és a hátsó lökhárító távolsága */
  rearOverhang: 0.85,
  /** A hátsó tengely és az első lökhárító távolsága */
  front: 3.55,
} as const

/**
 * A hátsó tengely közepének fordulókör-sugara teljes kormánykitérésnél (m). Egy átlagos kisautó fordulóköre
 * (járdától járdáig) kb. 10,5–11 m: ehhez a hátsó tengely közepén kb. 4 m tartozik.
 */
export const R_MIN = 4.0
/** Teljes kormánykitéréshez ennyi kormányfordulat kell középállásból */
export const FULL_LOCK_TURNS = 1.5

export interface Pose {
  x: number
  z: number
  heading: number
}

export type Gear = 'D' | 'R'

export type Segment =
  | { kind: 'straight'; dist: number; gear: Gear }
  | { kind: 'arc'; radius: number; angle: number; dir: 'left' | 'right'; gear: Gear }

export type CarPoint = 'rear_axle' | 'front_axle' | 'rear_bumper' | 'front_bumper' | 'mirror_left' | 'mirror_right' | 'driver' | 'front_right' | 'front_left' | 'rear_right' | 'rear_left'

/** A pontok helye a kocsihoz kötve: [előre, jobbra] a hátsó tengely közepétől (m) */
const POINTS: Record<CarPoint, [number, number]> = {
  rear_axle: [0, 0],
  front_axle: [CAR.wheelbase, 0],
  rear_bumper: [-CAR.rearOverhang, 0],
  front_bumper: [CAR.front, 0],
  mirror_left: [1.95, -1.0],
  mirror_right: [1.95, 1.0],
  // A vezető szeme (balkormányos autó): a bal első ülésen
  driver: [1.45, -0.37],
  front_right: [CAR.front, CAR.width / 2],
  front_left: [CAR.front, -CAR.width / 2],
  rear_right: [-CAR.rearOverhang, CAR.width / 2],
  rear_left: [-CAR.rearOverhang, -CAR.width / 2],
}

export const deg = (d: number) => (d * Math.PI) / 180

export function forward(h: number): [number, number] {
  return [Math.sin(h), -Math.cos(h)]
}

export function right(h: number): [number, number] {
  return [Math.cos(h), Math.sin(h)]
}

/** A kocsihoz kötött pont ([előre, jobbra]) a világban */
export function carToWorld(p: Pose, f: number, r: number): [number, number] {
  const [fx, fz] = forward(p.heading)
  const [rx, rz] = right(p.heading)
  return [p.x + fx * f + rx * r, p.z + fz * f + rz * r]
}

export function pointOnCar(p: Pose, point: CarPoint): [number, number] {
  const [f, r] = POINTS[point]
  return carToWorld(p, f, r)
}

/** Nyomtáv fele és a kerék mérete (m) */
const HALF_TRACK = 0.76
const WHEEL_W = 0.2
const WHEEL_L = 0.62

/** A négy kerék talppontja (téglalapok), a kormányzott kerekek elfordulása nélkül: a szegély-ellenőrzéshez */
export function wheelRects(p: Pose): [number, number][][] {
  const out: [number, number][][] = []
  for (const f of [0, CAR.wheelbase])
    for (const r of [-HALF_TRACK, HALF_TRACK]) {
      out.push([
        carToWorld(p, f - WHEEL_L / 2, r - WHEEL_W / 2),
        carToWorld(p, f - WHEEL_L / 2, r + WHEEL_W / 2),
        carToWorld(p, f + WHEEL_L / 2, r + WHEEL_W / 2),
        carToWorld(p, f + WHEEL_L / 2, r - WHEEL_W / 2),
      ])
    }
  return out
}

/** A kocsi négy sarka (bal hátsó, jobb hátsó, jobb első, bal első) */
export function carCorners(p: Pose): [number, number][] {
  return [pointOnCar(p, 'rear_left'), pointOnCar(p, 'rear_right'), pointOnCar(p, 'front_right'), pointOnCar(p, 'front_left')]
}

export function segmentLength(s: Segment): number {
  return s.kind === 'straight' ? Math.abs(s.dist) : s.radius * s.angle
}

/** A kormányzás iránya és a sebesség előjele szerint ennyit fordul a kocsi (radián, + = jobbra) */
function headingChange(s: Extract<Segment, { kind: 'arc' }>, angle: number): number {
  const sign = (s.dir === 'right' ? 1 : -1) * (s.gear === 'D' ? 1 : -1)
  return sign * angle
}

/** Egy szakasz menti póz a megtett út (0..hossz) szerint */
export function poseOnSegment(start: Pose, s: Segment, along: number): Pose {
  if (s.kind === 'straight') {
    const [fx, fz] = forward(start.heading)
    const d = (s.gear === 'D' ? 1 : -1) * along
    return { x: start.x + fx * d, z: start.z + fz * d, heading: start.heading }
  }
  // A forgáspont a kanyarodás felőli oldalon, a hátsó tengely vonalában
  const [rx, rz] = right(start.heading)
  const side = s.dir === 'right' ? 1 : -1
  const cx = start.x + rx * s.radius * side
  const cz = start.z + rz * s.radius * side
  const phi = headingChange(s, along / s.radius)
  const vx = start.x - cx
  const vz = start.z - cz
  const c = Math.cos(phi)
  const sn = Math.sin(phi)
  return { x: cx + vx * c - vz * sn, z: cz + vx * sn + vz * c, heading: start.heading + phi }
}

export function endOf(start: Pose, segments: Segment[]): Pose {
  return segments.reduce((p, s) => poseOnSegment(p, s, segmentLength(s)), start)
}

export function pathLength(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + segmentLength(s), 0)
}

/** Póz a mozgás mentén megtett út (0..teljes hossz) szerint, és az épp aktuális szakasz */
export function poseAlong(start: Pose, segments: Segment[], dist: number): { pose: Pose; segment: Segment | null } {
  let p = start
  let left = Math.max(0, dist)
  for (const s of segments) {
    const len = segmentLength(s)
    if (left <= len) return { pose: poseOnSegment(p, s, left), segment: s }
    p = poseOnSegment(p, s, len)
    left -= len
  }
  return { pose: p, segment: segments.at(-1) ?? null }
}

/** Az első kerekek elfordulása (radián, + = jobbra) */
export function wheelAngle(s: Segment | null): number {
  if (!s || s.kind === 'straight') return 0
  return (s.dir === 'right' ? 1 : -1) * Math.atan(CAR.wheelbase / s.radius)
}

/** A kormánykerék elfordulása fordulatban (+ = jobbra): teljes kitérés R_MIN-nél, a görbülettel arányosan */
export function steerTurns(s: Segment | null): number {
  if (!s || s.kind === 'straight') return 0
  return (s.dir === 'right' ? 1 : -1) * FULL_LOCK_TURNS * Math.min(1, R_MIN / s.radius)
}

/** Téglalap (pl. parkoló autó, járdaszegély) sarkai */
export function rectCorners(cx: number, cz: number, w: number, d: number, rot = 0): [number, number][] {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c] as [number, number])
}

/** Két konvex sokszög átfedése (szeparáló tengelyek) */
export function polygonsOverlap(a: [number, number][], b: [number, number][]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i]
      const [x2, z2] = poly[(i + 1) % poly.length]
      const nx = z1 - z2
      const nz = x2 - x1
      const proj = (p: [number, number][]) => p.map(([x, z]) => x * nx + z * nz)
      const pa = proj(a)
      const pb = proj(b)
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
    }
  }
  return true
}

/** Szögkülönbség (radián), −π..π */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
