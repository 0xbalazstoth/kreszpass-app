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

describe('valós táblák és vasúti átjáró', () => {
  const extra: OsmData = {
    elements: [
      ...osm.elements.map((e) => (e.type === 'way' && e.id === 4 ? { ...e, tags: { ...e.tags, oneway: 'yes' } } : e)),
      // Kitáblázott 30-as korlátozás a kanyarodás előtt, a jobb (déli) oldalon
      n(950, 19.0055, 47.49995, { traffic_sign: 'HU:C033[30]' }),
      // Ugyanez a bal (északi) oldalon: a szembejövőknek szól
      n(951, 19.0052, 47.50006, { traffic_sign: 'HU:C-001' }),
      // Vasúti átjáró a Kis utcán, félsorompóval
      n(960, 19.006, 47.502, { railway: 'level_crossing', 'crossing:barrier': 'half' }),
    ],
  }
  let k = 0
  const res = generateSituations(route, extra, { routeId: 'r1', newId: () => `x${++k}` })

  it('a vasúti átjárót felismeri a sorompó adatával', () => {
    const rail = res.find((s) => s.kind === 'rail_crossing')!
    expect(rail).toBeDefined()
    expect(Math.abs(rail.d - 673)).toBeLessThan(15)
    expect(rail.rail).toEqual({ barrier: true, lights: true })
    expect(rail.needsReview).toBe(false)
  })

  it('a helyzet elé kitett, jobb oldali táblát hozzárendeli, a bal oldalit nem', () => {
    const turn = res.find((s) => s.turn === 'left')!
    expect(turn.signs).toContain('C-033-30')
    expect(turn.signs).not.toContain('C-001')
  })

  it('egyirányú utcába kanyarodva az „Egyirányú forgalmú út” tábla is megjelenik', () => {
    expect(res.find((s) => s.turn === 'left')!.signs).toContain('E-012')
  })
})
