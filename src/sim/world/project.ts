import type { LngLat } from '../../lib/geo'

/**
 * Földrajzi koordináták és a szimulátor síkja (méter) közötti átváltás. A sík középpontja az útvonal eleje;
 * x kelet felé, z dél felé nő (mint a többi 3D jelenetben). Néhány km-es területen az equirektanguláris közelítés
 * centiméteres pontosságú.
 */

export type XZ = [number, number]

export interface Projection {
  lng0: number
  lat0: number
  /** Méter / fok kelet–nyugati és észak–déli irányban */
  kx: number
  kz: number
}

const M_PER_DEG = 111_320

export function makeProjection([lng0, lat0]: LngLat): Projection {
  return { lng0, lat0, kx: M_PER_DEG * Math.cos((lat0 * Math.PI) / 180), kz: M_PER_DEG }
}

export function toLocal(p: Projection, [lng, lat]: LngLat | number[]): XZ {
  return [(lng - p.lng0) * p.kx, -(lat - p.lat0) * p.kz]
}

export function toLngLat(p: Projection, [x, z]: XZ): LngLat {
  return [p.lng0 + x / p.kx, p.lat0 - z / p.kz]
}

/** Irány (heading) két pont között: 0 = észak (−z), π/2 = kelet */
export function headingOf(a: XZ, b: XZ): number {
  return Math.atan2(b[0] - a[0], -(b[1] - a[1]))
}

/** Szög normalizálása (−π, π] közé */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI)
  if (x > Math.PI) x -= 2 * Math.PI
  if (x <= -Math.PI) x += 2 * Math.PI
  return x
}

export function dist(a: XZ, b: XZ): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** A pont vetülete az a–b szakaszra: t ∈ [0,1], a vetület, és az előjeles oldaltávolság (+ = jobbra az a→b irányhoz) */
export function projectOnSegment(p: XZ, a: XZ, b: XZ): { t: number; at: XZ; lateral: number; dist: number } {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const len2 = vx * vx + vz * vz
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2
  t = Math.max(0, Math.min(1, t))
  const at: XZ = [a[0] + vx * t, a[1] + vz * t]
  const len = Math.sqrt(len2) || 1
  // Jobbra mutató normális (heading szerinti jobb): menetirány (vx, vz) → jobb (−vz, vx)
  const lateral = ((p[0] - a[0]) * -vz + (p[1] - a[1]) * vx) / len
  return { t, at, lateral, dist: dist(p, at) }
}
