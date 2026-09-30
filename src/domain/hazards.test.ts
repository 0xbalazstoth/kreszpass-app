import type { LineString } from 'geojson'
import { describe, expect, it } from 'vitest'
import { HAZARD_CLEAR_M, hazardDistance, placeHazards, withHazards } from './hazards'
import type { Situation } from './types'

// Kb. 3 km egyenes kelet felé, majd derékszögű kanyar és még 1 km észak felé (47.5°: 0.001° hosszúság ≈ 75 m)
const line: LineString = {
  type: 'LineString',
  coordinates: [
    [19.0, 47.5],
    [19.04, 47.5],
    [19.04, 47.509],
  ],
}
const sit = (d: number): Situation => ({ id: `s${d}`, routeId: 'r', d, lng: 0, lat: 0, bearing: 90, kind: 'equal', turn: 'straight', needsReview: false, source: 'osm' })

describe('váratlan helyzetek elhelyezése', () => {
  it('kikapcsolva nincs egy sem', () => {
    expect(placeHazards(line, [], 'r', 'off')).toEqual([])
  })

  it('ugyanazon az útvonalon mindig ugyanott vannak, más útvonalon máshol', () => {
    const a = placeHazards(line, [], 'r1', 'few').map((h) => h.d)
    expect(placeHazards(line, [], 'r1', 'few').map((h) => h.d)).toEqual(a)
    expect(placeHazards(line, [], 'r2', 'few').map((h) => h.d)).not.toEqual(a)
  })

  it('„sok” beállítással több van, mint „kevés”-sel', () => {
    const few = placeHazards(line, [], 'r', 'few').length
    const many = placeHazards(line, [], 'r', 'many').length
    expect(few).toBeGreaterThanOrEqual(3)
    expect(many).toBeGreaterThan(few)
  })

  it('a többi helyzettől és a kanyartól távol, egyenes szakaszon van', () => {
    const existing = [sit(500), sit(1200), sit(2000)]
    const hz = placeHazards(line, existing, 'r', 'many')
    const corner = 3000 // a kanyar kb. itt
    for (const h of hz) {
      expect(existing.every((s) => Math.abs(s.d - h.d) >= HAZARD_CLEAR_M)).toBe(true)
      expect(Math.abs(h.d - corner)).toBeGreaterThan(20)
      expect(h).toMatchObject({ kind: 'hazard', source: 'generated', turn: 'straight' })
      expect(h.id).toBe(`hazard:r:${h.d}`)
    }
    for (let i = 1; i < hz.length; i++) expect(hz[i].d - hz[i - 1].d).toBeGreaterThanOrEqual(HAZARD_CLEAR_M)
  })

  it('a helyzetekkel együtt útvonal szerint rendezve adja vissza', () => {
    const all = withHazards([sit(500), sit(2500)], line, 'r', 'few')
    expect(all.map((s) => s.d)).toEqual([...all.map((s) => s.d)].sort((a, b) => a - b))
    expect(all.some((s) => s.kind === 'hazard')).toBe(true)
  })

  it('az azonosítóból visszaadja a helyét', () => {
    expect(hazardDistance('hazard:abc-123:840')).toBe(840)
    expect(hazardDistance('0f3c2b')).toBeNull()
  })
})
