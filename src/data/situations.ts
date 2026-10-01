import type { LineString, Position } from 'geojson'
import type { RoundaboutInfo, Situation, SituationKind, Turn } from '../domain/types'
import { angleDiff, bboxContains, bboxOf, RouteGeom, turnDelta, type BBox, type LngLat } from '../lib/geo'
import { isTransitStop } from './osmTileFormat'
import { parseTrafficSign } from './signs'
import {
  highwayRank,
  isDrivableWay,
  isRoundaboutWay,
  parseMaxspeed,
  type OsmData,
  type OsmNode,
  type OsmWay,
} from './osm'

export interface GenerateOptions {
  routeId: string
  newId?: () => string
}

/** Mintavételi lépés az útvonal mentén (m) */
const STEP = 10
/** Ennyin belül tekintünk egy utat az útvonal részének (m) */
const WAY_SNAP = 12
/** Csomópont ennyin belül az útvonalhoz, hogy kereszteződésnek számítson (m) */
const JUNCTION_SNAP = 10
/** Ennyin belüli kereszteződés-csomópontok egy kereszteződésnek számítanak (m) */
const JUNCTION_MERGE = 20
/** Tábla/lámpa keresési sugara a kereszteződés körül (m) */
const CONTROL_RADIUS = 45
/** Tábla ennyin belül az útvonalhoz → a mi irányunkra vonatkozik (m) */
const OWN_SIGN_SNAP = 7
/** Ennyinél közelebbi lámpás kereszteződések egy csomópontnak számítanak (m) */
const SIGNAL_MERGE = 45
/** Kanyarodásnak számító irányváltozás (fok) */
const TURN_ANGLE = 35
/** Vasúti átjáró ennyin belül az útvonalhoz (m) */
const RAIL_SNAP = 8
/** Jelzőtábla ennyin belül az útvonal mellett (m) */
const SIGN_SNAP = 12
/** Jelzőtáblák ennyivel a helyzet előtt számítanak a helyzethez (m) */
const SIGN_BEFORE = 80
/** Villamosmegálló ennyin belül az útvonalhoz: a villamos a mi úttestünkön jár (m) */
const TRAM_SNAP = 10
/** Autóbuszmegálló (peron) ennyin belül, az útvonal jobb oldalán (m) */
const BUS_SNAP = 15
/** Ennyinél közelebbi azonos fajtájú megállók egynek számítanak (m) */
const STOP_MERGE = 40

interface PreparedWay {
  way: OsmWay
  coords: Position[]
  bbox: BBox
}

interface Sample {
  d: number
  p: LngLat
  way?: OsmWay
}

interface Cluster {
  dStart: number
  dEnd: number
  nodeIds: number[]
  coords: LngLat[]
}

/** Egy pont és egy törtvonal legközelebbi szakasza: távolság (m) és a szakasz iránya (fok) */
function nearestSegment(p: Position, line: Position[]): { dist: number; bearing: number } {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180)
  const ky = 111_320
  let best = { dist: Infinity, bearing: 0 }
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * kx
    const ay = (line[i][1] - p[1]) * ky
    const vx = (line[i + 1][0] - line[i][0]) * kx
    const vy = (line[i + 1][1] - line[i][1]) * ky
    const len2 = vx * vx + vy * vy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2))
    const dist = Math.hypot(ax + t * vx, ay + t * vy)
    if (dist < best.dist) best = { dist, bearing: (Math.atan2(vx, vy) * 180) / Math.PI }
  }
  return best
}

function sameRoad(a: OsmWay, b: OsmWay): boolean {
  if (a.id === b.id) return true
  const ta = a.tags ?? {}
  const tb = b.tags ?? {}
  if (ta.ref && ta.ref === tb.ref) return true
  return Boolean(ta.name) && ta.name === tb.name
}

function isYesish(v: string | undefined): boolean {
  return v === 'designated' || v === 'yes'
}

function isOneway(w: OsmWay | undefined): boolean {
  const v = w?.tags?.oneway
  return v === 'yes' || v === '1' || v === 'true' || isRoundaboutWay(w)
}

/** Pontok és (járható) utak szétválogatása, az utak befoglaló téglalapjával */
function prepareOsm(osm: OsmData): { nodes: OsmNode[]; ways: PreparedWay[] } {
  const nodes: OsmNode[] = []
  const ways: PreparedWay[] = []
  for (const el of osm.elements) {
    if (el.type === 'node') nodes.push(el)
    else if (el.type === 'way' && el.geometry?.length >= 2 && isDrivableWay(el)) {
      const coords = el.geometry.map((g) => [g.lon, g.lat])
      ways.push({ way: el, coords, bbox: bboxOf(coords, WAY_SNAP + 5) })
    }
  }
  return { nodes, ways }
}

/** Mintavétel 10 méterenként: melyik OSM-út van alattunk (a haladási irányhoz illő, legközelebbi) */
function sampleRouteWays(geom: RouteGeom, ways: PreparedWay[]): Sample[] {
  const samples: Sample[] = []
  for (let d = 0; d <= geom.length; d += STEP) {
    const p = geom.pointAt(d)
    const b = geom.bearingAt(d)
    let best: { way: OsmWay; score: number } | undefined
    for (const pw of ways) {
      if (!bboxContains(pw.bbox, p)) continue
      const seg = nearestSegment(p, pw.coords)
      if (seg.dist > WAY_SNAP) continue
      let a = angleDiff(b, seg.bearing)
      a = Math.min(a, 180 - a)
      const score = seg.dist + (a > 50 ? 20 : 0)
      if (!best || score < best.score) best = { way: pw.way, score }
    }
    samples.push({ d, p, way: best?.way })
  }
  return samples
}

function wayAtOf(samples: Sample[]): (d: number) => OsmWay | undefined {
  return (d) => samples[Math.max(0, Math.min(samples.length - 1, Math.round(d / STEP)))]?.way
}

/** Egy kitáblázott tábla az útvonal mentén */
export interface SignSpot {
  code: string
  /** Távolság az útvonal elejétől (m) */
  d: number
  lngLat: LngLat
}

/**
 * A kitáblázott (OSM traffic_sign) táblák az útvonal mentén, amelyek a mi irányunkra vonatkoznak: az úttesten lévő (≤ 2 m)
 * pont bármelyik irányra vonatkozhat, a távolabbiak közül csak a jobb oldaliak a mieink. A „lakott terület” tábla
 * kezdete/vége a sebességkorlát változásából derül ki.
 */
function signSpots(nodes: OsmNode[], geom: RouteGeom, wayAt: (d: number) => OsmWay | undefined): SignSpot[] {
  const out: SignSpot[] = []
  for (const n of nodes) {
    const codes = parseTrafficSign(n.tags)
    if (!codes.length) continue
    const p: LngLat = [n.lon, n.lat]
    const pr = geom.project(p)
    if (pr.dist > SIGN_SNAP) continue
    if (pr.dist > 2 && sideOf(geom, pr.d, p) < 0) continue
    for (const c of codes) {
      const code = c === 'city_limit' ? cityLimitCode(wayAt(pr.d - 30), wayAt(pr.d + 30)) : c
      out.push({ code, d: pr.d, lngLat: p })
    }
  }
  return out.sort((a, b) => a.d - b.d)
}

/** Az útvonal mentén kitáblázott, a mi irányunkra vonatkozó táblák (a táblagyakorláshoz) */
export function signsAlongRoute(line: LineString, osm: OsmData): SignSpot[] {
  const geom = new RouteGeom(line)
  const { nodes, ways } = prepareOsm(osm)
  return signSpots(nodes, geom, wayAtOf(sampleRouteWays(geom, ways)))
}

/**
 * Helyzetek (kereszteződések, zebrák, lámpák, körforgalmak, sebességváltozások)
 * felismerése az útvonal mentén az OpenStreetMap-adatokból.
 * A bizonytalan besorolásokat `needsReview` jelöli: ezeket kézzel ellenőrizni kell.
 */
export function generateSituations(line: LineString, osm: OsmData, opts: GenerateOptions): Situation[] {
  const newId = opts.newId ?? (() => crypto.randomUUID())
  const geom = new RouteGeom(line)
  const L = geom.length

  const { nodes, ways } = prepareOsm(osm)

  // Csomópontok fokszáma és a hozzájuk tartozó utak
  const degree = new Map<number, number>()
  const nodeWays = new Map<number, OsmWay[]>()
  const nodeCoord = new Map<number, LngLat>()
  for (const { way } of ways) {
    const last = way.nodes.length - 1
    way.nodes.forEach((id, i) => {
      degree.set(id, (degree.get(id) ?? 0) + (i === 0 || i === last ? 1 : 2))
      const list = nodeWays.get(id) ?? []
      list.push(way)
      nodeWays.set(id, list)
      const g = way.geometry[i]
      if (g) nodeCoord.set(id, [g.lon, g.lat])
    })
  }

  // Mintavétel: melyik OSM-út van alattunk
  const samples = sampleRouteWays(geom, ways)
  const wayAt = wayAtOf(samples)
  const onRoute = new Set(samples.flatMap((s) => (s.way ? [s.way.id] : [])))

  const out: Situation[] = []
  const make = (d: number, kind: SituationKind, extra: Partial<Situation> = {}): Situation => {
    const [lng, lat] = geom.pointAt(d)
    return {
      id: newId(),
      routeId: opts.routeId,
      d: Math.round(d),
      lng,
      lat,
      bearing: Math.round(geom.bearingBetween(Math.max(0, d - 25), d)),
      kind,
      turn: 'straight',
      needsReview: false,
      source: 'osm',
      ...extra,
    }
  }

  // ------------------------------------------------ Körforgalmak
  const roundaboutDs: number[] = []
  for (let i = 1; i < samples.length; i++) {
    if (isRoundaboutWay(samples[i].way) && !isRoundaboutWay(samples[i - 1].way)) {
      const d = samples[i].d
      if (roundaboutDs.some((x) => Math.abs(x - d) < 40)) continue
      roundaboutDs.push(d)
      let j = i
      while (j < samples.length && isRoundaboutWay(samples[j].way)) j++
      const info = j < samples.length ? ringExit(samples[i].way!, samples[i - 1].p, samples[j].p, geom.bearingBetween(Math.max(0, d - 30), d), geom.bearingBetween(samples[j].d, Math.min(L, samples[j].d + 30))) : null
      out.push(make(d, 'roundabout', info ? { roundabout: info.info, needsReview: info.unsure } : { needsReview: true }))
    }
  }
  for (const n of nodes) {
    if (n.tags?.highway !== 'mini_roundabout') continue
    const pr = geom.project([n.lon, n.lat])
    if (pr.dist > 8 || roundaboutDs.some((x) => Math.abs(x - pr.d) < 40)) continue
    roundaboutDs.push(pr.d)
    const info = miniExit(n, geom.pointAt(pr.d - 15), geom.pointAt(pr.d + 15), geom.bearingBetween(Math.max(0, pr.d - 30), pr.d), geom.bearingBetween(pr.d, Math.min(L, pr.d + 30)))
    out.push(make(pr.d, 'roundabout', info ? { roundabout: info.info, needsReview: info.unsure } : { needsReview: true }))
  }

  /** A körpálya (összefüggő körforgalmi utak) csomópontjai */
  function ringOf(start: OsmWay): { ringWays: OsmWay[]; ringNodes: Set<number> } {
    const ringWays: OsmWay[] = []
    const ringNodes = new Set<number>()
    const queue = [start]
    const seenWays = new Set<number>()
    while (queue.length) {
      const w = queue.pop()!
      if (seenWays.has(w.id)) continue
      seenWays.add(w.id)
      ringWays.push(w)
      for (const id of w.nodes) {
        ringNodes.add(id)
        for (const o of nodeWays.get(id) ?? []) if (isRoundaboutWay(o) && !seenWays.has(o.id)) queue.push(o)
      }
    }
    return { ringWays, ringNodes }
  }

  /** A körhöz csatlakozó ágak: hol csatlakoznak, és ki lehet-e rajtuk hajtani (nem befelé egyirányúak) */
  function armsAt(ringNodes: Set<number>): Arm[] {
    const arms: Arm[] = []
    for (const id of ringNodes) {
      const at = nodeCoord.get(id)
      if (!at) continue
      for (const w of nodeWays.get(id) ?? []) {
        if (isRoundaboutWay(w)) continue
        const idx = w.nodes.indexOf(id)
        const ow = w.tags?.oneway
        const forward = ow === 'yes' || ow === '1' || ow === 'true'
        const backward = ow === '-1'
        // Befelé egyirányú: a forgalom a körpálya felé tart (előre haladva a végpontja, visszafelé a kezdőpontja a kör)
        const inbound = (forward && idx === w.nodes.length - 1) || (backward && idx === 0)
        arms.push({ at, exit: !inbound })
      }
    }
    return arms
  }

  function ringExit(start: OsmWay, before: LngLat, after: LngLat, bIn: number, bOut: number) {
    const { ringWays, ringNodes } = ringOf(start)
    const pts = [...ringNodes].map((id) => nodeCoord.get(id)).filter((p): p is LngLat => !!p)
    if (!pts.length) return null
    const centre: LngLat = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]
    const lanes = Math.max(1, ...ringWays.map((w) => Number.parseInt(w.tags?.lanes ?? '', 10)).filter(Number.isFinite))
    return exitInfo(centre, armsAt(ringNodes), before, after, lanes, bIn, bOut)
  }

  function miniExit(node: OsmNode, before: LngLat, after: LngLat, bIn: number, bOut: number) {
    const centre: LngLat = [node.lon, node.lat]
    const arms: Arm[] = []
    for (const w of nodeWays.get(node.id) ?? []) {
      const i = w.nodes.indexOf(node.id)
      const ow = w.tags?.oneway
      const forward = ow === 'yes' || ow === '1' || ow === 'true'
      for (const k of [i - 1, i + 1]) {
        const g = w.geometry[k]
        if (!g) continue
        // Befelé egyirányú ág: a forgalom a csomópont felé halad
        const inbound = forward ? k < i : ow === '-1' ? k > i : false
        arms.push({ at: [g.lon, g.lat], exit: !inbound })
      }
    }
    return exitInfo(centre, arms, before, after, 1, bIn, bOut)
  }

  // ------------------------------------------------ Kereszteződések
  const candidates: { nodeId: number; d: number; coord: LngLat }[] = []
  const seen = new Set<number>()
  for (const { way } of ways) {
    if (!onRoute.has(way.id)) continue
    for (const id of way.nodes) {
      if (seen.has(id) || (degree.get(id) ?? 0) < 3) continue
      seen.add(id)
      if ((nodeWays.get(id) ?? []).some(isRoundaboutWay)) continue
      const coord = nodeCoord.get(id)
      if (!coord) continue
      const pr = geom.project(coord)
      if (pr.dist <= JUNCTION_SNAP) candidates.push({ nodeId: id, d: pr.d, coord })
    }
  }
  candidates.sort((a, b) => a.d - b.d)
  const clusters: Cluster[] = []
  for (const c of candidates) {
    const last = clusters.at(-1)
    if (last && c.d - last.dEnd < JUNCTION_MERGE) {
      last.dEnd = c.d
      last.nodeIds.push(c.nodeId)
      last.coords.push(c.coord)
    } else clusters.push({ dStart: c.d, dEnd: c.d, nodeIds: [c.nodeId], coords: [c.coord] })
  }

  const controls = nodes
    .filter((n) => ['stop', 'give_way', 'traffic_signals'].includes(n.tags?.highway ?? ''))
    .map((n) => ({ node: n, coord: [n.lon, n.lat] as LngLat, pr: geom.project([n.lon, n.lat]) }))

  // Először minden kereszteződést besorolunk, utána vonjuk össze a nagy lámpás csomópontokat
  const classified: Array<{ dStart: number; dEnd: number; kind: SituationKind; needsReview: boolean }> = []
  for (const cl of clusters) {
    if (cl.dStart < 15 || cl.dEnd > L - 5) continue
    if (roundaboutDs.some((x) => Math.abs(x - cl.dStart) < 30)) continue

    const near = controls.filter((c) => cl.coords.some((p) => metersApprox(p, c.coord) <= CONTROL_RADIUS))
    const signals = near.some((c) => c.node.tags?.highway === 'traffic_signals')
    const signs = near.filter((c) => c.node.tags?.highway !== 'traffic_signals')
    const mine = signs.filter((c) => c.pr.dist <= OWN_SIGN_SNAP && c.pr.d >= cl.dStart - CONTROL_RADIUS && c.pr.d <= cl.dEnd + 2)
    const others = signs.filter((c) => !mine.includes(c))

    let kind: SituationKind
    let needsReview = false
    if (signals) kind = 'signals'
    else if (mine.some((c) => c.node.tags?.highway === 'stop')) kind = 'stop'
    else if (mine.length) kind = 'give_way'
    else if (others.length) kind = 'priority'
    else {
      const approach = wayAt(cl.dStart - 15) ?? wayAt(cl.dStart)
      const atNodes = cl.nodeIds.flatMap((id) => nodeWays.get(id) ?? [])
      const cross = atNodes.filter((w) => !approach || !sameRoad(w, approach))
      if (approach && isYesish(approach.tags?.priority_road)) kind = 'priority'
      else if (cross.some((w) => isYesish(w.tags?.priority_road))) kind = 'give_way'
      else {
        const ourRank = highwayRank(approach?.tags?.highway)
        const crossRank = Math.max(-1, ...cross.map((w) => highwayRank(w.tags?.highway)))
        kind = ourRank > crossRank ? 'priority' : ourRank < crossRank ? 'give_way' : 'equal'
      }
      needsReview = true
    }
    const prev = classified.at(-1)
    // Kettős úttestű lámpás csomópont: egy helyzet, egy lámpával
    if (prev && prev.kind === 'signals' && kind === 'signals' && cl.dStart - prev.dEnd < SIGNAL_MERGE) prev.dEnd = cl.dEnd
    else classified.push({ dStart: cl.dStart, dEnd: cl.dEnd, kind, needsReview })
  }

  const junctionDs: number[] = []
  for (const j of classified) {
    const bIn = geom.bearingBetween(Math.max(0, j.dStart - 25), j.dStart)
    const bOut = geom.bearingBetween(j.dEnd, Math.min(L, j.dEnd + 25))
    const delta = turnDelta(bIn, bOut)
    const turn: Turn = delta > TURN_ANGLE ? 'right' : delta < -TURN_ANGLE ? 'left' : 'straight'
    junctionDs.push(j.dStart)
    out.push(make(j.dStart, j.kind, { turn, needsReview: j.needsReview }))
  }

  // ------------------------------------------------ Gyalogos-átkelőhelyek
  const crossingDs: number[] = []
  for (const n of nodes) {
    const t = n.tags ?? {}
    if (t.highway !== 'crossing' || t.crossing === 'unmarked' || t.crossing === 'no') continue
    const pr = geom.project([n.lon, n.lat])
    if (pr.dist > 8 || pr.d < 15) continue
    if (crossingDs.some((x) => Math.abs(x - pr.d) < 20)) continue
    if (junctionDs.some((x) => Math.abs(x - pr.d) < 8)) continue
    const signalized = t.crossing === 'traffic_signals' || t.crossing_signals === 'yes'
    if (signalized) {
      const covered = out.some((s) => s.kind === 'signals' && Math.abs(s.d - pr.d) < 50)
      if (covered) continue
      out.push(make(pr.d, 'signals'))
    } else out.push(make(pr.d, 'crossing'))
    crossingDs.push(pr.d)
  }

  // ------------------------------------------------ Sebességváltozások
  let current: number | null = null
  let pending: { v: number; d: number; count: number } | null = null
  for (const s of samples) {
    const v = parseMaxspeed(s.way?.tags)
    if (v === null) continue
    if (current === null) {
      current = v
      continue
    }
    if (v === current) {
      pending = null
      continue
    }
    if (pending && pending.v === v) {
      pending.count++
      if (pending.count >= 3) {
        out.push(make(pending.d, 'speed_change', { speedFrom: current, speedTo: v }))
        current = v
        pending = null
      }
    } else pending = { v, d: s.d, count: 1 }
  }

  // ------------------------------------------------ Vasúti átjárók
  const railDs: number[] = []
  for (const n of nodes) {
    const t = n.tags ?? {}
    if (t.railway !== 'level_crossing') continue
    const pr = geom.project([n.lon, n.lat])
    if (pr.dist > RAIL_SNAP || pr.d < 30 || railDs.some((x) => Math.abs(x - pr.d) < 30)) continue
    railDs.push(pr.d)
    const barrier = Boolean(t['crossing:barrier']) && t['crossing:barrier'] !== 'no'
    // A fényjelző hiánya ritkán van jelölve; ha nincs adat, fénysorompót feltételezünk (ez a leggyakoribb)
    const lights = t['crossing:light'] !== 'no'
    out.push(make(pr.d, 'rail_crossing', { rail: { barrier, lights }, needsReview: !t['crossing:barrier'] && !t['crossing:light'] }))
  }

  // ------------------------------------------------ Villamos- és autóbuszmegállók
  const stopDs: { d: number; kind: 'tram' | 'bus' }[] = []
  for (const n of nodes) {
    const kind = isTransitStop(n.tags)
    if (!kind) continue
    // Autóbusznál csak a peron (bus_stop) mondja meg, melyik oldalon áll a megálló
    if (kind === 'bus' && n.tags?.highway !== 'bus_stop') continue
    const p: LngLat = [n.lon, n.lat]
    const pr = geom.project(p)
    if (pr.d < 30 || pr.d > L - 10) continue
    if (kind === 'tram' && pr.dist > TRAM_SNAP) continue
    if (kind === 'bus') {
      if (pr.dist > BUS_SNAP || sideOf(geom, pr.d, p) <= 0) continue
      // Az elindulás elősegítése (KRESZ 24. § (3)) lakott területen kötelező
      const v = parseMaxspeed(wayAt(pr.d)?.tags)
      if (v !== null && v > 50) continue
    }
    if (stopDs.some((x) => x.kind === kind && Math.abs(x.d - pr.d) < STOP_MERGE)) continue
    stopDs.push({ d: pr.d, kind })
    // A járdasziget az OSM-adatokból nem állapítható meg biztosan: kézzel kell jelölni
    out.push(make(pr.d, kind === 'tram' ? 'tram_stop' : 'bus_stop', { transit: { kind }, needsReview: kind === 'tram' }))
  }

  const list = dedupe(out.sort((a, b) => a.d - b.d))
  attachRealSigns(list, nodes, geom, wayAt)
  return list
}

/**
 * A helyszínen valóban álló táblák: a kitáblázott (traffic_sign) pontok a helyzet előtti szakaszon, az út jobb oldalán,
 * valamint az adatokból biztosan levezethetők (főútvonal, egyirányú célút).
 */
function attachRealSigns(list: Situation[], nodes: OsmNode[], geom: RouteGeom, wayAt: (d: number) => OsmWay | undefined) {
  const spots = signSpots(nodes, geom, wayAt)
  list.forEach((s, i) => {
    const codes: string[] = []
    const from = Math.max(s.d - SIGN_BEFORE, i > 0 ? list[i - 1].d + 5 : 0)
    for (const x of spots) {
      if (x.d >= from && x.d <= s.d + 5 && !codes.includes(x.code)) codes.push(x.code)
    }
    const approach = wayAt(s.d - 15)
    if (s.kind === 'priority' && isYesish(approach?.tags?.priority_road) && !codes.includes('B-003')) codes.push('B-003')
    // Kanyarodás után egyirányú utcába hajtunk: a bejáratánál „Egyirányú forgalmú út” tábla áll
    if (s.turn !== 'straight' && isOneway(wayAt(s.d + 30)) && !isRoundaboutWay(wayAt(s.d + 30))) codes.push('E-012')
    if (codes.length) s.signs = codes
  })
}

interface Arm {
  /** Ahol az ág a körpályához csatlakozik */
  at: LngLat
  /** Ki lehet-e rajta hajtani */
  exit: boolean
}

/** Szög a középponttól (radián, az óramutatóval ellentétesen növekszik, mint a körforgalomban a haladás) */
function angleFrom(c: LngLat, p: LngLat): number {
  const kx = Math.cos((c[1] * Math.PI) / 180)
  return Math.atan2(p[1] - c[1], (p[0] - c[0]) * kx)
}

/**
 * Hányadik kijáraton hajtunk ki: a kijárásra alkalmas ágakat a behajtástól az óramutatóval ellentétesen
 * (ahogy a körben haladunk) sorba rendezzük. A közel azonos irányú ágak (pl. osztott pályás út két fele) egynek számítanak.
 */
function exitInfo(centre: LngLat, arms: Arm[], before: LngLat, after: LngLat, lanes: number, bIn: number, bOut: number): { info: RoundaboutInfo; unsure: boolean } | null {
  const TAU = Math.PI * 2
  const aIn = angleFrom(centre, before)
  const rel = (a: number) => {
    const r = (((a - aIn) % TAU) + TAU) % TAU
    // A behajtási ág maga (kétirányú úton a megfordulás) a legutolsó kijárat
    return r < 0.35 ? TAU : r
  }
  const exits = arms
    .filter((a) => a.exit)
    .map((a) => rel(angleFrom(centre, a.at)))
    .sort((x, y) => x - y)
    .filter((r, i, all) => i === 0 || r - all[i - 1] > 0.3)
  if (!exits.length) return null
  const want = rel(angleFrom(centre, after))
  let best = 0
  exits.forEach((r, i) => {
    if (Math.abs(r - want) < Math.abs(exits[best] - want)) best = i
  })
  const delta = turnDelta(bIn, bOut)
  const turn: Turn = Math.abs(delta) > 150 ? 'left' : delta > 45 ? 'right' : delta < -45 ? 'left' : 'straight'
  const unsure = Math.abs(exits[best] - want) > 0.6 || exits.length < 2
  return { info: { exit: best + 1, exits: exits.length, lanes: Math.min(lanes, 3), turn }, unsure }
}

/** Az útvonal melyik oldalán van a pont: + jobb, − bal */
function sideOf(geom: RouteGeom, d: number, p: LngLat): number {
  const a = geom.pointAt(Math.max(0, d - 5))
  const b = geom.pointAt(Math.min(geom.length, d + 5))
  const kx = Math.cos((a[1] * Math.PI) / 180)
  const vx = (b[0] - a[0]) * kx
  const vy = b[1] - a[1]
  const wx = (p[0] - a[0]) * kx
  const wy = p[1] - a[1]
  // Kelet–észak koordinátákban a jobb oldal a negatív keresztszorzat
  return -(vx * wy - vy * wx)
}

/** A „lakott terület” tábla kezdete vagy vége: a sebességkorlát csökkenése belépést jelez */
function cityLimitCode(before: OsmWay | undefined, after: OsmWay | undefined): string {
  const vb = parseMaxspeed(before?.tags)
  const va = parseMaxspeed(after?.tags)
  if (vb !== null && va !== null && va > vb) return 'E-021'
  return 'E-020'
}

function metersApprox(a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 111_320)
}

function dedupe(list: Situation[]): Situation[] {
  const res: Situation[] = []
  for (const s of list) {
    if (res.some((r) => r.kind === s.kind && Math.abs(r.d - s.d) < 15)) continue
    res.push(s)
  }
  return res
}

/** Újraszámolja a helyzet helyét és irányát, ha kézzel mozgatták vagy az útvonal változott */
export function placeOnRoute(line: LineString, s: Situation, lngLat: LngLat): Situation {
  const geom = new RouteGeom(line)
  const { d } = geom.project(lngLat)
  const [lng, lat] = geom.pointAt(d)
  return { ...s, d: Math.round(d), lng, lat, bearing: Math.round(geom.bearingBetween(Math.max(0, d - 25), d)) }
}
