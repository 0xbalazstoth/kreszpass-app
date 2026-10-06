import type { LineString } from 'geojson'
import { highwayRank, isDrivableWay, isRoundaboutWay, parseMaxspeed, type OsmData, type OsmNode, type OsmWay } from '../../data/osm'
import { rngFrom } from '../rng'
import { Grid } from './grid'
import { cumulative, headingAt, offsetAt, pointAt, rightOf } from './polyline'
import { makeProjection, projectOnSegment, toLocal, wrapAngle, type XZ } from './project'
import { dividerOf, halfWidthAt, lanesRange } from './lanes'
import { inferSignage } from './signage'
import { buildingCorners, PAVEMENT_W, RoadIndex } from './roadIndex'
import { stopBack } from './junctionArms'
import { distToPoly, inPoly, streetsFor, type LaneSpec, type Poly } from './streets'
import { finishSurfaces } from './surfaces'
import type { CrossingSite, FurnitureSite, Junction, LightSite, PavementPiece, Road, SignSite, SimBuilding, StopSite, Stripe, World } from './types'

/**
 * A vezetési szimulátor világa a helyi OpenStreetMap-adatokból: az útvonal ±CORRIDOR méteres sávjának útjai valódi
 * szélességgel és sávszámmal, kereszteződések, járdák szegélykővel, burkolati jelek (felezővonal, megállási vonal,
 * zebra), táblák, jelzőlámpák, és az utak mentén (kitalált) házsorok, fák, lámpák.
 */

export interface RouteSignInput {
  code: string
  /** Távolság az útvonal elejétől (m) */
  d: number
}

export interface BuildOptions {
  /** A házak, fák elrendezésének és a lámpák fázisának magja */
  seed: number
  /** Az útvonal mentén ennyi méteren belüli utak kerülnek a világba */
  corridorM?: number
  /** Az útvonal (valódi és kikövetkeztetett) táblái */
  routeSigns?: RouteSignInput[]
}

const CORRIDOR_M = 130
/** Házak, fák csak ennyire az útvonaltól (távolabb a köd úgyis eltakarja) */
const DECOR_M = 100
const CHUNK_M = 150
const BUILDING_COLORS = ['#d6cfc4', '#c9b8a3', '#e4ddd2', '#b8b1a7', '#d9c6a5', '#c4c9cf', '#e8d5c0', '#d8c3b0']
/** Utak, amelyek mellett nincs járda (autóút, csomóponti ág, körforgalom belső oldala) */
const NO_PAVEMENT = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'])
/** Felezővonallal jelölt úttípusok (lakóutcán általában nincs) */
const MARKED = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified'])

export const chunkOf = ([x, z]: XZ): string => `${Math.floor(x / CHUNK_M)},${Math.floor(z / CHUNK_M)}`

function laneWidthOf(highway: string): number {
  const base = highway.replace(/_link$/, '')
  if (base === 'motorway' || base === 'trunk' || base === 'primary' || base === 'secondary') return 3.5
  if (base === 'tertiary') return 3.25
  if (base === 'living_street') return 2.75
  return 3.0
}

function onewayOf(w: OsmWay): 1 | -1 | 0 {
  const v = w.tags?.oneway
  if (v === '-1') return -1
  if (v === 'yes' || v === '1' || v === 'true' || isRoundaboutWay(w)) return 1
  if (v === 'no') return 0
  const hw = w.tags?.highway ?? ''
  return hw === 'motorway' || hw === 'motorway_link' ? 1 : 0
}

function makeRoad(id: number, w: OsmWay, pts: XZ[], nodes: number[]): Road {
  const tags = w.tags ?? {}
  const highway = tags.highway ?? 'residential'
  const roundabout = isRoundaboutWay(w)
  const oneway = onewayOf(w)
  const lanesTag = parseInt(tags.lanes ?? '', 10)
  const lw = laneWidthOf(highway)
  let fwd: number
  let back: number
  if (oneway !== 0) {
    const big = /^(motorway|trunk|primary|secondary)$/.test(highway)
    const n = lanesTag > 0 ? Math.min(lanesTag, 5) : big && !roundabout ? 2 : 1
    fwd = oneway === 1 ? n : 0
    back = oneway === -1 ? n : 0
  } else {
    const n = Math.max(2, lanesTag > 0 ? Math.min(lanesTag, 6) : 2)
    fwd = Math.ceil(n / 2)
    back = n - fwd
  }
  const cum = cumulative(pts)
  return {
    id,
    wayId: w.id,
    pts,
    nodes,
    cum,
    length: cum[cum.length - 1],
    // Egysávos egyirányú mellékutca a valóságban 5–6 m széles (parkolással): a sáv középen, mellette szabad hely
    halfWidth: Math.max(((fwd + back) * lw) / 2 + (roundabout ? 0.5 : 0), oneway !== 0 && !roundabout && fwd + back === 1 && !/_link$/.test(highway) ? 2.75 : 0),
    laneWidth: lw,
    lanesFwd: fwd,
    lanesBack: back,
    oneway,
    highway,
    rank: highwayRank(highway),
    priority: tags.priority_road === 'designated' || tags.priority_road === 'yes_unposted',
    name: tags.name ?? '',
    maxspeed: parseMaxspeed(tags) ?? (highway.startsWith('motorway') ? 130 : 50),
    roundabout,
    marked: !roundabout && (lanesTag > 0 || MARKED.has(highway.replace(/_link$/, ''))),
  }
}

/** Töröttvonal párhuzamos eltolása (+ = jobbra), a töréspontokban a két szakasz normálisának átlagával */
function shiftPolyline(pts: XZ[], d: number): XZ[] {
  const n = pts.length
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    const h0 = i > 0 ? Math.atan2(p[0] - a[0], -(p[1] - a[1])) : Math.atan2(b[0] - p[0], -(b[1] - p[1]))
    const h1 = i < n - 1 ? Math.atan2(b[0] - p[0], -(b[1] - p[1])) : h0
    const [r0x, r0z] = rightOf(h0)
    const [r1x, r1z] = rightOf(h1)
    let rx = r0x + r1x
    let rz = r0z + r1z
    const len = Math.hypot(rx, rz) || 1
    rx /= len
    rz /= len
    // Éles törésnél a ferde (miter) eltolás korlátozva
    const k = Math.min(2, 1 / Math.max(0.5, rx * r0x + rz * r0z))
    return [p[0] + rx * d * k, p[1] + rz * d * k]
  })
}

const DRIVE = new Set(['Driving', 'Bus'])
/** Az úttest részei (a forgalmi sávokon kívül a parkolósáv és a leállósáv is) */
const PAVED = new Set(['Driving', 'Bus', 'Parking', 'Shoulder', 'Biking', 'SharedLeftTurn', 'Construction'])
const WALK = new Set(['Sidewalk', 'Footway', 'SharedUse'])

/**
 * Lakóutcán a valóságban az úttest szélén parkolnak (Budapesten szinte mindenhol): az osm2streets-nek parkolósávot
 * adunk meg (kétirányú utcán mindkét oldalon, egyirányún a jobb oldalon), így az utca a valódihoz hasonlóan széles.
 */
function withParking(tags0: Record<string, string>, r: Road): Record<string, string> {
  // Városi utcán mindkét oldalon van járda (az osm2streets egyirányú utcán csak az egyik oldalra tenne)
  // (a körforgalomban csak a külső, jobb oldalon: belül a középsziget van; a főutak egyirányú ágai többnyire egy
  // osztott pályás út két fele, köztük nem járda, hanem elválasztósáv: ott az osm2streets dönt)
  const street = r.oneway === 0 ? /^(primary|secondary|tertiary|unclassified|residential|living_street)$/.test(r.highway) : /^(residential|living_street)$/.test(r.highway)
  const tags = street && !Object.keys(tags0).some((k) => k.startsWith('sidewalk')) ? { ...tags0, sidewalk: r.roundabout ? 'right' : 'both' } : tags0
  if (r.roundabout || Object.keys(tags).some((k) => k.startsWith('parking') || k.startsWith('shoulder'))) return tags
  // Egysávos csomóponti ág (bekötő-, kanyarodó út): a valóságban szélesebb a sávnál, leállósávval
  if (/_link$/.test(r.highway)) return r.lanesFwd + r.lanesBack === 1 ? { ...tags, shoulder: 'both' } : tags
  if (r.oneway === 0) return /^(residential|living_street|unclassified)$/.test(r.highway) ? { ...tags, 'parking:lane:both': 'parallel' } : tags
  // Egysávos egyirányú utca (bármilyen rangú): a jobb oldalán parkolnak
  if (r.lanesFwd + r.lanesBack > 1 || /^(motorway|trunk)$/.test(r.highway)) return tags
  return { ...tags, [r.oneway === 1 ? 'parking:lane:right' : 'parking:lane:left']: 'parallel' }
}

/**
 * Az osm2streets sávjai az útra: sávszám, sávszélesség, a forgalmi sávok együttes félszélessége, a járdák helye.
 * Ha a forgalmi sávok nem az OSM-vonal körül vannak (pl. csak az egyik oldalon van járda), a középvonalat a forgalmi
 * sávok közepére toljuk: a sávok és a rajzolt burkolat így egybeesik.
 */
function applyLanes(r: Road, lanes: LaneSpec[]) {
  let x = 0
  const edges = lanes.map((l) => {
    const e = { ...l, l: x, r: x + l.width }
    x += l.width
    return e
  })
  const drive = edges.filter((e) => DRIVE.has(e.type))
  if (!drive.length) return
  // Az úttest (forgalmi és parkolósávok együtt): a középvonal ennek a közepe, a félszélesség a szegélyig tart
  const paved = edges.filter((e) => PAVED.has(e.type))
  const dl = Math.min(...paved.map((e) => e.l))
  const dr = Math.max(...paved.map((e) => e.r))
  const mid = (dl + dr) / 2
  const fwd = drive.filter((e) => e.dir === 'Fwd').length
  const back = drive.length - fwd
  // Az egyirányúság a mi adatunk szerint (az osm2streets ugyanígy értelmezi; ha mégsem, a sávszám marad)
  if ((r.oneway === 1 && back > 0) || (r.oneway === -1 && fwd > 0)) return
  r.lanesFwd = fwd
  r.lanesBack = back
  r.laneWidth = drive.reduce((a, e) => a + e.width, 0) / drive.length
  r.halfWidth = (dr - dl) / 2
  r.hwStart = undefined
  r.hwEnd = undefined
  const right = edges.filter((e) => WALK.has(e.type) && e.l >= dr - 0.01)
  const left = edges.filter((e) => WALK.has(e.type) && e.r <= dl + 0.01)
  r.walkR = right.length ? [Math.min(...right.map((e) => e.l)) - mid, Math.max(...right.map((e) => e.r)) - mid] : undefined
  r.walkL = left.length ? [mid - Math.max(...left.map((e) => e.r)), mid - Math.min(...left.map((e) => e.l))] : undefined
}

/**
 * Az út középvonala és félszélessége a megrajzolt úttest szerint: a kereszteződésektől távol keresztben végigmérve
 * (medián). A sávok, a szegély, a járda helye így pontosan a látott burkolathoz igazodik (az osm2streets az
 * OSM-vonalat nem mindig az úttest közepére teszi, pl. ha csak az egyik oldalon van járda).
 */
function fitToAsphalt(r: Road, asphalt: Grid<Poly>, junctions: Grid<Poly>) {
  const on = (p: XZ) => asphalt.at(p).some((poly) => inPoly(p, poly))
  const mids: number[] = []
  const halves: number[] = []
  // Rövid útdarabon (két közeli kereszteződés között) sűrűbben és a kereszteződéshez közelebb is mérünk
  const short = r.length < 40
  // Legfeljebb kb. 10 keresztmetszet útanként (a medián ebből is megbízható)
  const step = short ? 2 : Math.max(5, (r.length - 16) / 10)
  for (let s = short ? 2 : 8; s < r.length - (short ? 2 : 8); s += step) {
    const c = pointAt(r.pts, r.cum, s)
    const clear = short ? 2.5 : 6
    if (junctions.near(c, clear).some((poly) => distToPoly(c, poly) < clear)) continue
    const h = headingAt(r.pts, r.cum, s)
    const at = (l: number) => offsetAt(r.pts, r.cum, s, l, h)
    // A középvonalhoz legközelebbi úttestpont, onnan mindkét irányban a széléig
    let start: number | null = null
    for (let k = 0; k <= 20 && start === null; k++) for (const l of [k * 0.25, -k * 0.25]) if (start === null && on(at(l))) start = l
    if (start === null) continue
    let lo = start
    let hi = start
    while (hi - start < 25 && on(at(hi + 0.25))) hi += 0.25
    while (start - lo < 25 && on(at(lo - 0.25))) lo -= 0.25
    mids.push((lo + hi) / 2)
    halves.push((hi - lo) / 2)
  }
  if (!mids.length) return
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
  const shift = median(mids)
  const half = median(halves)
  // A járdák a szegélytől kifelé (a szélességük az osm2streets szerint)
  if (r.walkR) r.walkR = [half, half + (r.walkR[1] - r.walkR[0])]
  if (r.walkL) r.walkL = [half, half + (r.walkL[1] - r.walkL[0])]
  r.halfWidth = half
  // Ha a megrajzolt úttest keskenyebb, mint a sávok együtt, a sávszám csökken (a látott burkolat számít)
  const fits = Math.max(1, Math.round((2 * half) / r.laneWidth))
  if (fits < r.lanesFwd + r.lanesBack) {
    if (r.lanesFwd === 0 || r.lanesBack === 0) {
      if (r.lanesFwd) r.lanesFwd = fits
      else r.lanesBack = fits
    } else {
      const back = Math.max(1, Math.round((fits * r.lanesBack) / (r.lanesFwd + r.lanesBack)))
      r.lanesBack = Math.min(back, fits - 1)
      r.lanesFwd = Math.max(1, fits - r.lanesBack)
    }
  }
  r.laneWidth = Math.min(r.laneWidth, (2 * half) / (r.lanesFwd + r.lanesBack))
  if (Math.abs(shift) > 0.05) {
    r.pts = shiftPolyline(r.pts, shift)
    r.cum = cumulative(r.pts)
    r.length = r.cum[r.cum.length - 1]
  }
}

/** Két irányított téglalap fedi-e egymást (szeparáló tengelyek tétele) */
function boxesOverlap(a: XZ[], b: XZ[], gap: number): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < 4; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % 4]
      const nx = -(q[1] - p[1])
      const nz = q[0] - p[0]
      const len = Math.hypot(nx, nz) || 1
      const proj = (pts: XZ[]) => pts.map(([x, z]) => (x * nx + z * nz) / len)
      const pa = proj(a)
      const pb = proj(b)
      if (Math.max(...pa) + gap < Math.min(...pb) || Math.max(...pb) + gap < Math.min(...pa)) return false
    }
  return true
}

/**
 * A kereszteződés sarkai: az útágakat irány szerint sorba rendezve, két szomszédos ág egymás felé eső szegélyvonalainak
 * metszéspontja (P) a sarok; a sarok levágása a P-ből mindkét szegély mentén R méterre lévő pontokig tart.
 */
type Arm = { u: XZ; hw: number; a: number }

function armsAt(j: Junction, list: Road[]): Arm[] {
  const arms: Arm[] = []
  for (const r of list)
    r.nodes.forEach((n, i) => {
      if (n !== j.node) return
      const s0 = r.cum[i]
      const hw = halfWidthAt(r, s0)
      const push = (s: number) => {
        const p = pointAt(r.pts, r.cum, s)
        const dx = p[0] - j.at[0]
        const dz = p[1] - j.at[1]
        const len = Math.hypot(dx, dz)
        if (len < 0.5) return
        arms.push({ u: [dx / len, dz / len], hw, a: Math.atan2(dz, dx) })
      }
      if (i < r.nodes.length - 1) push(Math.min(r.length, s0 + 6))
      if (i > 0) push(Math.max(0, s0 - 6))
    })
  return arms
}

function filletsFrom(at: XZ, arms: Arm[]): Array<[XZ, XZ, XZ]> {
  if (arms.length < 2) return []
  arms.sort((x, y) => x.a - y.a)
  const out: Array<[XZ, XZ, XZ]> = []
  for (let k = 0; k < arms.length; k++) {
    const A = arms[k]
    const B = arms[(k + 1) % arms.length]
    let theta = B.a - A.a
    if (theta <= 0) theta += 2 * Math.PI
    if (theta > 2.6 || theta < 0.15) continue
    // A egymás felé eső szegélyek normálisa
    const perp = (u: XZ): XZ => [-u[1], u[0]]
    let nA = perp(A.u)
    if (nA[0] * B.u[0] + nA[1] * B.u[1] < 0) nA = [-nA[0], -nA[1]]
    let nB = perp(B.u)
    if (nB[0] * A.u[0] + nB[1] * A.u[1] < 0) nB = [-nB[0], -nB[1]]
    // nA·hwA + t·uA = nB·hwB + s·uB
    const ox = nB[0] * B.hw - nA[0] * A.hw
    const oz = nB[1] * B.hw - nA[1] * A.hw
    const det = A.u[0] * -B.u[1] - A.u[1] * -B.u[0]
    if (Math.abs(det) < 1e-6) continue
    const t = (ox * -B.u[1] - oz * -B.u[0]) / det
    const s = (A.u[0] * oz - A.u[1] * ox) / det
    if (t < 0 || s < 0 || t > 40 || s > 40) continue
    const P: XZ = [at[0] + nA[0] * A.hw + A.u[0] * t, at[1] + nA[1] * A.hw + A.u[1] * t]
    // Hegyesszögű saroknál (éles kanyar) jobban levágjuk, hogy a kanyarodó autó elférjen
    const R = (5 + 0.4 * Math.max(A.hw, B.hw)) * (1 + Math.max(0, 1.6 - theta) * 0.8)
    out.push([P, [P[0] + A.u[0] * R, P[1] + A.u[1] * R], [P[0] + B.u[0] * R, P[1] + B.u[1] * R]])
  }
  return out
}

export function buildWorld(osm: OsmData, line: LineString, opts: BuildOptions): World {
  const rng = rngFrom(opts.seed)
  const corridor = opts.corridorM ?? CORRIDOR_M
  const proj = makeProjection(line.coordinates[0] as [number, number])

  // ---------------------------------------------------------------- útvonal
  const routePts: XZ[] = []
  for (const c of line.coordinates) {
    const p = toLocal(proj, c)
    const last = routePts[routePts.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.3) routePts.push(p)
  }
  if (routePts.length < 2) throw new Error('Az útvonal túl rövid a vezetéshez.')
  const routeCum = cumulative(routePts)
  const route = { pts: routePts, cum: routeCum, length: routeCum[routeCum.length - 1] }
  const routeGrid = new Grid<number>(50)
  for (let i = 0; i < routePts.length - 1; i++) routeGrid.addSegment(i, routePts[i], routePts[i + 1], corridor)
  const distToRoute = (p: XZ): number => {
    let best = Infinity
    for (const i of routeGrid.at(p)) best = Math.min(best, projectOnSegment(p, routePts[i], routePts[i + 1]).dist)
    return best
  }

  // ---------------------------------------------------------------- utak a folyosóban
  const roads: Road[] = []
  const roadTags = new Map<number, Record<string, string>>()
  const controlNodes: OsmNode[] = []
  for (const el of osm.elements) {
    if (el.type === 'node' && el.tags) controlNodes.push(el)
    if (el.type !== 'way' || !isDrivableWay(el) || (el.geometry?.length ?? 0) < 2) continue
    const pts = el.geometry.map((g) => toLocal(proj, [g.lon, g.lat]))
    const near = pts.map((p) => distToRoute(p) <= corridor)
    let run: number[] = []
    const flush = () => {
      if (run.length >= 2) {
        roadTags.set(roads.length, el.tags ?? {})
        roads.push(makeRoad(roads.length, el, run.map((i) => pts[i]), run.map((i) => el.nodes[i])))
      }
      run = []
    }
    for (let i = 0; i < pts.length; i++) {
      if (near[i]) run.push(i)
      else flush()
    }
    flush()
  }
  if (!roads.length) throw new Error('Az útvonal mentén nincsenek utak a térképadatokban.')

  // ---------------------------------------------------------------- valósághű utcageometria (osm2streets)
  const streets = streetsFor(roads, new Map(roads.map((r) => [r.id, withParking(roadTags.get(r.id) ?? {}, r)])), proj)
  if (streets) {
    const asphalt = new Grid<Poly>(20)
    for (const p of streets.asphalt) asphalt.add(p, p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3])
    const jpolys = new Grid<Poly>(20)
    for (const p of streets.junctions) jpolys.add(p, p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3])
    for (const r of roads) {
      const l = streets.lanes.get(r.id)
      if (l) applyLanes(r, l)
      fitToAsphalt(r, asphalt, jpolys)
    }
  }

  // ---------------------------------------------------------------- kereszteződések
  const arms = new Map<number, { at: XZ; arms: number; roads: Set<Road> }>()
  for (const r of roads)
    r.nodes.forEach((n, i) => {
      if (n < 0) return
      const e = arms.get(n) ?? { at: r.pts[i], arms: 0, roads: new Set<Road>() }
      e.arms += i === 0 || i === r.nodes.length - 1 ? 1 : 2
      e.roads.add(r)
      arms.set(n, e)
    })
  const junctions: Junction[] = []
  const junctionOf = new Map<number, Junction>()
  for (const [node, e] of arms) {
    if (e.roads.size < 2 && e.arms < 3) continue
    const maxHalf = Math.max(...[...e.roads].map((r) => r.halfWidth))
    // Valódi kereszteződésben a sarkok lekerekítettek (a szegély íve kb. 4–5 m): a burkolat ennyivel nagyobb
    const j: Junction = { node, at: e.at, radius: e.arms >= 3 ? maxHalf + 4.5 : maxHalf, core: maxHalf, arms: e.arms, fillets: [] }
    junctions.push(j)
    junctionOf.set(node, j)
  }
  // Kiszélesedés a szélesebb folytatás felé (két út csatlakozása, kereszteződés nélkül)
  for (const [node, e] of streets ? [] : arms) {
    if (e.arms !== 2 || e.roads.size !== 2) continue
    const [a, b] = [...e.roads]
    for (const [r, o] of [
      [a, b],
      [b, a],
    ] as const) {
      if (o.halfWidth <= r.halfWidth + 0.2) continue
      if (r.nodes[0] === node) r.hwStart = o.halfWidth
      if (r.nodes[r.nodes.length - 1] === node) r.hwEnd = o.halfWidth
    }
  }
  // Sarkok: a szomszédos útágak szegélyvonalainak metszéspontjánál levágott sarok (a kanyarodó autó helye)
  for (const j of streets ? [] : junctions) {
    const e = arms.get(j.node)
    if (e) j.fillets = filletsFrom(j.at, armsAt(j, [...e.roads]))
  }
  // A kereszteződés széle útáganként: ahol a középvonal kilép a kereszteződés sokszögéből
  if (streets) {
    const polys = new Grid<Poly>(20)
    for (const p of streets.junctions) polys.add(p, p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3])
    for (const j of junctions) {
      const e = arms.get(j.node)
      const poly = polys.at(j.at).find((p) => inPoly(j.at, p)) ?? polys.near(j.at, 4).find((p) => distToPoly(j.at, p) < 4)
      if (!e || !poly) continue
      const trims: Record<string, number> = {}
      for (const r of e.roads)
        r.nodes.forEach((n, i) => {
          if (n !== j.node) return
          for (const dir of [1, -1] as const) {
            if ((dir === 1 && i === 0) || (dir === -1 && i === r.nodes.length - 1)) continue
            // Az ág utolsó pontja a kereszteződés sokszögében (a csomópont maga a sokszögön kívül is eshet, pl.
            // összevont kereszteződésnél); ha az ág bele sem fut, nincs levágás (alapértelmezett megállási vonal)
            let last = -1
            for (let d = 0; d < 40; d += 0.5) {
              const sx = r.cum[i] - dir * d
              if (sx < 0 || sx > r.length) break
              if (inPoly(pointAt(r.pts, r.cum, sx), poly)) last = d
              else if (last >= 0) break
            }
            // (az összevont, hosszan elnyúló kereszteződésnél sem kerül a vonal túl messzire)
            if (last >= 0) trims[`${r.id}:${dir}`] = Math.min(14, last + 0.5)
          }
        })
      const vals = Object.values(trims)
      if (!vals.length) continue
      j.trims = trims
      j.core = Math.max(1, ...vals)
      j.radius = j.core + 1
    }
  }
  // Éles törés egy úton belül (az utca kanyarodik, de nincs kereszteződés): ott is levágott sarok kell
  let bendId = -1
  for (const r of streets ? [] : roads)
    for (let i = 1; i < r.pts.length - 1; i++) {
      if (junctionOf.has(r.nodes[i])) continue
      const s0 = r.cum[i]
      const a = pointAt(r.pts, r.cum, Math.max(0, s0 - 6))
      const b = pointAt(r.pts, r.cum, Math.min(r.length, s0 + 6))
      const p = r.pts[i]
      const ua: XZ = [a[0] - p[0], a[1] - p[1]]
      const ub: XZ = [b[0] - p[0], b[1] - p[1]]
      const la = Math.hypot(...ua)
      const lb = Math.hypot(...ub)
      if (la < 0.5 || lb < 0.5) continue
      const cos = (ua[0] * ub[0] + ua[1] * ub[1]) / (la * lb)
      // Az ágak közti szög kisebb, mint kb. 145°: éles kanyar
      if (cos < -0.82) continue
      const hw = halfWidthAt(r, s0)
      const j: Junction = { node: bendId--, at: p, radius: hw, core: hw, arms: 2, fillets: [] }
      j.fillets = filletsFrom(p, [
        { u: [ua[0] / la, ua[1] / la], hw, a: Math.atan2(ua[1], ua[0]) },
        { u: [ub[0] / lb, ub[1] / lb], hw, a: Math.atan2(ub[1], ub[0]) },
      ])
      if (j.fillets.length) junctions.push(j)
    }
  const index = new RoadIndex(roads, junctions)
  // Lekerekített szegélyek, csempékre vágott felületek
  const surfaces = streets ? finishSurfaces(streets) : null
  if (surfaces) index.setSurfaces(surfaces)

  /** A valódi kereszteződések helye az úton (s) */
  const junctionS = (r: Road) =>
    r.nodes.flatMap((n, i) => {
      const j = junctionOf.get(n)
      return j && j.arms >= 3 ? [{ s: r.cum[i], j }] : []
    })

  /** A pont más út úttestén van-e (a saját útján kívül) */
  const onOtherAsphalt = (p: XZ, self: Road, margin: number) => {
    const h = index.nearest(p, (r) => r !== self)
    return !!h && h.dist < halfWidthAt(h.road, h.s) + margin
  }

  // ---------------------------------------------------------------- járdák
  const pavements: PavementPiece[] = []
  for (const r of roads) {
    if (!streets && NO_PAVEMENT.has(r.highway)) continue
    for (const side of [1, -1] as const) {
      // A körforgalom bal oldalán a középsziget van
      if (!streets && r.roundabout && side === -1) continue
      const walk = side === 1 ? r.walkR : r.walkL
      if (streets && !walk) continue
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i]
        const b = r.pts[i + 1]
        const len = r.cum[i + 1] - r.cum[i]
        if (len < 0.5) continue
        const h = Math.atan2(b[0] - a[0], -(b[1] - a[1]))
        const [rx, rz] = rightOf(h)
        const n = Math.max(1, Math.ceil(len / 4))
        for (let k = 0; k < n; k++) {
          const t0 = k / n
          const t1 = (k + 1) / n
          const p0: XZ = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]
          const p1: XZ = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]
          const off = (p: XZ, l: number): XZ => [p[0] + rx * l * side, p[1] + rz * l * side]
          const inner = walk ? walk[0] : halfWidthAt(r, r.cum[i] + ((t0 + t1) / 2) * len)
          const outer = walk ? walk[1] : inner + PAVEMENT_W
          const mid: XZ = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
          const c = off(mid, (inner + outer) / 2)
          const edge = off(mid, inner + 0.3)
          // A valódi járdán (a gyalogosoknak és a fáknak), különben a kereszteződésektől és más utaktól távol
          if (streets) {
            if (!index.onPavement(c) || !index.onPavement(edge)) continue
          } else {
            if (index.inJunctionPaved(c, 0.6) || index.inJunctionPaved(edge, 0.3)) continue
            if (onOtherAsphalt(c, r, 0.3) || onOtherAsphalt(edge, r, 0.1)) continue
          }
          const quad: PavementPiece['quad'] = side === 1 ? [off(p0, inner), off(p1, inner), off(p1, outer), off(p0, outer)] : [off(p1, inner), off(p0, inner), off(p0, outer), off(p1, outer)]
          pavements.push({ quad, kerb: [quad[0], quad[1]], chunk: chunkOf(c) })
        }
      }
    }
  }
  index.setPavements(pavements)

  // ---------------------------------------------------------------- burkolati jelek
  const markings: Stripe[] = []
  const paintAlong = (r: Road, lateral: number, from: number, to: number, dash: number, gap: number, width = 0.13) => {
    for (let s = from; s < to - 0.5; s += dash + gap) {
      const e = Math.min(to, s + dash)
      const m = (s + e) / 2
      const h = headingAt(r.pts, r.cum, m)
      markings.push({ at: offsetAt(r.pts, r.cum, m, lateral, h), heading: h, length: e - s, width })
    }
  }
  for (const r of streets ? [] : roads) {
    const js = junctionS(r)
    // A kereszteződések környéke: a kereszteződésben nincs festés, előtte 20 m-en folytonos a felezővonal
    const zones = js.map(({ s, j }) => ({ s, clear: j.core + 2, solid: j.core + 20 }))
    const pieces: Array<{ from: number; to: number; solid: boolean }> = []
    const cuts = new Set<number>([0, r.length])
    for (const z of zones) for (const v of [z.s - z.solid, z.s - z.clear, z.s + z.clear, z.s + z.solid]) if (v > 0 && v < r.length) cuts.add(v)
    const sorted = [...cuts].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const m = (sorted[i] + sorted[i + 1]) / 2
      if (zones.some((z) => Math.abs(m - z.s) < z.clear)) continue
      pieces.push({ from: sorted[i], to: sorted[i + 1], solid: zones.some((z) => Math.abs(m - z.s) < z.solid) })
    }
    const lw = r.laneWidth
    const divider = dividerOf(r)
    for (const p of pieces) {
      if (r.marked && r.lanesFwd > 0 && r.lanesBack > 0) {
        if (p.solid) paintAlong(r, divider, p.from, p.to, 3, 0)
        else paintAlong(r, divider, p.from, p.to, 3, 6)
      }
      // Azonos irányú sávok között szaggatott vonal
      for (let k = 1; k < r.lanesFwd; k++) paintAlong(r, divider + k * lw, p.from, p.to, 3, 6)
      for (let k = 1; k < r.lanesBack; k++) paintAlong(r, divider - k * lw, p.from, p.to, 3, 6)
    }
  }

  // ---------------------------------------------------------------- táblák, megállási vonalak, zebrák, lámpák
  const signs: SignSite[] = []
  /** A legközelebbi úttesten kívüli pont (legfeljebb 30 m-re, a nagy kereszteződésekben is): oszlop nem állhat az úttesten */
  const offRoad = (base: XZ): XZ => {
    if (!index.onAsphalt(base, 0.3)) return base
    for (let rad = 1; rad <= 30; rad += 1)
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2
        const p: XZ = [base[0] + Math.cos(ang) * rad, base[1] + Math.sin(ang) * rad]
        if (!index.onAsphalt(p, 0.3)) return p
      }
    return base
  }
  /**
   * Tábla elhelyezése. Az ugyanannak a forgalmi iránynak szóló, egymáshoz közeli táblák egy oszlopra kerülnek
   * (legfeljebb háromig, egymás alatt), mint a valóságban. Oszlop nem állhat az úttesten: ha mégis oda esne,
   * a táblát néző forgalommal szemben (hátrafelé) tovább toljuk, amíg járdára vagy útszélre nem kerül.
   */
  const addSign = (code: string, at0: XZ, rotY: number) => {
    const h = -rotY
    const [fx, fz] = [Math.sin(h), -Math.cos(h)]
    const [rx, rz] = rightOf(h)
    let at = at0
    for (let k = 0; k < 12 && index.onAsphalt(at, 0.3); k++) at = [at[0] - fx * 1.5, at[1] - fz * 1.5]
    at = offRoad(at)
    for (const s of signs) {
      if (Math.abs(wrapAngle(s.rotY - rotY)) > 0.5) continue
      const dx = at[0] - s.at[0]
      const dz = at[1] - s.at[1]
      const along = Math.abs(dx * fx + dz * fz)
      const across = Math.abs(dx * rx + dz * rz)
      if (across > 2.5 || along > 10) continue
      if (s.codes.includes(code)) return
      if (s.codes.length < 3) {
        s.codes.push(code)
        return
      }
    }
    signs.push({ codes: [code], at, rotY })
  }

  const nodeOn = new Map<number, Array<{ road: Road; i: number }>>()
  for (const r of roads) r.nodes.forEach((n, i) => n >= 0 && nodeOn.set(n, [...(nodeOn.get(n) ?? []), { road: r, i }]))

  /** Megközelítés: az úton a megadott irányban (±1) haladva a megállási vonal helye és a sávok oldalsó tartománya */
  const approach = (r: Road, s: number, dir: 1 | -1) => {
    const h = headingAt(r.pts, r.cum, s) + (dir === 1 ? 0 : Math.PI)
    // A lateral érték az út rajzolási irányához képest
    const { lo, hi } = lanesRange(r, dir)
    const hw = halfWidthAt(r, s)
    return { heading: h, lo, hi, kerb: dir === 1 ? hw : -hw }
  }
  const allowed = (r: Road, dir: 1 | -1) => r.oneway === 0 || r.oneway === dir

  /** A legközelebbi valódi kereszteződés az úton (s), 60 m-en belül */
  const nearestJunction = (r: Road, s: number) => {
    let best: { s: number; j: Junction; dir: 1 | -1 } | null = null
    for (const x of junctionS(r)) {
      const d = Math.abs(x.s - s)
      if (d < 0.5 || d > 60) continue
      if (!best || d < Math.abs(best.s - s)) best = { ...x, dir: x.s > s ? 1 : -1 }
    }
    return best
  }

  const stopLine = (r: Road, s: number, dir: 1 | -1, kind: 'solid' | 'teeth') => {
    const a = approach(r, s, dir)
    const roadH = headingAt(r.pts, r.cum, s)
    if (kind === 'solid') {
      const mid = (a.lo + a.hi) / 2
      markings.push({ at: offsetAt(r.pts, r.cum, s, mid, roadH), heading: roadH + Math.PI / 2, length: a.hi - a.lo - 0.3, width: 0.45 })
    } else {
      for (let l = a.lo + 0.4; l < a.hi - 0.2; l += 1.0) markings.push({ at: offsetAt(r.pts, r.cum, s, l, roadH), heading: roadH, length: 0.5, width: 0.5 })
    }
    return a
  }

  // Lámpacsoportok: egymáshoz közeli lámpák egy vezérlőhöz tartoznak, két fázissal (két tengely)
  const controllerCenters: Array<{ at: XZ; axis: number }> = []
  const controllers: number[] = []
  const lights: LightSite[] = []
  const stops: StopSite[] = []
  const crossings: CrossingSite[] = []
  const poleSpot = (r: Road, s: number, lateral: number, roadH: number): XZ => {
    const side = Math.sign(lateral) || 1
    let at = offsetAt(r.pts, r.cum, s, lateral, roadH)
    for (let k = 1; k <= 8 && index.onAsphalt(at, 0.3); k++) at = offsetAt(r.pts, r.cum, s, lateral + side * k * 0.5, roadH)
    return offRoad(at)
  }
  const addLight = (r: Road, s: number, dir: 1 | -1, across?: number) => {
    const a = stopLine(r, s, dir, 'solid')
    const roadH = headingAt(r.pts, r.cum, s)
    // A lámpaoszlop sem állhat az úttesten (pl. széles vagy osztott pályás kereszteződésben)
    const at = poleSpot(r, s, a.kerb + Math.sign(a.kerb) * 0.8, roadH)
    let ci = controllerCenters.findIndex((c) => Math.hypot(c.at[0] - at[0], c.at[1] - at[1]) < 70)
    if (ci < 0) {
      ci = controllerCenters.length
      controllerCenters.push({ at, axis: a.heading })
      controllers.push(rng() * 50)
    }
    // A fázis a tengely szerint: ugyanazon (vagy szemközti) irányból érkezők együtt kapnak zöldet
    const diff = Math.abs(wrapAngle(2 * (a.heading - controllerCenters[ci].axis))) / 2
    const phase: 0 | 1 = diff < Math.PI / 4 ? 0 : 1
    const stopAt = offsetAt(r.pts, r.cum, s, (a.lo + a.hi) / 2, roadH)
    lights.push({ at, rotY: -a.heading, controller: ci, phase, stopAt, heading: a.heading })
    // Ismétlő lámpa a kereszteződés túloldalán (a megállási vonalnál várakozó is látja), a jobb oldalon, felénk nézve
    if (across !== undefined) {
      const [fx, fz] = [Math.sin(a.heading), -Math.cos(a.heading)]
      const [rx, rz] = rightOf(a.heading)
      const right = (a.hi - a.lo) / 2 + 1.5
      const p: XZ = [stopAt[0] + fx * across + rx * right, stopAt[1] + fz * across + rz * right]
      lights.push({ at: offRoad(p), rotY: -a.heading, controller: ci, phase, stopAt, heading: a.heading, repeater: true })
    }
  }


  for (const n of controlNodes) {
    const on = nodeOn.get(n.id)
    if (!on) continue
    const hw = n.tags?.highway
    const { road: r, i } = on[0]
    let s = r.cum[i]
    if (hw === 'traffic_signals') {
      const j = junctionOf.get(n.id)
      if (j && j.arms >= 3) {
        // A kereszteződés közepére tett lámpa: minden befutó ágra
        for (const { road, i: k } of on) {
          const sk = road.cum[k]
          if (k > 0 && allowed(road, 1)) addLight(road, Math.max(0, sk - stopBack(j, road, 1) - 0.5), 1, 2 * j.core + 6)
          if (k < road.nodes.length - 1 && allowed(road, -1)) addLight(road, Math.min(road.length, sk + stopBack(j, road, -1) + 0.5), -1, 2 * j.core + 6)
        }
      } else {
        const near = nearestJunction(r, s)
        if (near && allowed(r, near.dir))
          addLight(r, near.dir === 1 ? Math.min(s, near.s - stopBack(near.j, r, 1) - 0.5) : Math.max(s, near.s + stopBack(near.j, r, -1) + 0.5), near.dir, 2 * near.j.core + 6)
        else {
          // Gyalogos-átkelőhely lámpája az úton: mindkét irányba
          if (allowed(r, 1)) addLight(r, Math.max(0, s - 2), 1)
          if (allowed(r, -1)) addLight(r, Math.min(r.length, s + 2), -1)
        }
      }
    } else if (hw === 'stop' || hw === 'give_way') {
      const near = nearestJunction(r, s)
      if (!near || !allowed(r, near.dir)) continue
      const sl = near.dir === 1 ? Math.min(s, near.s - stopBack(near.j, r, 1)) : Math.max(s, near.s + stopBack(near.j, r, -1))
      const a = stopLine(r, sl, near.dir, hw === 'stop' ? 'solid' : 'teeth')
      stops.push({ kind: hw === 'stop' ? 'stop' : 'give_way', at: offsetAt(r.pts, r.cum, sl, (a.lo + a.hi) / 2), heading: a.heading, halfSpan: (a.hi - a.lo) / 2 })
      addSign(hw === 'stop' ? 'B-002' : 'B-001', offsetAt(r.pts, r.cum, sl, a.kerb + Math.sign(a.kerb) * 1.0), -a.heading)
    } else if (hw === 'crossing' && n.tags?.crossing !== 'unmarked' && n.tags?.crossing !== 'no') {
      if ((junctionOf.get(n.id)?.arms ?? 0) >= 3) continue
      // A kereszteződés torkolatánál lévő zebra a kereszteződés szélén kívül (nem a kereszteződésben)
      let nj: { s: number; j: Junction } | null = null
      for (const x of junctionS(r)) if (Math.abs(x.s - s) < 30 && (!nj || Math.abs(x.s - s) < Math.abs(nj.s - s))) nj = x
      if (nj) {
        // A csomópont melyik oldalán van (ha szinte rajta, azon, amerre több hely van az úton)
        const dir: 1 | -1 = Math.abs(nj.s - s) > 0.5 ? (nj.s > s ? 1 : -1) : nj.s > r.length / 2 ? 1 : -1
        const edge = stopBack(nj.j, r, dir) + 1.4
        if (Math.abs(nj.s - s) < edge) s = Math.max(0, Math.min(r.length, nj.s - dir * edge))
      }
      const roadH = headingAt(r.pts, r.cum, s)
      const hwz = halfWidthAt(r, s)
      crossings.push({ at: pointAt(r.pts, r.cum, s), heading: roadH, halfWidth: hwz })
      for (let l = -hwz + 0.45; l < hwz - 0.3; l += 1.0) markings.push({ at: offsetAt(r.pts, r.cum, s, l, roadH), heading: roadH, length: 3, width: 0.5 })
      if (allowed(r, 1)) addSign('E-038', offsetAt(r.pts, r.cum, s - 1.5, hwz + 1.0, roadH), -roadH)
      if (allowed(r, -1)) addSign('E-038', offsetAt(r.pts, r.cum, s + 1.5, -hwz - 1.0, roadH), -(roadH + Math.PI))
    }
  }

  // Kitalált táblázás az egész világban: főútvonal, elsőbbségadás, körforgalom, egyirányú utca, sebességkorlátozás
  inferSignage({ junctions, nodeOn, lights, stops, addSign, stopLine, onAsphalt: (p) => index.onAsphalt(p, 0.3) })

  // Az útvonal saját táblái (OSM + a helyzetekből kikövetkeztetett), a jobb oldalon
  for (const sign of opts.routeSigns ?? []) {
    const h = headingAt(routePts, routeCum, sign.d)
    const p = pointAt(routePts, routeCum, sign.d)
    const hit = index.nearest(p)
    const half = hit ? halfWidthAt(hit.road, hit.s) : 3
    const r = rightOf(h)
    addSign(sign.code, [p[0] + r[0] * (half + 1.1), p[1] + r[1] * (half + 1.1)], -h)
  }

  // Egy oszlopon felülről lefelé: elsőbbségi, veszélyt jelző, tilalmi, utasító, végül tájékoztató táblák
  const ORDER: Record<string, number> = { B: 0, A: 1, C: 2, D: 3, E: 4 }
  for (const s of signs) s.codes.sort((a, b) => (ORDER[a[0]] ?? 5) - (ORDER[b[0]] ?? 5))

  // ---------------------------------------------------------------- házak
  const buildings: SimBuilding[] = []
  const placed = new Grid<XZ[]>(30)
  const clearOfRoads = (p: XZ) => {
    if (streets && (index.onPavement(p) || index.onAsphalt(p, 1.5))) return false
    if (index.junctionAt(p, PAVEMENT_W + 1) || index.inJunctionPaved(p, PAVEMENT_W + 0.5)) return false
    const hit = index.nearest(p)
    if (hit && hit.dist < halfWidthAt(hit.road, hit.s) + PAVEMENT_W + 0.4) return false
    return true
  }
  for (const r of roads) {
    if (NO_PAVEMENT.has(r.highway) || r.roundabout) continue
    const tall = /^(primary|secondary|trunk)$/.test(r.highway)
    for (const side of [1, -1] as const) {
      let s = 4 + rng() * 6
      while (s < r.length - 6) {
        const front = 9 + rng() * 8
        const depth = 10 + rng() * 6
        const sMid = s + front / 2
        s += front + (rng() < 0.15 ? 4 + rng() * 10 : 0.2)
        const p = pointAt(r.pts, r.cum, sMid)
        if (distToRoute(p) > DECOR_M) continue
        const h = headingAt(r.pts, r.cum, sMid)
        const setback = rng() < 0.55 ? 0.3 : 1.5 + rng() * 5
        const outer = (side === 1 ? r.walkR?.[1] : r.walkL?.[1]) ?? halfWidthAt(r, sMid) + PAVEMENT_W
        const lateral = side * (outer + setback + depth / 2)
        const [rx, rz] = rightOf(h)
        const b: SimBuilding = {
          x: p[0] + rx * lateral,
          z: p[1] + rz * lateral,
          w: depth,
          d: front,
          h: tall ? 12 + rng() * 12 : 7 + rng() * 11,
          rotY: -h,
          color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)],
        }
        const corners = buildingCorners(b)
        const probe = [...corners, ...corners.map((c, k): XZ => {
          const d = corners[(k + 1) % 4]
          return [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2]
        }), [b.x, b.z] as XZ]
        if (!probe.every(clearOfRoads)) continue
        if (placed.near([b.x, b.z], 25).some((other) => boxesOverlap(corners, other, 0.2))) continue
        const xs = corners.map((c) => c[0])
        const zs = corners.map((c) => c[1])
        placed.add(corners, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs))
        buildings.push(b)
      }
    }
  }
  index.setBuildings(buildings)

  // ---------------------------------------------------------------- fák, lámpák a járdán
  const furniture: FurnitureSite[] = []
  const blockers: XZ[] = [...signs.map((s) => s.at), ...lights.map((l) => l.at)]
  let n = 0
  for (const r of roads) {
    if (NO_PAVEMENT.has(r.highway)) continue
    for (const side of [1, -1] as const) {
      if (r.roundabout && side === -1) continue
      for (let s = 8 + rng() * 10; s < r.length - 4; s += 26) {
        const p = pointAt(r.pts, r.cum, s)
        if (distToRoute(p) > DECOR_M - 20) continue
        const h = headingAt(r.pts, r.cum, s)
        const walk = side === 1 ? r.walkR : r.walkL
        const at = offsetAt(r.pts, r.cum, s, side * (walk ? walk[0] + 0.6 : halfWidthAt(r, s) + 0.7), h)
        if (!index.onPavement(at)) continue
        if (blockers.some((b) => Math.hypot(b[0] - at[0], b[1] - at[1]) < 4)) continue
        n++
        // A lámpa karja az úttest felé (a modell karja alapból a +X felé áll)
        const [rx, rz] = rightOf(h)
        const tx = -rx * side
        const tz = -rz * side
        furniture.push({ kind: n % 2 ? 'lamp' : 'tree', x: at[0], z: at[1], rotY: Math.atan2(-tz, tx) })
      }
    }
  }

  // ---------------------------------------------------------------- indulás: az útvonal elején, a jobb oldali járda mellől
  const s0 = Math.min(6, route.length / 4)
  const h0 = headingAt(routePts, routeCum, s0)
  const p0 = pointAt(routePts, routeCum, s0)
  const hit0 = index.nearest(p0)
  let start = { x: p0[0], z: p0[1], heading: h0 }
  if (hit0) {
    // A vizsgán a járda mellől indulunk: a kocsi jobb oldala kb. 25 cm-re a szegélytől
    const centre = pointAt(hit0.road.pts, hit0.road.cum, hit0.s)
    const laneLat = halfWidthAt(hit0.road, hit0.s) - 0.9 - 0.25
    const [rx, rz] = rightOf(h0)
    start = { x: centre[0] + rx * laneLat, z: centre[1] + rz * laneLat, heading: h0 }
  }

  // ---------------------------------------------------------------- kiterjedés
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const r of roads)
    for (const [x, z] of r.pts) {
      minX = Math.min(minX, x)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxZ = Math.max(maxZ, z)
    }

  return {
    proj,
    roads,
    junctions,
    pavements,
    markings,
    buildings,
    furniture,
    signs,
    lights,
    stops,
    crossings,
    controllers,
    route,
    start,
    bounds: [minX - 60, minZ - 60, maxX + 60, maxZ + 60],
    ...(surfaces ? { streets: surfaces } : {}),
  }
}

/** A világ térbeli indexe (az építés után, a szimulációhoz) */
export function indexWorld(w: World): RoadIndex {
  const index = new RoadIndex(w.roads, w.junctions)
  index.setPavements(w.pavements)
  index.setBuildings(w.buildings)
  if (w.streets) index.setSurfaces(w.streets)
  return index
}
