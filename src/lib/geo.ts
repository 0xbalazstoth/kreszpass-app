import { along, bearing, length, lineString, nearestPointOnLine, point } from '@turf/turf'
import type { Feature, LineString, Position } from 'geojson'

export type LngLat = [number, number]

/** Előre felépített útvonal-geometria gyors lekérdezésekhez */
export class RouteGeom {
  readonly feature: Feature<LineString>
  readonly length: number

  constructor(line: LineString) {
    if (line.coordinates.length < 2) throw new Error('Az útvonalnak legalább két pontja kell legyen')
    this.feature = lineString(line.coordinates)
    this.length = length(this.feature, { units: 'meters' })
  }

  clampD(d: number): number {
    return Math.min(Math.max(d, 0), this.length)
  }

  pointAt(d: number): LngLat {
    const p = along(this.feature, this.clampD(d), { units: 'meters' })
    return p.geometry.coordinates as LngLat
  }

  /** Haladási irány két pont között (fok, 0–360) */
  bearingBetween(d1: number, d2: number): number {
    const a = this.pointAt(Math.min(d1, d2))
    const b = this.pointAt(Math.max(d1, d2))
    return normalizeBearing(bearing(point(a), point(b)))
  }

  bearingAt(d: number, span = 8): number {
    const lo = this.clampD(d - span)
    const hi = this.clampD(d + span)
    if (hi - lo < 1) return this.bearingBetween(Math.max(0, lo - 2 * span), hi)
    return this.bearingBetween(lo, hi)
  }

  /** Pont vetítése az útvonalra: távolság az elejétől és merőleges távolság (m) */
  project(p: LngLat | Position): { d: number; dist: number } {
    const snapped = nearestPointOnLine(this.feature, point(p as LngLat), { units: 'meters' })
    return { d: snapped.properties.location, dist: snapped.properties.dist }
  }
}

export function normalizeBearing(b: number): number {
  return ((b % 360) + 360) % 360
}

/** Előjeles irányváltozás (-180, 180], pozitív = jobbra */
export function turnDelta(bIn: number, bOut: number): number {
  let d = normalizeBearing(bOut - bIn)
  if (d > 180) d -= 360
  return d
}

export function angleDiff(a: number, b: number): number {
  return Math.abs(turnDelta(a, b))
}

/** Gyors, kis távolságokra elég pontos méterszámítás (equirektanguláris közelítés) */
export function metersBetween(a: LngLat | Position, b: LngLat | Position): number {
  const R = 6371008.8
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const dx = (b[0] - a[0]) * (Math.PI / 180) * Math.cos(lat) * R
  const dy = (b[1] - a[1]) * (Math.PI / 180) * R
  return Math.hypot(dx, dy)
}

/** Méter → fok (szélesség), a befoglaló téglalapok bővítéséhez */
export function metersToDegLat(m: number): number {
  return m / 111_320
}

export function metersToDegLng(m: number, lat: number): number {
  return m / (111_320 * Math.cos((lat * Math.PI) / 180))
}

export type BBox = [number, number, number, number]

export function bboxOf(coords: Position[], padM = 0): BBox {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [x, y] of coords) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  const dLat = metersToDegLat(padM)
  const dLng = metersToDegLng(padM, (s + n) / 2)
  return [w - dLng, s - dLat, e + dLng, n + dLat]
}

export function bboxContains(b: BBox, p: LngLat | Position): boolean {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]
}

/** Pont–szakasz távolság méterben (lokális sík közelítés) */
export function pointToPolylineMeters(p: Position, line: Position[]): number {
  const lat0 = (p[1] * Math.PI) / 180
  const kx = 111_320 * Math.cos(lat0)
  const ky = 111_320
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * kx
    const ay = (line[i][1] - p[1]) * ky
    const bx = (line[i + 1][0] - p[0]) * kx
    const by = (line[i + 1][1] - p[1]) * ky
    const vx = bx - ax
    const vy = by - ay
    const len2 = vx * vx + vy * vy
    let t = len2 === 0 ? 0 : -(ax * vx + ay * vy) / len2
    t = Math.max(0, Math.min(1, t))
    const dist = Math.hypot(ax + t * vx, ay + t * vy)
    if (dist < best) best = dist
  }
  return best
}

/** Vonal ritkítása: legfeljebb `max` pont, egyenletesen mintavételezve */
export function thinCoords(coords: Position[], max: number): Position[] {
  if (coords.length <= max) return coords
  const out: Position[] = []
  const step = (coords.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)])
  return out
}
