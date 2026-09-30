import type { OsmData, OsmNode, OsmWay, Tags } from './osm.ts'

/**
 * Helyi OpenStreetMap-csempék formátuma.
 *
 * A build (scripts/build-osm.ts) egyszer, Magyarország teljes OSM-kivonatából elkészíti a helyzetfelismeréshez
 * szükséges adatokat, web-mercator csempékre bontva (public/osm/<z>/<x>/<y>.json). Az app ezeket a saját
 * szerveréről tölti be, így nem függ a túlterhelt nyilvános Overpass szerverektől.
 *
 * Ez a modul importot nem használ (csak típust), hogy a Node-os build script is közvetlenül betölthesse.
 */

export const TILE_ZOOM = 13
// 2: vasúti átjárók, táblapontok (traffic_sign), egyirányú utak
// 3: forgalmi sávok száma (lanes), villamos- és autóbuszmegállók
export const TILE_FORMAT_VERSION = 3

/** Utak címkéi, amelyeket a helyzetfelismerés használ */
export const WAY_TAG_KEYS = ['highway', 'name', 'ref', 'maxspeed', 'maxspeed:forward', 'junction', 'priority_road', 'oneway', 'lanes'] as const
/** Tábla/lámpa/zebra/vasúti átjáró pontok címkéi */
export const NODE_TAG_KEYS = [
  'highway',
  'crossing',
  'crossing_signals',
  'railway',
  'crossing:barrier',
  'crossing:light',
  'traffic_sign',
  'traffic_sign:direction',
  'direction',
  'maxspeed',
  'public_transport',
  'bus',
  'tram',
] as const
/** Ezeket a pontokat tartjuk meg (a helyzetfelismerés ezekből dolgozik) */
export const CONTROL_HIGHWAYS = new Set(['stop', 'give_way', 'traffic_signals', 'crossing', 'mini_roundabout'])

/** Megtartandó pont-e: tábla, lámpa, zebra, vasúti átjáró, kitáblázott jelzőtábla, villamos- vagy autóbuszmegálló */
export function isControlNode(tags: Tags | undefined | null): boolean {
  if (!tags) return false
  return (
    CONTROL_HIGHWAYS.has(tags.highway ?? '') ||
    tags.railway === 'level_crossing' ||
    Boolean(tags.traffic_sign) ||
    isTransitStop(tags) !== null
  )
}

/** Villamos- vagy autóbuszmegálló pont-e (a peron vagy a megállási pont) */
export function isTransitStop(tags: Tags | undefined | null): 'tram' | 'bus' | null {
  if (!tags) return null
  if (tags.railway === 'tram_stop') return 'tram'
  if (tags.highway === 'bus_stop') return 'bus'
  if (tags.public_transport === 'stop_position') {
    if (tags.tram === 'yes') return 'tram'
    if (tags.bus === 'yes') return 'bus'
  }
  return null
}

/**
 * A csak alakot adó (nem csomóponti) töréspontok nem kapnak valódi OSM-azonosítót, dekódoláskor
 * egyedi negatív azonosítót kapnak. Így a kereszteződés-felismerés (azonos csomópont több úton) pontos marad.
 */
export function syntheticNodeId(wayId: number, index: number): number {
  return -(wayId * 100_000 + index)
}

// ---------------------------------------------------------------- csempe-matek

export function lonLatToTileFloat(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const x = ((lon + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return [x, y]
}

export function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const [x, y] = lonLatToTileFloat(lon, lat, z)
  return [Math.floor(x), Math.floor(y)]
}

/** Csempe befoglaló téglalapja: [nyugat, dél, kelet, észak] */
export function tileBounds(x: number, y: number, z: number): [number, number, number, number] {
  const n = 2 ** z
  const lon = (tx: number) => (tx / n) * 360 - 180
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)]
}

export function tileKey(x: number, y: number): string {
  return `${x}/${y}`
}

// ---------------------------------------------------------------- kódolás

/** Egy csempe JSON-ja: címkeszótár, utak és pontok */
export interface TileJson {
  v: number
  /** Címkeszótár (az utak és pontok erre hivatkoznak sorszámmal) */
  t: Tags[]
  /** [id, címke, koordináták (lonE6, latE6 különbségekkel), csomópontok [sorszám, azonosító, ...]] */
  w: Array<[number, number, number[], number[]]>
  /** [id, lonE6, latE6, címke] */
  n: Array<[number, number, number, number]>
}

export interface EncWay {
  id: number
  tags: Tags
  /** [lon, lat] fokban */
  coords: Array<[number, number]>
  /** Valódi OSM-azonosító a csomópontoknál (végpont vagy több út közös pontja), egyébként null */
  nodeIds: Array<number | null>
}

export interface EncNode {
  id: number
  lon: number
  lat: number
  tags: Tags
}

function pickTags(tags: Tags, keys: readonly string[]): Tags {
  const out: Tags = {}
  for (const k of keys) if (tags[k] !== undefined) out[k] = tags[k]
  return out
}

const e6 = (v: number) => Math.round(v * 1e6)

export function encodeTile(ways: EncWay[], nodes: EncNode[]): TileJson {
  const dict: Tags[] = []
  const index = new Map<string, number>()
  const tagIdx = (tags: Tags) => {
    const key = JSON.stringify(tags)
    let i = index.get(key)
    if (i === undefined) {
      i = dict.length
      dict.push(tags)
      index.set(key, i)
    }
    return i
  }
  const w: TileJson['w'] = ways.map((way) => {
    const coords: number[] = []
    let plon = 0
    let plat = 0
    for (const [lon, lat] of way.coords) {
      const x = e6(lon)
      const y = e6(lat)
      coords.push(x - plon, y - plat)
      plon = x
      plat = y
    }
    const topo: number[] = []
    way.nodeIds.forEach((id, i) => {
      if (id !== null) topo.push(i, id)
    })
    return [way.id, tagIdx(pickTags(way.tags, WAY_TAG_KEYS)), coords, topo]
  })
  const n: TileJson['n'] = nodes.map((node) => [node.id, e6(node.lon), e6(node.lat), tagIdx(pickTags(node.tags, NODE_TAG_KEYS))])
  return { v: TILE_FORMAT_VERSION, t: dict, w, n }
}

export function decodeTile(tile: TileJson): OsmData {
  if (tile.v !== TILE_FORMAT_VERSION) throw new Error(`Ismeretlen csempeformátum: ${tile.v}`)
  const elements: OsmData['elements'] = []
  for (const [id, t, coords, topo] of tile.w) {
    const geometry: OsmWay['geometry'] = []
    let lon = 0
    let lat = 0
    for (let i = 0; i < coords.length; i += 2) {
      lon += coords[i]
      lat += coords[i + 1]
      geometry.push({ lon: lon / 1e6, lat: lat / 1e6 })
    }
    const nodes = geometry.map((_, i) => syntheticNodeId(id, i))
    for (let i = 0; i < topo.length; i += 2) nodes[topo[i]] = topo[i + 1]
    elements.push({ type: 'way', id, nodes, geometry, tags: { ...tile.t[t] } })
  }
  for (const [id, lon, lat, t] of tile.n) {
    const node: OsmNode = { type: 'node', id, lon: lon / 1e6, lat: lat / 1e6, tags: { ...tile.t[t] } }
    elements.push(node)
  }
  return { elements }
}

/**
 * OsmData (pl. Overpass-válasz vagy tesztadat) átalakítása kódolható formára: csak a csomóponti
 * (végpont vagy több út közös) pontok tartják meg a valódi azonosítójukat.
 */
export function toEncodable(osm: OsmData): { ways: EncWay[]; nodes: EncNode[] } {
  const ways = osm.elements.filter((e): e is OsmWay => e.type === 'way')
  const count = new Map<number, number>()
  // Előfordulások száma (egy úton belüli ismétlődést is számolva, ahogy a build script)
  for (const w of ways) for (const id of w.nodes) count.set(id, (count.get(id) ?? 0) + 1)
  const encWays: EncWay[] = ways.map((w) => ({
    id: w.id,
    tags: w.tags ?? {},
    coords: w.geometry.map((g) => [g.lon, g.lat] as [number, number]),
    nodeIds: w.nodes.map((id, i) => (i === 0 || i === w.nodes.length - 1 || (count.get(id) ?? 0) >= 2 ? id : null)),
  }))
  const nodes: EncNode[] = osm.elements
    .filter((e): e is OsmNode => e.type === 'node' && isControlNode(e.tags))
    .map((n) => ({ id: n.id, lon: n.lon, lat: n.lat, tags: n.tags ?? {} }))
  return { ways: encWays, nodes }
}

// ---------------------------------------------------------------- index

export interface OsmIndexJson {
  v: number
  zoom: number
  /** A forrásadat időpontja (ISO) */
  dataDate: string
  builtAt: string
  source: string
  attribution: string
  /** [nyugat, dél, kelet, észak] */
  bbox: [number, number, number, number]
  /** A létező csempék "x/y" alakban, vesszővel elválasztva */
  tiles: string
}
