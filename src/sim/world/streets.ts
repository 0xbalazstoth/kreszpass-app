import init, { initSync, JsStreetNetwork } from 'osm2streets-js/osm2streets_js.js'
import { toLngLat, toLocal, type Projection, type XZ } from './project'
import { initSurfaces } from './surfaces'
import type { Road } from './types'

/**
 * Valósághű utcageometria az osm2streets-szel (A/B Street, Apache-2.0, WebAssembly): a folyosó útjaiból sávonkénti
 * sokszögek (úttest, járda, szegély), a kereszteződések valódi alakja (a befutó utak levágásával), a burkolati jelek
 * (felezővonal, sávelválasztó, nyilak) és a járdasarkok. A szimuláció ugyanezt használja (úttesten / járdán van-e a
 * kerék, hol a megállási vonal), így a látvány és a szabályfigyelés egyezik.
 */

/** Sokszög a szimulátor síkjában: külső gyűrű és lyukak, befoglaló téglalappal */
export interface Poly {
  outer: XZ[]
  holes: XZ[][]
  bbox: [number, number, number, number]
}

/** Egy út sávjai az osm2streets szerint (balról jobbra, az út rajzolási irányában nézve) */
export interface LaneSpec {
  type: string
  dir: 'Fwd' | 'Back'
  width: number
}

export interface Streets {
  /** Úttest: forgalmi, parkoló, leállósávok és a kereszteződések */
  asphalt: Poly[]
  /** Kereszteződések (az úttest része) */
  junctions: Poly[]
  /** Járda (gyalogos sávok és a járdasarkok): szegélymagasságban */
  pavement: Poly[]
  /** Szegélysáv (a járda és az úttest között) */
  kerbs: Poly[]
  /** Festett jelek: felezővonal, sávelválasztó, nyilak */
  paint: Poly[]
  /** Utanként (Road.id) a sávok */
  lanes: Map<number, LaneSpec[]>
}

let ready = false
let broken = false

/** A böngészőben: a WebAssembly-modul betöltése (egyszer); sikertelenség esetén a régi geometria marad */
export async function initStreets(): Promise<boolean> {
  if (ready) return true
  try {
    await Promise.all([init(), initSurfaces()])
    ready = true
  } catch (e) {
    console.warn('osm2streets nem tölthető be', e)
  }
  return ready
}

/** Node alatt (tesztek): a WebAssembly-modul a fájl tartalmából */
export function initStreetsSync(bytes: BufferSource): void {
  if (ready) return
  initSync(bytes)
  ready = true
}

export function streetsReady(): boolean {
  return ready && !broken
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Az utak OSM XML-ként (az osm2streets bemenete): az út azonosítója a Road.id + 1 */
function toXml(roads: Road[], tags: Map<number, Record<string, string>>, proj: Projection): string {
  const nodes = new Map<number, XZ>()
  for (const r of roads) r.nodes.forEach((n, i) => nodes.set(n, r.pts[i]))
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const out: string[] = []
  for (const [id, p] of nodes) {
    const [lng, lat] = toLngLat(proj, p)
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
    out.push(`<node id="${id}" lat="${lat.toFixed(8)}" lon="${lng.toFixed(8)}"/>`)
  }
  for (const r of roads) {
    const t = tags.get(r.id) ?? {}
    out.push(
      `<way id="${r.id + 1}">` +
        r.nodes.map((n) => `<nd ref="${n}"/>`).join('') +
        Object.entries(t)
          .map(([k, v]) => `<tag k="${esc(k)}" v="${esc(v)}"/>`)
          .join('') +
        '</way>',
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6">\n<bounds minlat="${minLat}" minlon="${minLng}" maxlat="${maxLat}" maxlon="${maxLng}"/>\n${out.join('\n')}\n</osm>\n`
}

type Geometry = { type: string; coordinates: unknown }
type Feature = { geometry: Geometry | null; properties: Record<string, unknown> }

function polysOf(g: Geometry | null, proj: Projection): Poly[] {
  if (!g) return []
  const list: number[][][][] = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : []
  const out: Poly[] = []
  for (const rings of list) {
    const conv = rings.map((ring) => {
      const pts = ring.map((c) => toLocal(proj, c))
      // A GeoJSON gyűrű zárt (az első pont a végén ismétlődik)
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop()
      return pts
    })
    if (!conv.length || conv[0].length < 3) continue
    const xs = conv[0].map((p) => p[0])
    const zs = conv[0].map((p) => p[1])
    out.push({ outer: conv[0], holes: conv.slice(1).filter((h) => h.length >= 3), bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] })
  }
  return out
}

const ASPHALT = new Set(['Driving', 'Parking', 'Shoulder', 'Bus', 'Biking', 'SharedLeftTurn', 'Construction', 'LightRail'])
const WALK = new Set(['Sidewalk', 'Footway', 'SharedUse'])
/** Festés, amely a magyar utakon is van (a szegély menti szélső vonal nincs a városban) */
const PAINT = new Set(['center line', 'lane separator', 'lane arrow'])

/** Az osm2streets futtatása a folyosó útjain; hiba esetén null (a hívó a saját, egyszerűbb geometriáját használja) */
export function streetsFor(roads: Road[], tags: Map<number, Record<string, string>>, proj: Projection): Streets | null {
  if (!streetsReady() || !roads.length) return null
  let net: JsStreetNetwork | null = null
  // Az osm2streets a belső figyelmeztetéseit (pl. túl rövid utak összevonása) a konzolra írja: ezeket elhallgatjuk
  const { warn, error, log } = console
  console.warn = console.error = console.log = () => {}
  try {
    net = new JsStreetNetwork(toXml(roads, tags, proj), '', {
      osm2lanes: false,
      debug_each_step: false,
      dual_carriageway_experiment: false,
      sidepath_zipping_experiment: false,
      inferred_sidewalks: true,
      inferred_kerbs: true,
      date_time: undefined,
      override_driving_side: 'Right',
    })
    const s: Streets = { asphalt: [], junctions: [], pavement: [], kerbs: [], paint: [], lanes: new Map() }
    for (const f of (JSON.parse(net.toLanePolygonsGeojson()) as { features: Feature[] }).features) {
      const t = String(f.properties.type ?? '')
      const polys = polysOf(f.geometry, proj)
      if (ASPHALT.has(t)) s.asphalt.push(...polys)
      else if (WALK.has(t)) s.pavement.push(...polys)
      else if (t.startsWith('Buffer')) s.kerbs.push(...polys)
    }
    for (const f of (JSON.parse(net.toGeojsonPlain()) as { features: Feature[] }).features)
      if (f.properties.type === 'intersection') {
        const polys = polysOf(f.geometry, proj)
        s.junctions.push(...polys)
        s.asphalt.push(...polys)
      }
    for (const f of (JSON.parse(net.toIntersectionMarkingsGeojson()) as { features: Feature[] }).features)
      if (f.properties.type === 'sidewalk corner') s.pavement.push(...polysOf(f.geometry, proj))
    for (const f of (JSON.parse(net.toLaneMarkingsGeojson()) as { features: Feature[] }).features)
      if (PAINT.has(String(f.properties.type ?? ''))) s.paint.push(...polysOf(f.geometry, proj))
    // Sávok utanként (az osm2streets az utakat a kereszteződéseknél darabolja: az első darab sávjai számítanak)
    const full = JSON.parse(net.toJson()) as { roads: Array<[number, { osm_ids: number[]; lane_specs_ltr: Array<{ lt: unknown; dir: string; width: number }> }]> }
    for (const [, r] of full.roads)
      for (const wid of r.osm_ids) {
        const id = wid - 1
        if (s.lanes.has(id)) continue
        s.lanes.set(
          id,
          r.lane_specs_ltr.map((l) => ({ type: typeof l.lt === 'string' ? l.lt : `Buffer(${Object.values(l.lt as object)[0]})`, dir: l.dir === 'Back' ? 'Back' : 'Fwd', width: l.width / 10000 })),
        )
      }
    return s
  } catch (e) {
    // A WebAssembly-modul egy belső hiba után nem biztos, hogy használható: a további vezetések a régi geometriát kapják
    broken = true
    warn('osm2streets hiba, egyszerűbb utcageometria', e)
    return null
  } finally {
    Object.assign(console, { warn, error, log })
    net?.free()
  }
}

/** Pont a sokszögben (páros–páratlan szabály, a lyukakat kivéve) */
export function inPoly(p: XZ, poly: Poly): boolean {
  const [x, z] = p
  if (x < poly.bbox[0] || x > poly.bbox[2] || z < poly.bbox[1] || z > poly.bbox[3]) return false
  if (!inRing(p, poly.outer)) return false
  return !poly.holes.some((h) => inRing(p, h))
}

function inRing([x, z]: XZ, ring: XZ[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** A pont távolsága a sokszög határától (m); a belsejében 0 */
export function distToPoly(p: XZ, poly: Poly): number {
  if (inPoly(p, poly)) return 0
  let best = Infinity
  for (const ring of [poly.outer, ...poly.holes])
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) best = Math.min(best, segDist(p, ring[j], ring[i]))
  return best
}

function segDist(p: XZ, a: XZ, b: XZ): number {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const len2 = vx * vx + vz * vz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2))
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t)
}
