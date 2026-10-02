import { describe, expect, it } from 'vitest'
import { metersBetween, type LngLat } from '../lib/geo'
import type { OsmData, OsmWay } from './osm'
import { dropSpikes, randomRoute } from './randomRoute'

/**
 * Mesterséges utcahálózat: 15 × 15 csomópontos rács, 150 m-es tömbökkel (kb. 2,1 × 2,1 km).
 * Vízszintes utcák: „Kelet utca 0…14”, függőlegesek: „Észak utca 0…14”; a 7-es kelet–nyugati utca egyirányú (keletre),
 * a 3-as függőleges autópálya (arra nem mehet a gyakorló útvonal).
 */
const SIZE = 15
const STEP_M = 150
const LAT0 = 47.5
const dLat = STEP_M / 111_320
const dLng = STEP_M / (111_320 * Math.cos((LAT0 * Math.PI) / 180))
const id = (i: number, j: number) => i * SIZE + j + 1
const at = (i: number, j: number): LngLat => [19 + j * dLng, LAT0 + i * dLat]

function grid(): OsmData {
  const ways: OsmWay[] = []
  const mk = (wid: number, nodes: Array<[number, number]>, tags: Record<string, string>): OsmWay => ({
    type: 'way',
    id: wid,
    nodes: nodes.map(([i, j]) => id(i, j)),
    geometry: nodes.map(([i, j]) => ({ lon: at(i, j)[0], lat: at(i, j)[1] })),
    tags,
  })
  for (let i = 0; i < SIZE; i++) {
    const nodes = Array.from({ length: SIZE }, (_, j) => [i, j] as [number, number])
    ways.push(mk(1000 + i, nodes, { highway: 'residential', name: `Kelet utca ${i}`, ...(i === 7 ? { oneway: 'yes' } : {}) }))
  }
  for (let j = 0; j < SIZE; j++) {
    const nodes = Array.from({ length: SIZE }, (_, i) => [i, j] as [number, number])
    ways.push(mk(2000 + j, nodes, j === 3 ? { highway: 'motorway', name: 'M99' } : { highway: 'tertiary', name: `Észak utca ${j}` }))
  }
  return { elements: ways }
}

/** Ismételhető álvéletlen sorozat */
function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const osm = grid()
const ways = osm.elements as OsmWay[]
/** Melyik utak kötnek össze két szomszédos csomópontot (és milyen irányban szabad rajtuk menni) */
function edgeAllowed(a: LngLat, b: LngLat): { ok: boolean; motorway: boolean } {
  for (const w of ways) {
    for (let k = 0; k < w.geometry.length - 1; k++) {
      const p: LngLat = [w.geometry[k].lon, w.geometry[k].lat]
      const q: LngLat = [w.geometry[k + 1].lon, w.geometry[k + 1].lat]
      const fwd = metersBetween(p, a) < 1 && metersBetween(q, b) < 1
      const back = metersBetween(q, a) < 1 && metersBetween(p, b) < 1
      if (fwd || (back && w.tags?.oneway !== 'yes')) return { ok: true, motorway: w.tags?.highway === 'motorway' }
    }
  }
  return { ok: false, motorway: false }
}

describe('véletlen útvonal', () => {
  it('hurok: ugyanoda ér vissza, összefüggő, szabályos, és a kért hosszú', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const r = randomRoute(osm, { lengthM: 4000, rnd: seeded(seed) })
      const c = r.line.coordinates as LngLat[]
      expect(c[0], `seed ${seed}`).toEqual(c[c.length - 1])
      expect(Math.abs(r.lengthM - 4000) / 4000, `seed ${seed}: ${Math.round(r.lengthM)} m`).toBeLessThan(0.35)
      for (let k = 0; k < c.length - 1; k++) {
        const e = edgeAllowed(c[k], c[k + 1])
        expect(e.ok, `seed ${seed}: ${k}. szakasz`).toBe(true)
        expect(e.motorway, `seed ${seed}: autópálya`).toBe(false)
      }
    }
  })

  it('nincs benne azonnali visszafordulás (A → B → A)', () => {
    for (const seed of [3, 5, 8]) {
      const c = randomRoute(osm, { lengthM: 3000, rnd: seeded(seed) }).line.coordinates
      for (let k = 2; k < c.length; k++) expect(c[k], `seed ${seed}, ${k}`).not.toEqual(c[k - 2])
    }
  })

  it('a fordulópontok a megadott területen belül vannak', () => {
    // Csak a rács bal alsó negyede
    const inside = ([lng, lat]: LngLat) => lng <= at(0, 7)[0] + 1e-9 && lat <= at(7, 0)[1] + 1e-9
    const r = randomRoute(osm, { lengthM: 2500, rnd: seeded(11), inside })
    for (const p of r.junctions) expect(inside(p) || metersBetween(p, at(7, 7)) < 1100).toBe(true)
  })

  it('az utcalista a bejárt utcák sorrendje, az útpontok az utcaváltások', () => {
    const r = randomRoute(osm, { lengthM: 3000, rnd: seeded(21) })
    expect(r.streets.length).toBeGreaterThanOrEqual(3)
    for (let k = 1; k < r.streets.length; k++) expect(r.streets[k]).not.toBe(r.streets[k - 1])
    expect(r.junctions.length).toBe(r.streets.length - 1)
  })

  it('túl kicsi területen érthető hibát ad', () => {
    expect(() => randomRoute(osm, { lengthM: 3000, inside: () => false })).toThrow(/nincs elég utca/)
  })
})

describe('oda-vissza kitérők elhagyása', () => {
  const s = (...nodes: number[]) => nodes.map((node) => ({ node, way: 1 }))
  it('a zsákutcába be- és kifordulást kihagyja', () => {
    expect(dropSpikes(s(1, 2, 3, 4, 3, 2, 5)).map((x) => x.node)).toEqual([1, 2, 5])
  })
  it('a hurok elején és végén lévő közös kitérőt is', () => {
    expect(dropSpikes(s(1, 2, 3, 4, 5, 2, 1)).map((x) => x.node)).toEqual([2, 3, 4, 5, 2])
  })
})
