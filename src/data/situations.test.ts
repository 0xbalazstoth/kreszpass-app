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

describe('körforgalom: hányadik kijárat', () => {
  // Kör a (19.0, 47.5) körül, kb. 20 m sugárral; a csomópontok az óramutatóval ellentétesen követik egymást
  const c: [number, number] = [19.0, 47.5]
  const R_LAT = 20 / 111_320
  const R_LON = 20 / (111_320 * Math.cos((47.5 * Math.PI) / 180))
  const ringNode = (k: number) => n(100 + k, c[0] + R_LON * Math.cos((k * Math.PI) / 4), c[1] + R_LAT * Math.sin((k * Math.PI) / 4))
  const far = (id: number, angle: number) => n(id, c[0] + 6 * R_LON * Math.cos(angle), c[1] + 6 * R_LAT * Math.sin(angle))
  const nodes: OsmNode[] = [...Array.from({ length: 8 }, (_, k) => ringNode(k)), far(300, -Math.PI / 2), far(301, 0), far(302, Math.PI / 2), far(303, Math.PI), far(304, Math.PI / 4)]
  const at = new Map(nodes.map((x) => [x.id, x]))
  const w = (id: number, ids: number[], tags: Record<string, string>): OsmWay => ({
    type: 'way',
    id,
    nodes: ids,
    geometry: ids.map((i) => ({ lon: at.get(i)!.lon, lat: at.get(i)!.lat })),
    tags,
  })
  const map: OsmData = {
    elements: [
      w(200, [100, 101, 102, 103, 104, 105, 106, 107, 100], { highway: 'primary', junction: 'roundabout', lanes: '2' }),
      w(201, [106, 300], { highway: 'primary', name: 'Déli út' }),
      w(202, [100, 301], { highway: 'residential', name: 'Keleti utca' }),
      w(203, [102, 302], { highway: 'primary', name: 'Északi út' }),
      w(204, [104, 303], { highway: 'residential', name: 'Nyugati utca' }),
      // Csak befelé egyirányú ág: ezen nem lehet kihajtani, nem számít kijáratnak
      w(205, [304, 101], { highway: 'residential', oneway: 'yes' }),
    ],
  }
  const pos = (id: number) => [at.get(id)!.lon, at.get(id)!.lat]
  const line: LineString = { type: 'LineString', coordinates: [300, 106, 107, 100, 101, 102, 302].map(pos) }
  const res = generateSituations(line, map, { routeId: 'r', newId: () => 'k' })

  it('délről behajtva, északon kihajtva a 2. kijárat a 4-ből (a befelé egyirányú ág nem számít)', () => {
    const r = res.find((s) => s.kind === 'roundabout')!
    expect(r.roundabout).toEqual({ exit: 2, exits: 4, lanes: 2, turn: 'straight' })
    expect(r.needsReview).toBe(false)
  })

  it('kiskörforgalomnál (mini_roundabout) a csatlakozó ágak irányából számol', () => {
    // Két út a középpontban (500) keresztezi egymást
    const cross = (id: number, ids: number[]): OsmWay => ({
      type: 'way',
      id,
      nodes: ids,
      geometry: ids.map((i) => (i === 500 ? { lon: c[0], lat: c[1] } : { lon: at.get(i)!.lon, lat: at.get(i)!.lat })),
      tags: { highway: 'residential' },
    })
    const mini: OsmData = { elements: [n(500, c[0], c[1], { highway: 'mini_roundabout' }), cross(210, [300, 500, 302]), cross(211, [301, 500, 303])] }
    const miniLine: LineString = { type: 'LineString', coordinates: [pos(300), c, pos(303)] }
    const r = generateSituations(miniLine, mini, { routeId: 'r', newId: () => 'm' }).find((s) => s.kind === 'roundabout')!
    // Délről nyugatra: kelet (1.), észak (2.), nyugat (3.)
    expect(r.roundabout).toMatchObject({ exit: 3, exits: 4, turn: 'left' })
  })
})

describe('villamos- és autóbuszmegállók', () => {
  const extra: OsmData = {
    elements: [
      ...osm.elements,
      // Villamosmegálló a Fő utcán (a sínek az úttesten)
      n(970, 19.003, 47.50003, { railway: 'tram_stop', name: 'Fő utca' }),
      // Autóbuszmegálló a jobb (déli) oldalon
      n(971, 19.0025, 47.49993, { highway: 'bus_stop' }),
      // Autóbuszmegálló a bal oldalon: a szembejövő irányé
      n(972, 19.0045, 47.50007, { highway: 'bus_stop' }),
    ],
  }
  const res = generateSituations(route, extra, { routeId: 'r1', newId: () => 't' })

  it('a villamosmegállót felismeri, a járdaszigetet kézzel kell jelölni', () => {
    const tram = res.filter((s) => s.kind === 'tram_stop')
    expect(tram).toHaveLength(1)
    expect(tram[0].transit).toEqual({ kind: 'tram' })
    expect(tram[0].needsReview).toBe(true)
  })

  it('csak a jobb oldali autóbuszmegálló számít', () => {
    const bus = res.filter((s) => s.kind === 'bus_stop')
    expect(bus).toHaveLength(1)
    expect(Math.abs(bus[0].d - 188)).toBeLessThan(15)
  })
})
