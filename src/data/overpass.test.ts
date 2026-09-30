import type { LineString } from 'geojson'
import { describe, expect, it, vi } from 'vitest'
import { length, lineString } from '@turf/turf'
import type { OsmData } from './osm'
import { buildQuery, mergeOsm, queryOverpass, simplifyForQuery, splitRoute } from './overpass'

describe('Overpass lekérdezés', () => {
  it('hosszú útvonalat a lekérdezéshez legfeljebb 150 pontra egyszerűsít', () => {
    const coords = Array.from({ length: 3000 }, (_, i) => [19 + i * 0.00005, 47.5 + Math.sin(i / 50) * 0.001])
    const line: LineString = { type: 'LineString', coordinates: coords }
    const simple = simplifyForQuery(line)
    expect(simple.length).toBeLessThanOrEqual(150)
    expect(simple[0]).toEqual(coords[0])
    expect(simple.at(-1)).toEqual(coords.at(-1))
  })

  it('szélesség,hosszúság sorrendben, útvonal menti (around) szűréssel, rövid szerveroldali időkorláttal kérdez', () => {
    const q = buildQuery({ type: 'LineString', coordinates: [[19.1, 47.5], [19.2, 47.6]] })
    expect(q).toContain('around:30,47.500000,19.100000,47.600000,19.200000')
    expect(q).toContain('traffic_signals')
    expect(q).toContain('out body geom')
    expect(q).toContain('[timeout:25]')
  })
})

describe('szakaszokra bontás', () => {
  const long: LineString = { type: 'LineString', coordinates: Array.from({ length: 200 }, (_, i) => [19 + i * 0.001, 47.5]) }
  const total = length(lineString(long.coordinates), { units: 'meters' })

  it('rövid útvonalat nem bont', () => {
    expect(splitRoute({ type: 'LineString', coordinates: [[19, 47.5], [19.01, 47.5]] })).toHaveLength(1)
  })

  it('hosszú útvonalat átfedő, kb. 3 km-es szakaszokra bont, amelyek lefedik az egészet', () => {
    const parts = splitRoute(long)
    expect(parts.length).toBe(Math.ceil(total / 3000))
    const lens = parts.map((p) => length(lineString(p.coordinates), { units: 'meters' }))
    expect(Math.max(...lens)).toBeLessThan(3000 + 2 * 80 + 1)
    expect(lens.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(total)
    expect(parts[0].coordinates[0]).toEqual(long.coordinates[0])
    expect(parts.at(-1)!.coordinates.at(-1)![0]).toBeCloseTo(long.coordinates.at(-1)![0], 6)
  })
})

describe('összefésülés', () => {
  it('az ismétlődő elemek egyszer szerepelnek', () => {
    const a: OsmData = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }, { type: 'way', id: 5, nodes: [], geometry: [] }] }
    const b: OsmData = { elements: [{ type: 'way', id: 5, nodes: [], geometry: [] }, { type: 'node', id: 2, lat: 0, lon: 0 }, { type: 'node', id: 5, lat: 0, lon: 0 }] }
    const m = mergeOsm([a, b])
    expect(m.elements.map((e) => `${e.type}/${e.id}`)).toEqual(['node/1', 'way/5', 'node/2', 'node/5'])
  })
})

describe('türelmes lekérdezés', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const data = { elements: [{ type: 'node', id: 1, lat: 47.5, lon: 19 }] }
  const opts = { endpoints: ['https://a/api', 'https://b/api'], baseDelayMs: 1, timeoutMs: 200 }

  it('504 után a másik szerverrel újrapróbál', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 504 })).mockResolvedValueOnce(ok(data))
    const onStatus = vi.fn()
    await expect(queryOverpass('q', { ...opts, fetchImpl, onStatus })).resolves.toEqual(data)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['https://a/api', 'https://b/api'])
    expect(onStatus).toHaveBeenCalledTimes(1)
  })

  it('a 200-as, de szerveroldalon megszakított választ nem fogadja el', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 26 seconds.' }))
      .mockResolvedValueOnce(ok(data))
    await expect(queryOverpass('q', { ...opts, fetchImpl })).resolves.toEqual(data)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('ha a szerver nem válaszol, időtúllépés után továbblép', async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('t', 'TimeoutError'))))
    const fetchImpl = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(ok(data))
    await expect(queryOverpass('q', { ...opts, fetchImpl })).resolves.toEqual(data)
  })

  it('hibás lekérdezésnél (400) nem próbálkozik tovább', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }))
    await expect(queryOverpass('q', { ...opts, fetchImpl })).rejects.toThrow('HTTP 400')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a megadott próbálkozásszám után feladja', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    await expect(queryOverpass('q', { ...opts, fetchImpl, maxAttempts: 3 })).rejects.toThrow('HTTP 429')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('a felhasználó megszakíthatja', async () => {
    const ctrl = new AbortController()
    const fetchImpl = vi.fn().mockImplementation(async () => {
      ctrl.abort()
      return new Response('', { status: 504 })
    })
    await expect(queryOverpass('q', { ...opts, fetchImpl, signal: ctrl.signal })).rejects.toThrow('Megszakítva')
  })
})
