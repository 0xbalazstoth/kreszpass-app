import type { LineString } from 'geojson'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { osm, route } from './__fixtures__/testMap'
import { fetchLocalOsm, inCoverage, loadLocalIndex, resetLocalIndex, tilesForRoute, type LocalIndex } from './osmLocal'
import { encodeTile, lonLatToTile, tileBounds, tileKey, toEncodable, TILE_FORMAT_VERSION, TILE_ZOOM } from './osmTileFormat'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => resetLocalIndex())

describe('az útvonal csempéi', () => {
  it('egy csempe közepén haladó rövid útvonal egy csempét érint', () => {
    const [x, y] = [4529, 2864]
    const [w, s, e, n] = tileBounds(x, y, TILE_ZOOM)
    const cx = (w + e) / 2
    const cy = (s + n) / 2
    const line: LineString = { type: 'LineString', coordinates: [[cx - 0.002, cy], [cx + 0.002, cy]] }
    expect(tilesForRoute(line, TILE_ZOOM)).toEqual([tileKey(x, y)])
  })

  it('a csempe széléhez közeli pontnál a szomszéd csempét is hozzáveszi', () => {
    const [x, y] = [4529, 2864]
    const [, s, e, n] = tileBounds(x, y, TILE_ZOOM)
    const cy = (s + n) / 2
    // 20 m-re a keleti széltől, a csempén belül
    const lon = e - 20 / (111_320 * Math.cos((cy * Math.PI) / 180))
    const line: LineString = { type: 'LineString', coordinates: [[lon, cy], [lon, cy + 0.001]] }
    const keys = tilesForRoute(line, TILE_ZOOM)
    expect(keys).toContain(tileKey(x, y))
    expect(keys).toContain(tileKey(x + 1, y))
  })

  it('hosszú útvonalnál összefüggő csempesort ad', () => {
    const line: LineString = { type: 'LineString', coordinates: [[19.0, 47.5], [19.2, 47.5]] }
    const xs = tilesForRoute(line, TILE_ZOOM).map((k) => Number(k.split('/')[0]))
    const [x0] = lonLatToTile(19.0, 47.5, TILE_ZOOM)
    const [x1] = lonLatToTile(19.2, 47.5, TILE_ZOOM)
    for (let x = x0; x <= x1; x++) expect(xs).toContain(x)
  })

  it('lefedettség: csak a teljesen bent lévő útvonal számít lefedettnek', () => {
    const idx = { bbox: [16.1, 45.7, 22.9, 48.6] as [number, number, number, number] }
    expect(inCoverage(route, idx)).toBe(true)
    expect(inCoverage({ type: 'LineString', coordinates: [[19, 47.5], [23.5, 47.5]] }, idx)).toBe(false)
  })
})

describe('helyi jegyzék', () => {
  const index = { v: TILE_FORMAT_VERSION, zoom: 13, dataDate: '2026-09-28T00:00:00Z', builtAt: 'b1', source: 's', attribution: 'a', bbox: [16, 45, 23, 49], tiles: '1/2,3/4' }

  it('betölti és halmazzá alakítja a csempelistát', async () => {
    const idx = await loadLocalIndex(vi.fn().mockResolvedValue(json(index)))
    expect(idx?.tiles.has('3/4')).toBe(true)
    expect(idx?.dataDate).toBe('2026-09-28T00:00:00Z')
  })

  it('ha nincs helyi csomag (404 vagy index.html), null', async () => {
    expect(await loadLocalIndex(vi.fn().mockResolvedValue(new Response('', { status: 404 })))).toBeNull()
    resetLocalIndex()
    expect(await loadLocalIndex(vi.fn().mockResolvedValue(new Response('<!doctype html><html>', { status: 200 })))).toBeNull()
  })

  it('más formátumverziót nem használ', async () => {
    expect(await loadLocalIndex(vi.fn().mockResolvedValue(json({ ...index, v: 99 })))).toBeNull()
  })
})

describe('helyi csempék letöltése', () => {
  const enc = toEncodable(osm)
  const tile = encodeTile(enc.ways, enc.nodes)
  const keys = tilesForRoute(route, TILE_ZOOM)
  const index: LocalIndex = {
    zoom: TILE_ZOOM,
    dataDate: 'd',
    builtAt: 'build-1',
    attribution: 'a',
    bbox: [16, 45, 23, 49],
    // Az első csempe létezik, a többit a jegyzék nem tartalmazza (üres terület)
    tiles: new Set([keys[0]]),
  }

  it('csak a jegyzékben szereplő csempéket kéri, verzióval a címben', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(tile))
    const data = await fetchLocalOsm(route, index, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`/osm/13/${keys[0]}.json?v=build-1`)
    expect(data.elements.filter((e) => e.type === 'way')).toHaveLength(5)
  })

  it('az ugyanazt az utat tartalmazó csempéket összefésüli', async () => {
    const all: LocalIndex = { ...index, builtAt: 'build-2', tiles: new Set(keys) }
    const fetchImpl = vi.fn().mockImplementation(async () => json(tile))
    const data = await fetchLocalOsm(route, all, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(keys.length)
    expect(data.elements.filter((e) => e.type === 'way')).toHaveLength(5)
    // 4 pont (a jelöletlen átkelő is, azt a helyzetfelismerés szűri ki), mindegyik egyszer
    expect(data.elements.filter((e) => e.type === 'node')).toHaveLength(4)
  })

  it('a 404-es csempe üresnek számít, a hibás kérés hibát dob', async () => {
    const one: LocalIndex = { ...index, builtAt: 'build-3' }
    await expect(fetchLocalOsm(route, one, { fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 404 })) })).resolves.toEqual({
      elements: [],
    })
    const two: LocalIndex = { ...index, builtAt: 'build-4' }
    await expect(fetchLocalOsm(route, two, { fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 500 })) })).rejects.toThrow('500')
  })

  it('a munkamenetben egyszer betöltött csempét nem kéri újra', async () => {
    const cached: LocalIndex = { ...index, builtAt: 'build-5' }
    const fetchImpl = vi.fn().mockImplementation(async () => json(tile))
    await fetchLocalOsm(route, cached, { fetchImpl })
    await fetchLocalOsm(route, cached, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
