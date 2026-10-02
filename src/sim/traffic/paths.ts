import type { GraphEdge, RoadGraph } from '../examiner/reroute'
import { rightLaneCentre } from '../world/lanes'
import { cumulative, headingAt } from '../world/polyline'
import { headingOf, projectOnSegment, wrapAngle, type XZ } from '../world/project'
import { armFor, exitArmFor, movementOf, turnOf, type Approach, type JunctionModel, type Movement } from './junctions'

/**
 * A gépjárművek útja: véletlen bolyongás az úthálózaton (inkább egyenesen, visszafordulás nélkül, az egyirányúságot
 * betartva), a jobb szélső sáv közepére eltolva, a kereszteződésekben lekerekítve. Mellé a kereszteződések,
 * amelyeken áthalad: hol, melyik ágról és merre.
 */

export interface PathJunction {
  node: number
  movement: Movement
  /** A kereszteződés közepe az út mentén (m) */
  s: number
  /** A megállási vonal az út mentén (m) */
  lineS: number
  approach: Approach
  model: JunctionModel
}

export interface Path {
  pts: XZ[]
  cum: number[]
  length: number
  edges: GraphEdge[]
  junctions: PathJunction[]
}

/** Véletlen továbbhaladás a csomópontból; `prev` irányából nem fordul vissza */
export function randomWalk(graph: RoadGraph, start: GraphEdge, minLength: number, rnd: () => number): GraphEdge[] {
  const out = [start]
  let len = start.len
  let cur = start
  while (len < minLength) {
    const options = (graph.out.get(cur.to) ?? []).filter((e) => e.to !== cur.from)
    if (!options.length) break
    const hin = headingOf(graph.coord.get(cur.from)!, graph.coord.get(cur.to)!)
    // Egyenes folytatás (ugyanaz az út) sokkal valószínűbb, mint a kanyarodás
    const weights = options.map((e) => {
      const d = Math.abs(wrapAngle(headingOf(graph.coord.get(e.from)!, graph.coord.get(e.to)!) - hin))
      return (e.road === cur.road ? 4 : 1) * (d < 0.5 ? 3 : 1) * (e.road.rank >= cur.road.rank - 1 ? 1.5 : 1)
    })
    let r = rnd() * weights.reduce((a, b) => a + b, 0)
    let pick = options[0]
    for (let i = 0; i < options.length; i++) {
      r -= weights[i]
      if (r <= 0) {
        pick = options[i]
        break
      }
    }
    out.push(pick)
    len += pick.len
    cur = pick
  }
  return out
}

/** Visszafelé a csomóponttól legalább `back` méterre (az oda vezető élek), egyenes folytatást keresve */
export function walkBack(graph: RoadGraph, first: GraphEdge, back: number): GraphEdge[] {
  const out = [first]
  let len = first.len
  let cur = first
  while (len < back) {
    const options = (graph.in.get(cur.from) ?? []).filter((e) => e.from !== cur.to)
    if (!options.length) break
    const same = options.find((e) => e.road === cur.road) ?? options[0]
    out.unshift(same)
    len += same.len
    cur = same
  }
  return out
}

/**
 * Az élek sorából a sávközép-vonal. Az utca töréspontjaiban a két eltolt egyenes metszéspontja (a sáv közepén marad);
 * a kereszteződésekben a megállási vonaltól a kijáratig a mozgás íve (ugyanaz, amivel az ütközéseket is számoljuk).
 */
export function buildPath(graph: RoadGraph, edges: GraphEdge[], models: Map<number, JunctionModel>): Path {
  const raw: XZ[] = []
  edges.forEach((e, i) => {
    const a = graph.coord.get(e.from)!
    const b = graph.coord.get(e.to)!
    const h = headingOf(a, b)
    const lat = rightLaneCentre(e.road, e.dir === 1)
    if (i === 0) raw.push([a[0] + Math.cos(h) * lat, a[1] + Math.sin(h) * lat])
    else {
      const prev = edges[i - 1]
      const ph = headingOf(graph.coord.get(prev.from)!, graph.coord.get(prev.to)!)
      const plat = rightLaneCentre(prev.road, prev.dir === 1)
      const half = wrapAngle(h - ph) / 2
      const bis = ph + half
      const l = ((lat + plat) / 2) * Math.min(2, 1 / Math.max(0.5, Math.cos(half)))
      raw.push([a[0] + Math.cos(bis) * l, a[1] + Math.sin(bis) * l])
    }
    if (i === edges.length - 1) raw.push([b[0] + Math.cos(h) * lat, b[1] + Math.sin(h) * lat])
  })
  const rawCum = cumulative(raw)

  // A kereszteződések mozgásai (a raw[i+1] töréspont az i. él vége)
  interface Cut {
    from: number
    to: number
    curve: XZ[]
    node: number
    approach: Approach
    model: JunctionModel
    movement: Movement
  }
  const cuts: Cut[] = []
  const extra: Array<Omit<Cut, 'from' | 'to' | 'curve'>> = []
  edges.forEach((e, i) => {
    const m = models.get(e.to)
    const next = edges[i + 1]
    if (!m || !next) return
    const hin = headingOf(graph.coord.get(e.from)!, graph.coord.get(e.to)!)
    const hout = headingOf(graph.coord.get(next.from)!, graph.coord.get(next.to)!)
    const inArm = armFor(m, hin)
    const outArm = exitArmFor(m, hout)
    if (!inArm || !outArm) return
    const mv = movementOf(m, inArm, outArm)
    const v = i + 1
    const dIn = Math.hypot(mv.curve[0][0] - raw[v][0], mv.curve[0][1] - raw[v][1])
    const last = mv.curve[mv.curve.length - 1]
    const dOut = Math.hypot(last[0] - raw[v][0], last[1] - raw[v][1])
    const from = rawCum[v] - dIn
    const to = rawCum[v] + dOut
    // Egymásba érő kereszteződéseknél (pl. osztott pályás út két fele) a későbbi ívet nem rajzoljuk be, de a
    // kereszteződést nyilvántartjuk (az elsőbbség és az ütközések miatt)
    if (cuts.length && cuts[cuts.length - 1].to > from) {
      extra.push({ node: e.to, approach: { arm: inArm, turn: turnOf(hin, hout) }, model: m, movement: mv })
      return
    }
    cuts.push({ from, to, curve: mv.curve, node: e.to, approach: { arm: inArm, turn: turnOf(hin, hout) }, model: m, movement: mv })
  })

  const pts: XZ[] = []
  const marks: Array<{ cut: Cut; first: number; mid: number }> = []
  let ci = 0
  for (let k = 0; k < raw.length; k++) {
    const cut = cuts[ci]
    if (cut && rawCum[k] > cut.from) {
      const first = pts.length
      pts.push(...cut.curve)
      marks.push({ cut, first, mid: first + Math.floor(cut.curve.length / 2) })
      // A kivágott szakasz utáni első pont
      while (k < raw.length && rawCum[k] < cut.to) k++
      ci++
      k--
      continue
    }
    pts.push(raw[k])
  }
  const cum = cumulative(pts)
  const length = cum[cum.length - 1]
  const junctions: PathJunction[] = marks.map(({ cut, first, mid }) => ({
    node: cut.node,
    s: cum[mid],
    lineS: cum[first],
    approach: cut.approach,
    model: cut.model,
    movement: cut.movement,
  }))
  for (const x of extra) {
    // A csomópont vetülete a kész vonalra
    let best = { s: 0, d: Infinity }
    for (let i = 0; i < pts.length - 1; i++) {
      const h = projectOnSegment(x.model.j.at, pts[i], pts[i + 1])
      if (h.dist < best.d) best = { s: cum[i] + h.t * (cum[i + 1] - cum[i]), d: h.dist }
    }
    junctions.push({ node: x.node, s: best.s, lineS: best.s - (x.model.j.core + 2), approach: x.approach, model: x.model, movement: x.movement })
  }
  junctions.sort((a, b) => a.s - b.s)
  return { pts, cum, length, edges, junctions }
}

/** Haladási irány a vonal mentén */
export function pathHeading(p: Path, s: number): number {
  return headingAt(p.pts, p.cum, s, 2)
}
