import type { LineString } from 'geojson'
import { describe, expect, it } from 'vitest'
import { osm, route } from './__fixtures__/testMap'
import type { OsmData, OsmNode, OsmWay } from './osm'
import { generateSituations } from './situations'

const n = (id: number, lon: number, lat: number, tags?: Record<string, string>): OsmNode => ({ type: 'node', id, lon, lat, tags })

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
