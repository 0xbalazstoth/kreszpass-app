import type { LineString } from 'geojson'
import { describe, expect, it } from 'vitest'
import { buildQuery, simplifyForQuery } from './overpass'

describe('Overpass lekérdezés', () => {
  it('hosszú útvonalat a lekérdezéshez legfeljebb 350 pontra egyszerűsít', () => {
    const coords = Array.from({ length: 3000 }, (_, i) => [19 + i * 0.00005, 47.5 + Math.sin(i / 50) * 0.001])
    const line: LineString = { type: 'LineString', coordinates: coords }
    const simple = simplifyForQuery(line)
    expect(simple.length).toBeLessThanOrEqual(350)
    expect(simple[0]).toEqual(coords[0])
    expect(simple.at(-1)).toEqual(coords.at(-1))
  })

  it('szélesség,hosszúság sorrendben, útvonal menti (around) szűréssel kérdez', () => {
    const q = buildQuery({ type: 'LineString', coordinates: [[19.1, 47.5], [19.2, 47.6]] })
    expect(q).toContain('around:30,47.500000,19.100000,47.600000,19.200000')
    expect(q).toContain('traffic_signals')
    expect(q).toContain('out body geom')
  })
})
