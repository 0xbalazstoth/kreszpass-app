import { Grid } from './grid'
import { halfWidthAt } from './lanes'
import { projectOnSegment, type XZ } from './project'
import type { Junction, PavementPiece, Road, SimBuilding } from './types'

/** Járdaszélesség (m) */
export const PAVEMENT_W = 2.5

export interface RoadHit {
  road: Road
  /** A szakasz sorszáma (pts[seg] → pts[seg+1]) */
  seg: number
  /** Távolság az út elejétől (m) */
  s: number
  /** Előjeles oldaltávolság a középvonaltól, az út rajzolási irányához képest (+ = jobbra) */
  lateral: number
  /** A középvonal iránya ott (heading) */
  heading: number
  dist: number
}

interface SegRef {
  road: Road
  i: number
}

/** Pont a négyszögben (konvex, a sarkok körbe rendezve) */
export function inQuad(p: XZ, q: readonly XZ[]): boolean {
  let sign = 0
  for (let i = 0; i < q.length; i++) {
    const a = q[i]
    const b = q[(i + 1) % q.length]
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    if (cross === 0) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** A kereszteződés közepének kitöltő köre (valódi kereszteződésben kicsit nagyobb, mint a legszélesebb út) */
export function pavedCore(j: Junction): number {
  return j.arms >= 3 ? j.core + 2.5 : j.core
}

/** Pont a háromszögben, legfeljebb `pad` méterrel kívül is */
export function inTriangle(p: XZ, tri: readonly XZ[], pad = 0): boolean {
  // Az óramutató járásától független: a háromszög előjeles területe szerint igazítjuk az élek normálisát
  const area = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0])
  const sign = Math.sign(area) || 1
  for (let i = 0; i < 3; i++) {
    const a = tri[i]
    const b = tri[(i + 1) % 3]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const d = (sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))) / len
    if (d < -pad) return false
  }
  return true
}

/** Egy épület alaprajzának sarkai */
export function buildingCorners(b: SimBuilding): XZ[] {
  const c = Math.cos(b.rotY)
  const s = Math.sin(b.rotY)
  // A forgatás (three.js Y körül): x' = x·cos + z·sin, z' = −x·sin + z·cos
  const at = (lx: number, lz: number): XZ => [b.x + lx * c + lz * s, b.z - lx * s + lz * c]
  return [at(-b.w / 2, -b.d / 2), at(b.w / 2, -b.d / 2), at(b.w / 2, b.d / 2), at(-b.w / 2, b.d / 2)]
}

/**
 * Gyors térbeli lekérdezések a világban: melyik úton van egy pont, az úttesten, a járdán vagy egy házban van-e.
 */
export class RoadIndex {
  private segs = new Grid<SegRef>(25)
  private juncs = new Grid<Junction>(25)
  private paves = new Grid<PavementPiece>(20)
  private houses = new Grid<{ b: SimBuilding; corners: XZ[] }>(30)

  readonly roads: Road[]
  readonly junctions: Junction[]

  constructor(roads: Road[], junctions: Junction[]) {
    this.roads = roads
    this.junctions = junctions
    for (const road of roads)
      for (let i = 0; i < road.pts.length - 1; i++) this.segs.addSegment({ road, i }, road.pts[i], road.pts[i + 1], road.halfWidth + PAVEMENT_W + 4)
    for (const j of junctions) {
      const xs = [j.at[0] - j.radius - 4, j.at[0] + j.radius + 4, ...j.fillets.flat().map((p) => p[0])]
      const zs = [j.at[1] - j.radius - 4, j.at[1] + j.radius + 4, ...j.fillets.flat().map((p) => p[1])]
      this.juncs.add(j, Math.min(...xs) - 3, Math.min(...zs) - 3, Math.max(...xs) + 3, Math.max(...zs) + 3)
    }
  }

  setPavements(list: PavementPiece[]): void {
    for (const p of list) {
      const xs = p.quad.map((q) => q[0])
      const zs = p.quad.map((q) => q[1])
      this.paves.add(p, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs))
    }
  }

  setBuildings(list: SimBuilding[]): void {
    for (const b of list) {
      const corners = buildingCorners(b)
      const xs = corners.map((q) => q[0])
      const zs = corners.map((q) => q[1])
      this.houses.add({ b, corners }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs))
    }
  }

  /** A legközelebbi út középvonala (legfeljebb a rács ráhagyásán belül) */
  nearest(p: XZ, filter?: (r: Road) => boolean): RoadHit | null {
    let best: RoadHit | null = null
    for (const { road, i } of this.segs.at(p)) {
      if (filter && !filter(road)) continue
      const a = road.pts[i]
      const b = road.pts[i + 1]
      const h = projectOnSegment(p, a, b)
      if (best && h.dist >= best.dist) continue
      const segLen = road.cum[i + 1] - road.cum[i]
      best = { road, seg: i, s: road.cum[i] + h.t * segLen, lateral: h.lateral, heading: Math.atan2(b[0] - a[0], -(b[1] - a[1])), dist: h.dist }
    }
    return best
  }

  /** Az összes út, amelynek az úttestén van a pont (kereszteződésben több is) */
  roadsAt(p: XZ): RoadHit[] {
    const out: RoadHit[] = []
    const seen = new Map<Road, RoadHit>()
    for (const { road, i } of this.segs.at(p)) {
      const a = road.pts[i]
      const b = road.pts[i + 1]
      const h = projectOnSegment(p, a, b)
      if (h.dist > road.halfWidth + 3.6) continue
      const segLen0 = road.cum[i + 1] - road.cum[i]
      if (h.dist > halfWidthAt(road, road.cum[i] + h.t * segLen0)) continue
      const prev = seen.get(road)
      if (prev && prev.dist <= h.dist) continue
      const segLen = road.cum[i + 1] - road.cum[i]
      seen.set(road, { road, seg: i, s: road.cum[i] + h.t * segLen, lateral: h.lateral, heading: Math.atan2(b[0] - a[0], -(b[1] - a[1])), dist: h.dist })
    }
    out.push(...seen.values())
    return out
  }

  /** Kereszteződés burkolatán (a közepén vagy egy levágott sarkon) van-e a pont */
  inJunctionPaved(p: XZ, margin = 0): boolean {
    for (const j of this.juncs.at(p)) {
      if (Math.hypot(p[0] - j.at[0], p[1] - j.at[1]) <= pavedCore(j) + margin) return true
      if (j.fillets.some((tri) => inTriangle(p, tri, margin))) return true
    }
    return false
  }

  junctionAt(p: XZ, extra = 0): Junction | null {
    for (const j of this.juncs.at(p)) if (Math.hypot(p[0] - j.at[0], p[1] - j.at[1]) <= j.radius + extra) return j
    return null
  }

  /** Úttesten van-e a pont (bármelyik út burkolatán vagy kereszteződésben) */
  onAsphalt(p: XZ, margin = 0): boolean {
    for (const { road, i } of this.segs.at(p)) {
      const h = projectOnSegment(p, road.pts[i], road.pts[i + 1])
      if (h.dist > road.halfWidth + 3.6 + margin) continue
      if (h.dist <= halfWidthAt(road, road.cum[i] + h.t * (road.cum[i + 1] - road.cum[i])) + margin) return true
    }
    return this.inJunctionPaved(p, margin)
  }

  onPavement(p: XZ): boolean {
    return this.paves.at(p).some((pc) => inQuad(p, pc.quad))
  }

  /** Ház, amelyben a pont van */
  buildingAt(p: XZ): SimBuilding | null {
    for (const h of this.houses.at(p)) if (inQuad(p, h.corners)) return h.b
    return null
  }

  /** Házak a pont környezetében (az épületek ütközésvizsgálatához) */
  buildingsNear(p: XZ, r: number): SimBuilding[] {
    return this.houses.near(p, r).map((h) => h.b)
  }
}
