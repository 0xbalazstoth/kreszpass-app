import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeOsm, type OsmData } from '../../data/osm'
import { decodeTile, lonLatToTile, type TileJson } from '../../data/osmTileFormat'
import type { BBox } from '../../lib/geo'
import { initStreetsSync } from '../world/streets'
import { initSurfaces } from '../world/surfaces'

/** Tesztekhez: a helyi OSM-csempék betöltése közvetlenül a lemezről (a public/osm mappából) */
const DIR = join(import.meta.dirname, '..', '..', '..', 'public', 'osm')

export function hasLocalTiles(): boolean {
  return existsSync(join(DIR, 'index.json'))
}

// A felületek kerekítéséhez és csempézéséhez (Clipper, WebAssembly): a tesztek előtt betöltve
await initSurfaces()

/** Az osm2streets (WebAssembly) betöltése Node alatt, a valósághű utcageometriához */
export function initStreetsForTests(): void {
  initStreetsSync(readFileSync(join(import.meta.dirname, '..', '..', '..', 'node_modules', 'osm2streets-js', 'osm2streets_js_bg.wasm')))
}

export function loadArea([w, s, e, n]: BBox): OsmData {
  initStreetsForTests()
  const zoom = 13
  const [x0, y0] = lonLatToTile(w, n, zoom)
  const [x1, y1] = lonLatToTile(e, s, zoom)
  const parts: OsmData[] = []
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const f = join(DIR, String(zoom), String(x), `${y}.json`)
      if (existsSync(f)) parts.push(decodeTile(JSON.parse(readFileSync(f, 'utf8')) as TileJson))
    }
  return mergeOsm(parts)
}
