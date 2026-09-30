import type { LineString } from 'geojson'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { osm, route } from './__fixtures__/testMap'
import { resetLocalIndex, tilesForRoute } from './osmLocal'
import { encodeTile, toEncodable, TILE_FORMAT_VERSION, TILE_ZOOM } from './osmTileFormat'

// Az Overpass-ág (IndexedDB gyorsítótárral) helyett egy ellenőrizhető ál-függvény
const fetchOverpassChunk = vi.fn()
vi.mock('./overpass', async (importOriginal) => {
  const real = await importOriginal<typeof import('./overpass')>()
  return { ...real, fetchOverpassChunk: (...args: unknown[]) => fetchOverpassChunk(...args), sleep: async () => {} }
})

const { loadOsmForRoute } = await import('./osmSource')

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const enc = toEncodable(osm)
const tile = encodeTile(enc.ways, enc.nodes)

function serve(bbox: [number, number, number, number] | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('index.json')) {
        if (!bbox) return new Response('', { status: 404 })
        const tiles = tilesForRoute(route, TILE_ZOOM).join(',')
        return json({ v: TILE_FORMAT_VERSION, zoom: TILE_ZOOM, dataDate: '2026-09-28T00:00:00Z', builtAt: 'b', source: 's', attribution: 'a', bbox, tiles })
      }
      return json(tile)
    }),
  )
}

beforeEach(() => {
  resetLocalIndex()
  fetchOverpassChunk.mockReset()
  fetchOverpassChunk.mockResolvedValue({ data: osm, fromCache: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('adatforrás kiválasztása', () => {
  it('lefedett útvonalnál csak a helyi csempéket használja, Overpass nélkül', async () => {
    serve([16, 45, 23, 49])
    const r = await loadOsmForRoute(route)
    expect(fetchOverpassChunk).not.toHaveBeenCalled()
    expect(r).toMatchObject({ localChunks: 1, remoteChunks: 0, dataDate: '2026-09-28T00:00:00Z' })
    expect(r.data.elements.some((e) => e.type === 'way')).toBe(true)
  })

  it('helyi adatcsomag nélkül az Overpass szerverre támaszkodik', async () => {
    serve(null)
    const r = await loadOsmForRoute(route)
    expect(fetchOverpassChunk).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ localChunks: 0, remoteChunks: 1 })
  })

  it('részben lefedett hosszú útvonalnál csak a kilógó szakaszokat kéri a szervertől', async () => {
    serve([18.9, 47.4, 19.1, 47.6])
    // ~15 km kelet felé: az eleje (19.0–19.1) lefedett, a vége (19.1–19.2) nem
    const long: LineString = { type: 'LineString', coordinates: Array.from({ length: 41 }, (_, i) => [19.0 + i * 0.005, 47.5]) }
    const r = await loadOsmForRoute(long)
    expect(r.localChunks).toBeGreaterThan(0)
    expect(r.remoteChunks).toBeGreaterThan(0)
    expect(fetchOverpassChunk).toHaveBeenCalledTimes(r.remoteChunks)
  })

  it('ha a kilógó rész sem tölthető le, érthető hibát ad', async () => {
    serve(null)
    fetchOverpassChunk.mockRejectedValue(new Error('HTTP 504'))
    await expect(loadOsmForRoute(route)).rejects.toThrow(/túlterhelt/)
  })
})
