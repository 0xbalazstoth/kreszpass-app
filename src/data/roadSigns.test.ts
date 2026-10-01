import { describe, expect, it } from 'vitest'
import type { Situation } from '../domain/types'
import { osm, route } from './__fixtures__/testMap'
import type { OsmData, OsmNode } from './osm'
import { fillFromRoutes, pickRoadStretch, roadSignsAlongRoute } from './roadSigns'

const n = (id: number, lon: number, lat: number, tags?: Record<string, string>): OsmNode => ({ type: 'node', id, lon, lat, tags })

const sit = (d: number, extra: Partial<Situation>): Situation => ({
  id: `s${d}`,
  routeId: 'r',
  d,
  lng: 0,
  lat: 0,
  bearing: 90,
  kind: 'equal',
  turn: 'straight',
  needsReview: false,
  source: 'osm',
  ...extra,
})

describe('valódi táblák az útvonal mentén', () => {
  const map: OsmData = {
    elements: [
      ...osm.elements,
      // A Fő utcán (keletre haladunk), a jobb (déli) oldalon: a mienk
      n(950, 19.0015, 47.49995, { traffic_sign: 'HU:C033[30]' }),
      // A bal (északi) oldalon: a szembejövőké
      n(951, 19.0025, 47.50006, { traffic_sign: 'HU:C-001' }),
      // Lakott terület tábla az úttesten
      n(952, 19.0035, 47.5, { traffic_sign: 'city_limit' }),
    ],
  }

  it('a jobb oldali kitáblázott táblát felveszi, a bal oldalit nem, a lakott terület táblát értelmezi', () => {
    const codes = roadSignsAlongRoute(route, map, []).map((x) => x.code)
    expect(codes).toContain('C-033-30')
    expect(codes).not.toContain('C-001')
    expect(codes.some((c) => c === 'E-020' || c === 'E-021')).toBe(true)
  })

  it('a helyzetekből a ténylegesen álló táblák jönnek, a figyelmeztető tábla előtte', () => {
    const list = roadSignsAlongRoute(route, osm, [
      sit(100, { kind: 'stop' }),
      sit(300, { kind: 'speed_change', speedTo: 30 }),
      sit(500, { kind: 'roundabout' }),
      sit(600, { kind: 'equal' }),
      sit(650, { kind: 'signals' }),
    ])
    const at = (code: string) => list.find((x) => x.code === code)!
    expect(at('B-002').d).toBeCloseTo(100)
    expect(at('C-033-30').d).toBeCloseTo(300)
    expect(at('A-056').d).toBeLessThan(at('D-017').d)
    expect(list.every((x) => x.source === 'situation' || x.source === 'osm')).toBe(true)
    // A jelképként használt táblák nem kerülnek bele
    expect(list.map((x) => x.code)).not.toContain('A-027')
    expect(list.map((x) => x.code)).not.toContain('A-026')
  })

  it('az ellenőrizendő helyzeteknél csak a biztosan ott álló táblák, a generált helyzeteknél egy sem', () => {
    const list = roadSignsAlongRoute(route, osm, [
      sit(100, { kind: 'stop', needsReview: true }),
      sit(150, { kind: 'priority', needsReview: true }),
      sit(200, { kind: 'hazard', source: 'generated' }),
      sit(400, { kind: 'rail_crossing', needsReview: true, rail: { barrier: false, lights: true } }),
      sit(600, { kind: 'tram_stop', needsReview: true, transit: { kind: 'tram' } }),
    ])
    expect(list.map((x) => x.code)).toEqual(['A-045', 'A-041', 'E-041'])
  })

  it('ugyanaz a tábla 30 m-en belül egynek számít, a lista útvonal szerint rendezett', () => {
    const list = roadSignsAlongRoute(route, osm, [sit(400, { kind: 'give_way' }), sit(410, { kind: 'give_way' }), sit(200, { kind: 'crossing' })])
    expect(list.map((x) => x.code)).toEqual(['E-038', 'B-001'])
  })
})

describe('véletlen szakasz', () => {
  const list = Array.from({ length: 10 }, (_, i) => i)

  it('egymást követő táblákat ad, a kért számban', () => {
    const part = pickRoadStretch(list, 4, () => 0.5)
    expect(part).toHaveLength(4)
    for (let i = 1; i < part.length; i++) expect(part[i]).toBe(part[i - 1] + 1)
  })

  it('rövid listánál mindet', () => {
    expect(pickRoadStretch(list.slice(0, 3), 10)).toEqual([0, 1, 2])
  })

  it('a szakasz nem lóg ki a lista végén', () => {
    expect(pickRoadStretch(list, 4, () => 0.999)).toEqual([6, 7, 8, 9])
  })
})

describe('több útvonalból összeállított kör', () => {
  it('útvonalanként egymást követő táblákkal tölti fel a kért számig', () => {
    const a = [1, 2, 3]
    const b = [10, 11, 12, 13, 14]
    expect(fillFromRoutes([a, [], b], 6, () => 0)).toEqual([1, 2, 3, 10, 11, 12])
  })

  it('ha összesen sincs elég, mindet adja', () => {
    expect(fillFromRoutes([[1], [2, 3]], 20)).toEqual([1, 2, 3])
  })
})
