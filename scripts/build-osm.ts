#!/usr/bin/env node
/**
 * Helyi OpenStreetMap-adatcsomag készítése Magyarország teljes kivonatából (Geofabrik, ingyenes, ODbL).
 *
 * A helyzetfelismeréshez szükséges adatokat (autóval járható utak, STOP/elsőbbségadás/lámpa/zebra/vasúti átjáró
 * és jelzőtábla-pontok)
 * z13-as csempékre bontva a public/osm mappába írja. Az app ezekből dolgozik, így nem függ a túlterhelt
 * nyilvános Overpass szerverektől.
 *
 * Használat (Node 24, a .ts fájlt közvetlenül futtatja):
 *   npm run osm                       # letölti (ha 7 napnál régebbi) és elkészíti
 *   npm run osm -- --refresh          # mindenképp friss letöltés
 *   npm run osm -- --bbox 18.9,47.4,19.2,47.6   # csak egy terület (gyors próbához)
 *   npm run osm -- --input sajat.osm.pbf         # meglévő PBF fájlból
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { readOsmPbf, type OsmPbfBlock } from '@osmix/pbf'
import { DRIVABLE, type Tags } from '../src/data/osm.ts'
import {
  encodeTile,
  isControlNode,
  lonLatToTile,
  NODE_TAG_KEYS,
  TILE_FORMAT_VERSION,
  TILE_ZOOM,
  tileKey,
  WAY_TAG_KEYS,
  type EncNode,
  type EncWay,
  type OsmIndexJson,
} from '../src/data/osmTileFormat.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_URL = 'https://download.geofabrik.de/europe/hungary-latest.osm.pbf'
const CACHE_FILE = join(ROOT, '.cache', 'osm', 'hungary-latest.osm.pbf')
const OUT_DIR = join(ROOT, 'public', 'osm')
const MAX_AGE_MS = 7 * 24 * 3600 * 1000
const USER_AGENT = 'KreszPass/0.3 (personal driving-exam practice app; build-time OSM extract)'
const MISSING = -2147483648

// ---------------------------------------------------------------- paraméterek

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0) return process.argv[i + 1]
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  return eq?.slice(name.length + 3)
}
const REFRESH = process.argv.includes('--refresh')
const ZOOM = Number(arg('zoom') ?? TILE_ZOOM)
const BBOX = arg('bbox')?.split(',').map(Number) as [number, number, number, number] | undefined
const INPUT = arg('input')

const t0 = Date.now()
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`
const log = (msg: string) => console.log(`[${elapsed()}] ${msg}`)

// ---------------------------------------------------------------- letöltés

async function ensureSource(): Promise<string> {
  if (INPUT) return INPUT
  const fresh = existsSync(CACHE_FILE) && Date.now() - statSync(CACHE_FILE).mtimeMs < MAX_AGE_MS
  if (fresh && !REFRESH) {
    log(`Meglévő kivonat: ${CACHE_FILE} (${mb(statSync(CACHE_FILE).size)})`)
    return CACHE_FILE
  }
  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  log(`Letöltés: ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok || !res.body) throw new Error(`Letöltési hiba: ${res.status} ${res.statusText}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  let done = 0
  let lastPct = -1
  const progress = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      done += chunk.byteLength
      const pct = total ? Math.floor((done / total) * 20) * 5 : 0
      if (pct !== lastPct) {
        lastPct = pct
        log(`  ${pct}% (${mb(done)})`)
      }
      ctrl.enqueue(chunk)
    },
  })
  const part = `${CACHE_FILE}.part`
  await pipeline(Readable.fromWeb(res.body.pipeThrough(progress) as never), createWriteStream(part))
  renameSync(part, CACHE_FILE)
  return CACHE_FILE
}

// ---------------------------------------------------------------- PBF segédek

async function* readBlocks(file: string): AsyncGenerator<OsmPbfBlock> {
  const { blocks } = await readOsmPbf(Readable.toWeb(createReadStream(file, { highWaterMark: 1 << 22 })) as never)
  yield* blocks
}

const decoder = new TextDecoder()
/** A blokk szövegtáblája lustán dekódolva */
function stringTable(block: OsmPbfBlock) {
  const cache: (string | undefined)[] = []
  return (i: number) => (cache[i] ??= decoder.decode(block.stringtable[i]))
}

/** Rendezett tömbben bináris keresés; −1, ha nincs benne */
function bsearch(arr: Float64Array, value: number): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const v = arr[mid]
    if (v < value) lo = mid + 1
    else if (v > value) hi = mid - 1
    else return mid
  }
  return -1
}

// ---------------------------------------------------------------- 1. menet: utak

interface WayStore {
  ids: number[]
  tagIdx: number[]
  refStart: number[]
  refs: Float64Array
  refLen: number
  tagDict: Tags[]
}

async function readWays(file: string): Promise<WayStore> {
  const store: WayStore = { ids: [], tagIdx: [], refStart: [0], refs: new Float64Array(1 << 23), refLen: 0, tagDict: [] }
  const tagIndex = new Map<string, number>()
  let blocks = 0
  for await (const block of readBlocks(file)) {
    blocks++
    if (blocks % 500 === 0) log(`  1. menet: ${blocks} blokk, ${store.ids.length} út`)
    for (const group of block.primitivegroup) {
      if (!group.ways.length) continue
      const str = stringTable(block)
      for (const way of group.ways) {
        const all: Tags = {}
        for (let i = 0; i < way.keys.length; i++) {
          const k = str(way.keys[i])
          if (k === 'highway' || k === 'area' || k === 'access' || (WAY_TAG_KEYS as readonly string[]).includes(k)) all[k] = str(way.vals[i])
        }
        // Ugyanaz a szűrés, mint az app isDrivableWay függvényében
        if (!DRIVABLE.has(all.highway ?? '') || all.area === 'yes' || all.access === 'no') continue
        const tags: Tags = {}
        for (const k of WAY_TAG_KEYS) if (all[k] !== undefined) tags[k] = all[k]
        const key = JSON.stringify(tags)
        let ti = tagIndex.get(key)
        if (ti === undefined) {
          ti = store.tagDict.length
          store.tagDict.push(tags)
          tagIndex.set(key, ti)
        }
        // A csomópont-azonosítók különbségekkel kódoltak
        let id = 0
        if (store.refLen + way.refs.length > store.refs.length) {
          const bigger = new Float64Array(store.refs.length * 2)
          bigger.set(store.refs)
          store.refs = bigger
        }
        for (const d of way.refs) {
          id += d
          store.refs[store.refLen++] = id
        }
        store.ids.push(way.id)
        store.tagIdx.push(ti)
        store.refStart.push(store.refLen)
      }
    }
  }
  log(`1. menet kész: ${store.ids.length} út, ${store.refLen} csomópont-hivatkozás`)
  return store
}

// ---------------------------------------------------------------- 2. menet: pontok

interface NodeStore {
  uniq: Float64Array
  count: Uint8Array
  lonE7: Int32Array
  latE7: Int32Array
  controls: EncNode[]
}

async function readNodes(file: string, ways: WayStore): Promise<NodeStore> {
  const all = ways.refs.slice(0, ways.refLen).sort()
  // Egyedi azonosítók és előfordulásszám (≥2 → több út közös pontja → kereszteződés-jelölt)
  const uniq = new Float64Array(all.length)
  const count = new Uint8Array(all.length)
  let n = 0
  for (let i = 0; i < all.length; i++) {
    if (n > 0 && uniq[n - 1] === all[i]) {
      if (count[n - 1] < 255) count[n - 1]++
    } else {
      uniq[n] = all[i]
      count[n] = 1
      n++
    }
  }
  const store: NodeStore = {
    uniq: uniq.slice(0, n),
    count: count.slice(0, n),
    lonE7: new Int32Array(n).fill(MISSING),
    latE7: new Int32Array(n).fill(MISSING),
    controls: [],
  }
  log(`${n} szükséges csomópont; 2. menet (koordináták)…`)
  const [bw, bs, be, bn] = BBOX ?? [-180, -90, 180, 90]
  let blocks = 0
  let found = 0
  outer: for await (const block of readBlocks(file)) {
    blocks++
    if (blocks % 500 === 0) log(`  2. menet: ${blocks} blokk, ${found} koordináta`)
    const gran = block.granularity ?? 100
    const latOff = block.lat_offset ?? 0
    const lonOff = block.lon_offset ?? 0
    const str = stringTable(block)
    for (const group of block.primitivegroup) {
      // A PBF-ben a pontok az utak előtt vannak: az első útnál megállhatunk
      if (group.ways.length || group.relations.length) break outer
      const handle = (id: number, rawLat: number, rawLon: number, tags: Tags | null) => {
        const latE7 = Math.round((latOff + gran * rawLat) / 100)
        const lonE7 = Math.round((lonOff + gran * rawLon) / 100)
        const lat = latE7 / 1e7
        const lon = lonE7 / 1e7
        if (lon < bw || lon > be || lat < bs || lat > bn) return
        const idx = bsearch(store.uniq, id)
        if (idx >= 0) {
          store.latE7[idx] = latE7
          store.lonE7[idx] = lonE7
          found++
        }
        if (isControlNode(tags)) store.controls.push({ id, lon, lat, tags: tags as Tags })
      }
      const dense = group.dense
      if (dense) {
        let id = 0
        let lat = 0
        let lon = 0
        let kv = 0
        const kvs = dense.keys_vals
        for (let i = 0; i < dense.id.length; i++) {
          id += dense.id[i]
          lat += dense.lat[i]
          lon += dense.lon[i]
          let tags: Tags | null = null
          if (kvs.length) {
            while (kv < kvs.length && kvs[kv] !== 0) {
              const k = str(kvs[kv])
              if (k === 'highway' || (NODE_TAG_KEYS as readonly string[]).includes(k)) (tags ??= {})[k] = str(kvs[kv + 1])
              kv += 2
            }
            kv++ // a pont címkéit lezáró 0
          }
          handle(id, lat, lon, tags)
        }
      }
      for (const node of group.nodes) {
        let tags: Tags | null = null
        for (let i = 0; i < node.keys.length; i++) {
          const k = str(node.keys[i])
          if (k === 'highway' || (NODE_TAG_KEYS as readonly string[]).includes(k)) (tags ??= {})[k] = str(node.vals[i])
        }
        handle(node.id, node.lat, node.lon, tags)
      }
    }
  }
  log(`2. menet kész: ${found}/${n} koordináta, ${store.controls.length} tábla/lámpa/zebra pont`)
  return store
}

// ---------------------------------------------------------------- csempék

/** Méter → fok a csempék sűrítéséhez (hosszú szakaszok se ugorjanak át egy csempét) */
const STEP_DEG = 0.002

function writeTiles(ways: WayStore, nodes: NodeStore, dataDate: string) {
  const refIdx = new Int32Array(ways.refLen)
  for (let i = 0; i < ways.refLen; i++) refIdx[i] = bsearch(nodes.uniq, ways.refs[i])
  log('Csempék kiosztása…')

  const tileWays = new Map<string, number[]>()
  const tileNodes = new Map<string, EncNode[]>()
  const add = <T>(map: Map<string, T[]>, key: string, v: T) => {
    const list = map.get(key)
    if (list) list.push(v)
    else map.set(key, [v])
  }
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (let w = 0; w < ways.ids.length; w++) {
    const keys = new Set<string>()
    let px: number | null = null
    let py: number | null = null
    for (let r = ways.refStart[w]; r < ways.refStart[w + 1]; r++) {
      const idx = refIdx[r]
      if (idx < 0 || nodes.latE7[idx] === MISSING) continue
      const lon = nodes.lonE7[idx] / 1e7
      const lat = nodes.latE7[idx] / 1e7
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
      if (px !== null && py !== null) {
        const steps = Math.ceil(Math.max(Math.abs(lon - px), Math.abs(lat - py)) / STEP_DEG)
        for (let s = 1; s < steps; s++) {
          const [tx, ty] = lonLatToTile(px + ((lon - px) * s) / steps, py + ((lat - py) * s) / steps, ZOOM)
          keys.add(tileKey(tx, ty))
        }
      }
      const [tx, ty] = lonLatToTile(lon, lat, ZOOM)
      keys.add(tileKey(tx, ty))
      px = lon
      py = lat
    }
    for (const k of keys) add(tileWays, k, w)
  }
  for (const c of nodes.controls) {
    const [tx, ty] = lonLatToTile(c.lon, c.lat, ZOOM)
    add(tileNodes, tileKey(tx, ty), c)
  }

  const zoomDir = join(OUT_DIR, String(ZOOM))
  rmSync(zoomDir, { recursive: true, force: true })
  const keys = [...new Set([...tileWays.keys(), ...tileNodes.keys()])].sort()
  log(`${keys.length} csempe írása…`)
  let bytes = 0
  let largest = { key: '', size: 0 }
  const made = new Set<string>()
  for (const key of keys) {
    const encWays: EncWay[] = (tileWays.get(key) ?? []).map((w) => {
      const coords: Array<[number, number]> = []
      const nodeIds: Array<number | null> = []
      const start = ways.refStart[w]
      const end = ways.refStart[w + 1]
      for (let r = start; r < end; r++) {
        const idx = refIdx[r]
        if (idx < 0 || nodes.latE7[idx] === MISSING) continue
        coords.push([nodes.lonE7[idx] / 1e7, nodes.latE7[idx] / 1e7])
        // Valódi azonosító: végpont vagy több helyen előforduló pont
        nodeIds.push(r === start || r === end - 1 || nodes.count[idx] >= 2 ? nodes.uniq[idx] : null)
      }
      return { id: ways.ids[w], tags: ways.tagDict[ways.tagIdx[w]], coords, nodeIds }
    })
    const json = JSON.stringify(encodeTile(encWays.filter((w) => w.coords.length >= 2), tileNodes.get(key) ?? []))
    const [x] = key.split('/')
    const dir = join(zoomDir, x)
    if (!made.has(dir)) {
      mkdirSync(dir, { recursive: true })
      made.add(dir)
    }
    writeFileSync(join(zoomDir, `${key}.json`), json)
    bytes += json.length
    if (json.length > largest.size) largest = { key, size: json.length }
  }

  const index: OsmIndexJson = {
    v: TILE_FORMAT_VERSION,
    zoom: ZOOM,
    dataDate,
    builtAt: new Date().toISOString(),
    source: INPUT ?? SOURCE_URL,
    attribution: '© OpenStreetMap közreműködők, ODbL (Geofabrik kivonat)',
    bbox: BBOX ?? [west, south, east, north],
    tiles: keys.join(','),
  }
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index))
  log(`Kész: ${keys.length} csempe, összesen ${mb(bytes)}, legnagyobb ${largest.key} (${mb(largest.size)})`)
}

// ---------------------------------------------------------------- futtatás

async function main() {
  const file = await ensureSource()
  const { header } = await readOsmPbf(Readable.toWeb(createReadStream(file)) as never)
  const ts = header.osmosis_replication_timestamp
  const dataDate = ts ? new Date(ts * 1000).toISOString() : new Date(statSync(file).mtimeMs).toISOString()
  log(`Forrás: ${file}, adat dátuma: ${dataDate.slice(0, 10)}${BBOX ? `, terület: ${BBOX.join(',')}` : ''}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const ways = await readWays(file)
  const nodes = await readNodes(file, ways)
  writeTiles(ways, nodes, dataDate)
  const mem = process.memoryUsage()
  log(`Memória: ${mb(mem.rss)} (heap ${mb(mem.heapUsed)})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
