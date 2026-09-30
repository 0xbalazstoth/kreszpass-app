import { describe, expect, it } from 'vitest'
import { osm, route } from './__fixtures__/testMap'
import type { OsmWay } from './osm'
import {
  decodeTile,
  encodeTile,
  lonLatToTile,
  syntheticNodeId,
  tileBounds,
  toEncodable,
  TILE_ZOOM,
  type TileJson,
} from './osmTileFormat'
import { generateSituations } from './situations'

describe('csempe-matek', () => {
  it('Budapest belvárosa a várt z13 csempébe esik, és a csempe tartalmazza a pontot', () => {
    const [x, y] = lonLatToTile(19.0402, 47.4979, TILE_ZOOM)
    expect([x, y]).toEqual([4529, 2864])
    const [w, s, e, n] = tileBounds(x, y, TILE_ZOOM)
    expect(19.0402).toBeGreaterThanOrEqual(w)
    expect(19.0402).toBeLessThan(e)
    expect(47.4979).toBeGreaterThanOrEqual(s)
    expect(47.4979).toBeLessThan(n)
  })

  it('a szomszédos csempék határa egybeesik', () => {
    const a = tileBounds(4529, 2865, TILE_ZOOM)
    const b = tileBounds(4530, 2865, TILE_ZOOM)
    expect(a[2]).toBeCloseTo(b[0], 10)
  })
})

describe('kódolás és visszafejtés', () => {
  const enc = toEncodable(osm)
  const tile: TileJson = JSON.parse(JSON.stringify(encodeTile(enc.ways, enc.nodes)))
  const decoded = decodeTile(tile)

  it('a koordináták ~0,1 m pontossággal visszajönnek', () => {
    const original = osm.elements.find((e): e is OsmWay => e.type === 'way' && e.id === 1)!
    const back = decoded.elements.find((e): e is OsmWay => e.type === 'way' && e.id === 1)!
    back.geometry.forEach((g, i) => {
      expect(g.lon).toBeCloseTo(original.geometry[i].lon, 6)
      expect(g.lat).toBeCloseTo(original.geometry[i].lat, 6)
    })
  })

  it('csak a csomóponti azonosítók maradnak valódiak, a többi egyedi negatív', () => {
    const w4 = decoded.elements.find((e): e is OsmWay => e.type === 'way' && e.id === 4)!
    // Kis utca: 4 (közös a Fő utcával), 40 (közös a Kereszt utcával), 41 (végpont) → mind valódi
    expect(w4.nodes).toEqual([4, 40, 41])
    const w1 = decoded.elements.find((e): e is OsmWay => e.type === 'way' && e.id === 1)!
    expect(w1.nodes).toEqual([1, 2, 3, 4, 5])
    // Egy csak alakot adó pont szintetikus azonosítót kap
    const shaped = encodeTile(
      [{ id: 7, tags: { highway: 'residential' }, coords: [[19, 47.5], [19.001, 47.5], [19.002, 47.5]], nodeIds: [70, null, 72] }],
      [],
    )
    expect((decodeTile(shaped).elements[0] as OsmWay).nodes).toEqual([70, syntheticNodeId(7, 1), 72])
  })

  it('csak a szükséges címkék maradnak, a szótár közös', () => {
    const enc2 = encodeTile(
      [
        { id: 1, tags: { highway: 'residential', surface: 'asphalt', name: 'A' }, coords: [[19, 47], [19.1, 47]], nodeIds: [1, 2] },
        { id: 2, tags: { highway: 'residential', name: 'A', lit: 'yes' }, coords: [[19, 47], [19.1, 47]], nodeIds: [3, 4] },
      ],
      [{ id: 9, lon: 19, lat: 47, tags: { highway: 'crossing', crossing: 'marked', bicycle: 'no' } }],
    )
    expect(enc2.t).toEqual([{ highway: 'residential', name: 'A' }, { highway: 'crossing', crossing: 'marked' }])
  })

  it('a helyzetfelismerés ugyanazt adja a visszafejtett csempéből, mint az eredeti adatból', () => {
    let a = 0
    let b = 0
    const direct = generateSituations(route, osm, { routeId: 'r', newId: () => `x${++a}` })
    const viaTile = generateSituations(route, decoded, { routeId: 'r', newId: () => `x${++b}` })
    const strip = (list: typeof direct) => list.map(({ id: _id, lng: _lng, lat: _lat, ...rest }) => rest)
    expect(strip(viaTile)).toEqual(strip(direct))
    expect(direct.length).toBeGreaterThan(4)
  })

  it('ismeretlen formátumverziót elutasít', () => {
    expect(() => decodeTile({ ...tile, v: 99 })).toThrow()
  })
})
