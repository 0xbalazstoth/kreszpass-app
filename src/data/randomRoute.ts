import type { LineString } from 'geojson'
import { metersBetween, metersToDegLat, metersToDegLng, type LngLat } from '../lib/geo'
import { isDrivableWay, type OsmData, type OsmWay } from './osm'
import { buildGraph, Heap, type Graph } from './streetRoute'

/**
 * Véletlen gyakorló útvonal a helyi OpenStreetMap-adatokból. Hurok, mint a vizsgán: ugyanoda ér vissza, ahonnan
 * indult, néhány véletlen fordulóponton át, a szabályos (egyirányúságot betartó) utakon. A fordulópontok egy kör
 * mentén vannak, a kör sugarát addig igazítjuk, amíg az útvonal hossza a kértnek megfelelő nem lesz.
 */

export interface RandomRouteOptions {
  /** A kívánt hossz (m) */
  lengthM: number
  /** A terület (pl. kerület) határán belül van-e a pont; a fordulópontok csak ezen belül lehetnek */
  inside?: (p: LngLat) => boolean
  /** E pont közelében induljon */
  near?: LngLat
  rnd?: () => number
}

export interface RandomRoute {
  line: LineString
  /** Utcaváltások helye (ezek lesznek az útpontok) */
  junctions: LngLat[]
  lengthM: number
  /** Az érintett utcák sorrendben (a névtelen szakaszok nélkül) */
  streets: string[]
}

/** Autópályára nem visz a gyakorló útvonal */
const AVOID = new Set(['motorway', 'motorway_link'])
/** Az út típusa szerinti költségszorzó: a vizsgaútvonalak főleg rendes utcákon és főutakon vezetnek */
const COST: Record<string, number> = { trunk: 1.6, trunk_link: 1.6, unclassified: 1.2, residential: 1.15, living_street: 4, road: 2 }
/** Indulópont és fordulópont ezeken az utakon lehet (lakó-pihenő övezetben, névtelen úton nem) */
const ANCHOR = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential'])
/** Négy pont (indulás + három fordulópont) egy r sugarú körön: az útvonal kb. ennyiszer r hosszú */
const LOOP_FACTOR = 7
/** Ennyiszer próbálunk új indulóponttal, ha egy pont nem érhető el (pl. zsákutca egyirányú utcában) */
const STARTS = 8
/** Egy indulópontnál ennyiszer igazítjuk a sugarat */
const RESIZES = 5
/** Ennyi eltérés a kért hossztól még jó */
const TOLERANCE = 0.15

export interface Step {
  node: number
  /** Az út, amelyen ehhez a csomóponthoz értünk (az elsőnél -1) */
  way: number
}

/** Legolcsóbb szabályos út két csomópont között; a lépések a célig (a kezdőpont nélkül) */
function cheapest(g: Graph, factor: Map<number, number>, from: number, to: number): Step[] | null {
  const dist = new Map<number, number>([[from, 0]])
  const back = new Map<number, Step & { from: number }>()
  const h = new Heap<number>()
  h.push(0, from)
  while (h.size) {
    const top = h.pop()
    if (!top || top.k > (dist.get(top.v) ?? Infinity)) continue
    if (top.v === to) {
      const steps: Step[] = []
      for (let x = to; x !== from; ) {
        const b = back.get(x)
        if (!b) return null
        steps.push({ node: x, way: b.way })
        x = b.from
      }
      return steps.reverse()
    }
    for (const e of g.out.get(top.v) ?? []) {
      const c = top.k + e.len * (factor.get(e.way) ?? 1)
      if (c >= (dist.get(e.to) ?? Infinity)) continue
      dist.set(e.to, c)
      back.set(e.to, { node: e.to, way: e.way, from: top.v })
      h.push(c, e.to)
    }
  }
  return null
}

/**
 * Oda-vissza kitérők elhagyása (A → B → A): két fordulópont között a legrövidebb út néha bemegy egy utcába, és
 * ugyanott visszafordul. Kétirányú úton ez elhagyható, az útvonal folytonos marad.
 */
export function dropSpikes(steps: Step[]): Step[] {
  const out: Step[] = []
  for (const s of steps) {
    const last = out[out.length - 1]
    if (last && last.node === s.node) continue
    if (out.length >= 2 && out[out.length - 2].node === s.node) {
      out.pop()
      continue
    }
    out.push(s)
  }
  // A hurok elején és végén ugyanaz a kitérő: az indulópont odébb kerül
  while (out.length > 3 && out[1].node === out[out.length - 2].node) {
    out.pop()
    out.shift()
    out[0] = { node: out[0].node, way: -1 }
  }
  return out
}

function offset([lng, lat]: LngLat, east: number, north: number): LngLat {
  return [lng + metersToDegLng(east, lat), lat + metersToDegLat(north)]
}

export function randomRoute(osm: OsmData, opts: RandomRouteOptions): RandomRoute {
  const rnd = opts.rnd ?? Math.random
  const inside = opts.inside ?? (() => true)
  const ways = osm.elements.filter(
    (e): e is OsmWay => e.type === 'way' && isDrivableWay(e) && !AVOID.has(e.tags?.highway ?? '') && e.geometry?.length >= 2,
  )
  const g = buildGraph(ways)
  const wayById = new Map(ways.map((w) => [w.id, w]))
  const factor = new Map(ways.map((w) => [w.id, COST[w.tags?.highway ?? ''] ?? 1]))

  // Fordulópontnak jó csomópontok: kereszteződés (legalább két út találkozik) rendes utcán, a területen belül
  const anchors: Array<{ id: number; at: LngLat }> = []
  for (const [id, set] of g.waysAt) {
    const at = g.coord.get(id)
    if (!at || set.size < 2 || !inside(at)) continue
    if ([...set].some((w) => ANCHOR.has(wayById.get(w)?.tags?.highway ?? ''))) anchors.push({ id, at })
  }
  if (anchors.length < 4) throw new Error('Ezen a területen nincs elég utca egy útvonalhoz. Adj meg nagyobb területet (pl. várost vagy kerületet).')

  const nearestAnchor = (p: LngLat) => anchors.reduce((best, a) => (metersBetween(a.at, p) < metersBetween(best.at, p) ? a : best))

  /** Hurok az indulópontból, a fordulópontok egy r sugarú körön; null, ha valamelyik pont nem érhető el */
  function loop(start: { id: number; at: LngLat }, r: number, phi: number, dir: 1 | -1): Step[] | null {
    const center = offset(start.at, r * Math.cos(phi), r * Math.sin(phi))
    const points = [start.id]
    for (let i = 1; i <= 3; i++) {
      const a = phi + Math.PI + (dir * i * Math.PI) / 2
      const p = nearestAnchor(offset(center, r * Math.cos(a), r * Math.sin(a)))
      if (!points.includes(p.id)) points.push(p.id)
    }
    if (points.length < 3) return null
    points.push(start.id)
    const steps: Step[] = [{ node: start.id, way: -1 }]
    for (let i = 0; i < points.length - 1; i++) {
      const part = cheapest(g, factor, points[i], points[i + 1])
      if (!part) return null
      steps.push(...part)
    }
    return dropSpikes(steps)
  }

  const lengthOf = (steps: Step[]) => {
    let m = 0
    for (let i = 1; i < steps.length; i++) m += metersBetween(g.coord.get(steps[i - 1].node)!, g.coord.get(steps[i].node)!)
    return m
  }

  // Indulópont: a megadott pont környékén (ha van), különben bárhol a területen
  const pool = opts.near ? anchors.filter((a) => metersBetween(a.at, opts.near!) < Math.max(opts.lengthM / LOOP_FACTOR, 800)) : anchors
  const starts = pool.length ? pool : anchors

  let best: { steps: Step[]; len: number } | null = null
  for (let s = 0; s < STARTS; s++) {
    const start = starts[Math.floor(rnd() * starts.length)]
    const phi = rnd() * 2 * Math.PI
    const dir = rnd() < 0.5 ? 1 : -1
    let r = opts.lengthM / LOOP_FACTOR
    for (let k = 0; k < RESIZES; k++) {
      const steps = loop(start, r, phi, dir)
      if (!steps || steps.length < 3) break
      const len = lengthOf(steps)
      if (!best || Math.abs(len - opts.lengthM) < Math.abs(best.len - opts.lengthM)) best = { steps, len }
      const ratio = len / opts.lengthM
      if (Math.abs(ratio - 1) <= TOLERANCE) return finish(best.steps, best.len)
      r *= Math.min(2, Math.max(0.5, 1 / ratio))
    }
  }
  if (!best || best.len < opts.lengthM * 0.3) throw new Error('Nem sikerült útvonalat összeállítani ezen a területen. Próbáld újra, vagy adj meg nagyobb területet.')
  return finish(best.steps, best.len)

  function finish(steps: Step[], lengthM: number): RandomRoute {
    const coords = steps.map((s) => g.coord.get(s.node)!)
    // Utcaváltások: ahol a (nem üres) utcanév megváltozik; a névtelen összekötők nem számítanak
    const junctions: LngLat[] = []
    const streets: string[] = []
    let current = ''
    for (const [i, s] of steps.entries()) {
      const name = wayById.get(s.way)?.tags?.name ?? ''
      if (!name || name === current) continue
      if (current) junctions.push(coords[i - 1])
      streets.push(name)
      current = name
    }
    return { line: { type: 'LineString', coordinates: coords }, junctions, lengthM, streets }
  }
}
