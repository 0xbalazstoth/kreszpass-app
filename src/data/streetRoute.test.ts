import { describe, expect, it } from 'vitest'
import { coords, osm } from './__fixtures__/testMap'
import type { OsmData, OsmWay } from './osm'
import { buildStreetRoute, normalizeStreetName, parseStreetList, roadNumber } from './streetRoute'

const withWay = (id: number, patch: Partial<OsmWay['tags']>): OsmData => ({
  elements: osm.elements.map((e) => (e.type === 'way' && e.id === id ? { ...e, tags: { ...e.tags, ...patch } as Record<string, string> } : e)),
})

describe('utcalista értelmezése', () => {
  it('a szokásos elválasztókkal bontja a listát', () => {
    expect(parseStreetList('Budaörsi út – Egér út\nBeregszász út; Fő u. → Kis utca, Petőfi tér')).toEqual([
      'Budaörsi út',
      'Egér út',
      'Beregszász út',
      'Fő u.',
      'Kis utca',
      'Petőfi tér',
    ])
  })

  it('a rövidítéseket kiírja', () => {
    expect(normalizeStreetName('Fő u.')).toBe('fő utca')
    expect(normalizeStreetName('Nagykörút krt.')).toBe('nagykörút körút')
    expect(normalizeStreetName('Pesti alsó rkp.')).toBe('pesti alsó rakpart')
  })

  it('felismeri az útszámokat', () => {
    expect(roadNumber('1-es út')).toBe('1')
    expect(roadNumber('10')).toBe('10')
    expect(roadNumber('M0')).toBe('M0')
    expect(roadNumber('M1-es autópálya')).toBe('M1')
    expect(roadNumber('4. sz. főút')).toBe('4')
    expect(roadNumber('Egér út')).toBeNull()
  })
})

describe('útvonal az utcákból', () => {
  it('a két utca közös csomópontjában fordul, és mindkét végén továbbhalad az utcán', () => {
    const r = buildStreetRoute(['Fő utca', 'Kis utca'], osm)
    expect(r.junctions).toEqual([coords[4]])
    // Visszafelé 300 m a Fő utcán (4 → 3 → 2), előre a Kis utca végéig (4 → 40 → 41)
    expect(r.line.coordinates).toEqual([coords[2], coords[3], coords[4], coords[40], coords[41]])
    expect(r.lengthM).toBeGreaterThan(600)
    expect(r.matched).toEqual(['Fő utca', 'Kis utca'])
  })

  it('rövidített és hiányos nevet is elfogad, ha egyértelmű', () => {
    const r = buildStreetRoute(['Fő u.', 'Kis'], osm)
    expect(r.junctions).toEqual([coords[4]])
    expect(r.matched).toEqual(['Fő utca', 'Kis utca'])
  })

  it('három utcán át is végigvezet', () => {
    const r = buildStreetRoute(['Fő utca', 'Kis utca', 'Kereszt utca'], osm)
    expect(r.junctions).toEqual([coords[4], coords[40]])
  })

  it('útszámmal megadott utat a ref címke alapján talál meg', () => {
    const r = buildStreetRoute(['10-es út', 'Kis utca'], withWay(1, { ref: '10' }))
    expect(r.junctions).toEqual([coords[4]])
    expect(r.matched[0]).toBe('10. számú út')
  })

  it('egyirányú utcába a menetiránnyal szemben nem hajt be', () => {
    // A Kis utca csak a 41 → 4 irányban járható
    expect(() => buildStreetRoute(['Fő utca', 'Kis utca'], withWay(4, { oneway: '-1' }))).toThrow(/nem találkozik/)
  })

  it('érthető hibát ad ismeretlen vagy nem találkozó utcákra', () => {
    expect(() => buildStreetRoute(['Nincs ilyen utca', 'Kis utca'], osm)).toThrow(/Nem találom/)
    // A Mellék utca és a Kis utca nem találkozik: a Fő utcán lehet átjutni, ezt javasolja
    expect(() => buildStreetRoute(['Mellék utca', 'Kis utca'], osm)).toThrow(/nem találkozik.*„Fő utca” vezet át/)
    expect(() => buildStreetRoute(['Fő utca'], osm)).toThrow(/Legalább két utcát/)
  })
})
