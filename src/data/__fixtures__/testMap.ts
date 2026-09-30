import type { LineString } from 'geojson'
import type { OsmData, OsmNode, OsmWay } from '../osm'

/**
 * Mesterséges térképrészlet (47.5° szélességen 0.001° hosszúság ≈ 75 m, 0.001° szélesség ≈ 111 m):
 *
 *   Fő utca (secondary, 50 km/h) keletre: 1 — 2 — 3 — 4 — 5
 *   - 2-nél lakóutca keresztezi (tábla nélkül)                    → főútvonal (ellenőrizendő)
 *   - 3-nál lakóutca, amelyen „Elsőbbségadás kötelező” tábla áll   → főútvonal
 *   - 4-nél balra fordulunk a Kis utcába (30 km/h)                 → balra kanyarodás + sebességváltozás
 *   - a Kis utcán 40-nél keresztút, előtte STOP a mi oldalunkon     → STOP
 *   - 75 m-nél zebra a Fő utcán                                     → zebra
 */
const n = (id: number, lon: number, lat: number, tags?: Record<string, string>): OsmNode => ({ type: 'node', id, lon, lat, tags })

export const coords: Record<number, [number, number]> = {
  1: [19.0, 47.5],
  2: [19.002, 47.5],
  3: [19.004, 47.5],
  4: [19.006, 47.5],
  5: [19.008, 47.5],
  20: [19.002, 47.499],
  21: [19.002, 47.501],
  30: [19.004, 47.499],
  31: [19.004, 47.501],
  40: [19.006, 47.501],
  41: [19.006, 47.503],
  50: [19.005, 47.501],
  51: [19.007, 47.501],
}

export const way = (id: number, nodes: number[], tags: Record<string, string>): OsmWay => ({
  type: 'way',
  id,
  nodes,
  geometry: nodes.map((i) => ({ lon: coords[i][0], lat: coords[i][1] })),
  tags,
})

export const osm: OsmData = {
  elements: [
    way(1, [1, 2, 3, 4, 5], { highway: 'secondary', name: 'Fő utca', maxspeed: '50' }),
    way(2, [20, 2, 21], { highway: 'residential', name: 'Mellék utca' }),
    way(3, [30, 3, 31], { highway: 'residential', name: 'Harmadik utca' }),
    way(4, [4, 40, 41], { highway: 'residential', name: 'Kis utca', maxspeed: '30' }),
    way(5, [50, 40, 51], { highway: 'residential', name: 'Kereszt utca' }),
    // Elsőbbségadás kötelező a 3-as keresztutcán (nem a mi utunkon)
    n(900, 19.004, 47.5003, { highway: 'give_way' }),
    // STOP a Kis utcán, a 40-es csomópont előtt, a mi oldalunkon
    n(901, 19.006, 47.5008, { highway: 'stop' }),
    // Zebra a Fő utcán
    n(902, 19.001, 47.5, { highway: 'crossing', crossing: 'marked' }),
    // Jelöletlen átkelő: nem számít
    n(903, 19.003, 47.5, { highway: 'crossing', crossing: 'unmarked' }),
  ],
}

export const route: LineString = { type: 'LineString', coordinates: [coords[1], coords[4], coords[41]] }

