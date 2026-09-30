import type { LineString } from 'geojson'
import { RouteGeom, type BBox } from '../lib/geo'
import { mergeOsm, type OsmData } from './osm'
import { decodeTile, lonLatToTile, lonLatToTileFloat, tileKey, TILE_FORMAT_VERSION, type OsmIndexJson, type TileJson } from './osmTileFormat'

/**
 * Helyi (az apphoz csomagolt) OpenStreetMap-csempék betöltése. Ezeket a `npm run osm` készíti el
 * Magyarország teljes kivonatából; az app a saját szerveréről tölti be őket, külső szolgáltatás nélkül.
 */

export interface LocalIndex {
  zoom: number
  dataDate: string
  builtAt: string
  attribution: string
  bbox: [number, number, number, number]
  tiles: Set<string>
}

type FetchLike = typeof fetch

const base = () => `${import.meta.env.BASE_URL}osm/`

let indexPromise: Promise<LocalIndex | null> | null = null

/** A helyi adatcsomag jegyzéke; ha nincs (még nem futott a `npm run osm`), null */
export function loadLocalIndex(fetchImpl: FetchLike = fetch): Promise<LocalIndex | null> {
  indexPromise ??= (async () => {
    try {
      const res = await fetchImpl(`${base()}index.json`, { cache: 'no-cache' })
      if (!res.ok) return null
      const text = await res.text()
      // Egyes tárhelyek hiányzó fájlra is az index.html-t adják vissza
      if (!text.trimStart().startsWith('{')) return null
      const j = JSON.parse(text) as OsmIndexJson
      if (j.v !== TILE_FORMAT_VERSION) return null
      return { zoom: j.zoom, dataDate: j.dataDate, builtAt: j.builtAt, attribution: j.attribution, bbox: j.bbox, tiles: new Set(j.tiles ? j.tiles.split(',') : []) }
    } catch {
      return null
    }
  })()
  return indexPromise
}

/** Teszteléshez: a jegyzék újratöltése */
export function resetLocalIndex(): void {
  indexPromise = null
  tileCache.clear()
}

const EARTH_CIRCUMFERENCE_M = 40_075_016.686

/**
 * Az útvonal által érintett csempék. 25 méterenként mintavételez, és ha egy pont 60 m-nél közelebb van
 * a csempe széléhez, a szomszéd csempét is hozzáveszi (a keresztutcák és táblák ott is lehetnek).
 */
export function tilesForRoute(line: LineString, zoom: number, bufferM = 60): string[] {
  const geom = new RouteGeom(line)
  const keys = new Set<string>()
  const addPoint = (lon: number, lat: number) => {
    const [fx, fy] = lonLatToTileFloat(lon, lat, zoom)
    const x = Math.floor(fx)
    const y = Math.floor(fy)
    const tileM = (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
    const b = bufferM / tileM
    const dx = fx - x < b ? -1 : fx - x > 1 - b ? 1 : 0
    const dy = fy - y < b ? -1 : fy - y > 1 - b ? 1 : 0
    keys.add(tileKey(x, y))
    if (dx) keys.add(tileKey(x + dx, y))
    if (dy) keys.add(tileKey(x, y + dy))
    if (dx && dy) keys.add(tileKey(x + dx, y + dy))
  }
  for (let d = 0; d < geom.length; d += 25) addPoint(...geom.pointAt(d))
  addPoint(...geom.pointAt(geom.length))
  return [...keys]
}

/** Az útvonal teljesen a helyi adatcsomag területén belül van-e */
export function inCoverage(line: LineString, index: Pick<LocalIndex, 'bbox'>): boolean {
  const [w, s, e, n] = index.bbox
  return line.coordinates.every(([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n)
}

const tileCache = new Map<string, Promise<OsmData>>()

export interface LocalFetchOptions {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  fetchImpl?: FetchLike
}

/** Egy terület ([ny, d, k, é]) összes csempéje */
export function tilesForBBox([w, s, e, n]: BBox, zoom: number): string[] {
  const [x0, y0] = lonLatToTile(w, n, zoom)
  const [x1, y1] = lonLatToTile(e, s, zoom)
  const keys: string[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(tileKey(x, y))
  return keys
}

/** Az útvonalhoz szükséges helyi csempék betöltése (6 párhuzamosan) és összefésülése */
export function fetchLocalOsm(line: LineString, index: LocalIndex, opts: LocalFetchOptions = {}): Promise<OsmData> {
  return loadTiles(tilesForRoute(line, index.zoom), index, opts)
}

/** Egy terület helyi csempéinek betöltése (pl. az utcanevekből összeállított útvonalhoz) */
export function fetchLocalOsmBBox(bbox: BBox, index: LocalIndex, opts: LocalFetchOptions = {}): Promise<OsmData> {
  return loadTiles(tilesForBBox(bbox, index.zoom), index, opts)
}

async function loadTiles(wanted: string[], index: LocalIndex, opts: LocalFetchOptions): Promise<OsmData> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const keys = wanted.filter((k) => index.tiles.has(k))
  const results: OsmData[] = []
  let done = 0
  opts.onProgress?.(0, keys.length)
  const load = (key: string): Promise<OsmData> => {
    const cacheKey = `${index.builtAt}|${index.zoom}/${key}`
    let p = tileCache.get(cacheKey)
    if (!p) {
      // A verzió a címben: új adatcsomagnál a böngésző és a service worker is friss csempét kér
      p = fetchImpl(`${base()}${index.zoom}/${key}.json?v=${encodeURIComponent(index.builtAt)}`, { signal: opts.signal })
        .then(async (res) => {
          if (res.status === 404) return { elements: [] }
          if (!res.ok) throw new Error(`A helyi térképcsempe nem tölthető be (${res.status})`)
          return decodeTile((await res.json()) as TileJson)
        })
        .catch((e) => {
          tileCache.delete(cacheKey)
          throw e
        })
      tileCache.set(cacheKey, p)
    }
    return p
  }
  const queue = [...keys]
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      results.push(await load(key))
      opts.onProgress?.(++done, keys.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, keys.length) }, worker))
  return mergeOsm(results)
}
