import { Heap } from '../../data/streetRoute'
import { Grid } from '../world/grid'
import { cumulative, pointAt } from '../world/polyline'
import { headingOf, projectOnSegment, wrapAngle, type XZ } from '../world/project'
import type { RoadIndex } from '../world/roadIndex'
import type { Road, World } from '../world/types'

/**
 * Útbaigazítás vissza az útvonalra, ha a vezető rossz irányba fordult: a legrövidebb szabályos (egyirányúságot
 * betartó) út a következő útpontig, és rajta a kanyarodások.
 */

export interface GraphEdge {
  from: number
  to: number
  len: number
  road: Road
  /** A szakasz sorszáma az úton (pts[seg] → pts[seg+1]) és a haladás iránya rajta */
  seg: number
  dir: 1 | -1
}

export interface RoadGraph {
  out: Map<number, GraphEdge[]>
  /** A csomópontba befutó élek (visszafelé kereséshez) */
  in: Map<number, GraphEdge[]>
  coord: Map<number, XZ>
  /** Hány úton (irány nélkül) érhető el a csomópont: 3+ = kereszteződés */
  degree: Map<number, number>
  nodes: Grid<number>
}

export function buildRoadGraph(world: World): RoadGraph {
  const g: RoadGraph = { out: new Map(), in: new Map(), coord: new Map(), degree: new Map(), nodes: new Grid<number>(20) }
  const add = (m: Map<number, GraphEdge[]>, k: number, e: GraphEdge) => {
    const list = m.get(k)
    if (list) list.push(e)
    else m.set(k, [e])
  }
  const push = (e: GraphEdge) => {
    add(g.out, e.from, e)
    add(g.in, e.to, e)
  }
  for (const r of world.roads) {
    r.nodes.forEach((n, i) => {
      if (!g.coord.has(n)) {
        g.coord.set(n, r.pts[i])
        g.nodes.add(n, r.pts[i][0], r.pts[i][1], r.pts[i][0], r.pts[i][1])
      }
      g.degree.set(n, (g.degree.get(n) ?? 0) + (i === 0 || i === r.nodes.length - 1 ? 1 : 2))
    })
    for (let i = 0; i < r.nodes.length - 1; i++) {
      const len = r.cum[i + 1] - r.cum[i]
      if (r.oneway !== -1) push({ from: r.nodes[i], to: r.nodes[i + 1], len, road: r, seg: i, dir: 1 })
      if (r.oneway !== 1) push({ from: r.nodes[i + 1], to: r.nodes[i], len, road: r, seg: i, dir: -1 })
    }
  }
  return g
}

export interface DetourTurn {
  /** Távolság a kerülő elejétől (m) */
  s: number
  dir: 'left' | 'right'
  at: XZ
}

export interface Detour {
  pts: XZ[]
  cum: number[]
  turns: DetourTurn[]
  /** Az útvonal pontja (s), ahol visszaér */
  rejoinS: number
}

/** A kerülő az autó helyéből: a jelenlegi útján a haladási irányában következő csomóponttól */
export function findDetour(world: World, graph: RoadGraph, index: RoadIndex, at: XZ, heading: number, progressS: number): Detour | null {
  const hit = index.nearest(at)
  if (!hit) return null
  const r = hit.road
  const along = Math.cos(wrapAngle(heading - hit.heading)) >= 0
  const start = along ? r.nodes[hit.seg + 1] : r.nodes[hit.seg]
  if (start === undefined) return null

  // Célok: az útvonal mentén (előttünk) lévő csomópontok
  const { route } = world
  const target = new Map<number, number>()
  for (let s = progressS + 30; s <= Math.min(route.length, progressS + 600); s += 8) {
    const p = pointAt(route.pts, route.cum, s)
    for (const n of graph.nodes.near(p, 8)) {
      const c = graph.coord.get(n)
      if (c && Math.hypot(c[0] - p[0], c[1] - p[1]) <= 8 && !target.has(n)) target.set(n, s)
    }
  }
  if (!target.size) return null

  const dist = new Map<number, number>([[start, 0]])
  const back = new Map<number, number>()
  const h = new Heap<number>()
  h.push(0, start)
  let end: number | null = null
  while (h.size) {
    const top = h.pop()
    if (!top || top.k > (dist.get(top.v) ?? Infinity)) continue
    if (target.has(top.v)) {
      end = top.v
      break
    }
    if (top.k > 3000) break
    for (const e of graph.out.get(top.v) ?? []) {
      const c = top.k + e.len
      if (c >= (dist.get(e.to) ?? Infinity)) continue
      dist.set(e.to, c)
      back.set(e.to, top.v)
      h.push(c, e.to)
    }
  }
  if (end === null) return null
  const nodes: number[] = [end]
  for (let x = back.get(end); x !== undefined; x = back.get(x)) nodes.unshift(x)
  const pts: XZ[] = [at, ...nodes.map((n) => graph.coord.get(n)!)]
  const cum = cumulative(pts)

  // Kanyarodások a kerülőn: kereszteződésben legalább 35°-os irányváltozás
  const turns: DetourTurn[] = []
  for (let i = 1; i < nodes.length - 1; i++) {
    if ((graph.degree.get(nodes[i]) ?? 0) < 3) continue
    const a = graph.coord.get(nodes[i - 1])!
    const b = graph.coord.get(nodes[i])!
    const c = graph.coord.get(nodes[i + 1])!
    const d = wrapAngle(headingOf(b, c) - headingOf(a, b))
    if (Math.abs(d) < 0.6) continue
    turns.push({ s: cum[i + 1], dir: d > 0 ? 'right' : 'left', at: b })
  }
  return { pts, cum, turns, rejoinS: target.get(end)! }
}

/** Az autó helye a kerülőn (m) és a távolsága tőle */
export function onDetour(d: Detour, p: XZ): { s: number; off: number } {
  let best = { s: 0, off: Infinity }
  for (let i = 0; i < d.pts.length - 1; i++) {
    const h = projectOnSegment(p, d.pts[i], d.pts[i + 1])
    if (h.dist < best.off) best = { s: d.cum[i] + h.t * (d.cum[i + 1] - d.cum[i]), off: h.dist }
  }
  return best
}
