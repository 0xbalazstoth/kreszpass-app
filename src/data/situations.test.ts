import type { LineString } from 'geojson'
import { describe, expect, it } from 'vitest'
import type { OsmData, OsmNode, OsmWay } from './osm'
import { generateSituations } from './situations'

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

const coords: Record<number, [number, number]> = {
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

const way = (id: number, nodes: number[], tags: Record<string, string>): OsmWay => ({
  type: 'way',
  id,
  nodes,
  geometry: nodes.map((i) => ({ lon: coords[i][0], lat: coords[i][1] })),
  tags,
})

const osm: OsmData = {
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

const route: LineString = { type: 'LineString', coordinates: [coords[1], coords[4], coords[41]] }

let counter = 0
const result = generateSituations(route, osm, { routeId: 'r1', newId: () => `s${++counter}` })
const near = (d: number, tol = 12) => result.filter((s) => Math.abs(s.d - d) <= tol)

describe('generateSituations', () => {
  it('a zebrát felismeri, a jelöletlen átkelőt nem', () => {
    expect(near(75).map((s) => s.kind)).toEqual(['crossing'])
    expect(near(225).filter((s) => s.kind === 'crossing')).toHaveLength(0)
  })

  it('tábla nélküli keresztezésnél az úttípusból főútvonalra következtet, de ellenőrzést kér', () => {
    const [s] = near(150)
    expect(s.kind).toBe('priority')
    expect(s.needsReview).toBe(true)
    expect(s.turn).toBe('straight')
  })

  it('a keresztutca elsőbbségadás táblájából főútvonalat állapít meg', () => {
    const [s] = near(301)
    expect(s.kind).toBe('priority')
    expect(s.needsReview).toBe(false)
  })

  it('a balra kanyarodást felismeri', () => {
    const s = near(451).find((x) => x.kind !== 'speed_change')!
    expect(s.turn).toBe('left')
    expect(s.kind).toBe('priority')
  })

  it('a sebességváltozást felismeri', () => {
    const s = result.find((x) => x.kind === 'speed_change')!
    expect(s).toBeDefined()
    expect(s.speedFrom).toBe(50)
    expect(s.speedTo).toBe(30)
    expect(s.d).toBeGreaterThan(430)
    expect(s.d).toBeLessThan(480)
  })

  it('a saját oldalunkon lévő STOP táblát felismeri', () => {
    const s = near(562).find((x) => x.kind !== 'speed_change')!
    expect(s.kind).toBe('stop')
    expect(s.turn).toBe('straight')
  })

  it('a helyzetek útvonal szerint rendezettek, és a haladási irány helyes', () => {
    const ds = result.map((s) => s.d)
    expect([...ds].sort((a, b) => a - b)).toEqual(ds)
    expect(near(150)[0].bearing).toBeGreaterThan(80)
    expect(near(150)[0].bearing).toBeLessThan(100)
    expect(near(562).find((x) => x.kind === 'stop')!.bearing).toBeLessThan(10)
  })
})

describe('kettős úttestű lámpás csomópont', () => {
  // Kelet felé haladunk, két egymással párhuzamos, kb. 30 m-re lévő keresztező úttest, mindkettőn lámpa
  const c2: Record<number, [number, number]> = {
    1: [19.0, 47.5],
    2: [19.002, 47.5],
    3: [19.0024, 47.5],
    4: [19.005, 47.5],
    10: [19.002, 47.499],
    11: [19.002, 47.501],
    12: [19.0024, 47.499],
    13: [19.0024, 47.501],
  }
  const w = (id: number, nodes: number[], tags: Record<string, string>): OsmWay => ({
    type: 'way',
    id,
    nodes,
    geometry: nodes.map((i) => ({ lon: c2[i][0], lat: c2[i][1] })),
    tags,
  })
  const data: OsmData = {
    elements: [
      w(1, [1, 2, 3, 4], { highway: 'secondary' }),
      w(2, [10, 2, 11], { highway: 'primary', oneway: 'yes' }),
      w(3, [13, 3, 12], { highway: 'primary', oneway: 'yes' }),
      n(800, 19.0019, 47.5, { highway: 'traffic_signals' }),
      n(801, 19.0023, 47.5, { highway: 'traffic_signals' }),
    ],
  }
  const line: LineString = { type: 'LineString', coordinates: [c2[1], c2[4]] }

  it('egyetlen lámpás helyzetté vonja össze', () => {
    const res = generateSituations(line, data, { routeId: 'r', newId: () => 'x' })
    expect(res.filter((s) => s.kind === 'signals')).toHaveLength(1)
    expect(res).toHaveLength(1)
  })
})
