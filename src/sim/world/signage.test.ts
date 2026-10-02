import { describe, expect, it } from 'vitest'
import { coords, osm, route } from '../../data/__fixtures__/testMap'
import type { OsmData, OsmWay } from '../../data/osm'
import { buildWorld } from './build'
import { toLocal } from './project'
import type { World } from './types'

/** A csomópont körüli táblák kódjai */
function codesNear(world: World, node: number, r = 25): string[] {
  const [x, z] = toLocal(world.proj, coords[node])
  return world.signs.filter((s) => Math.hypot(s.at[0] - x, s.at[1] - z) < r).flatMap((s) => s.codes)
}

const withTags = (id: number, patch: Record<string, string>): OsmData => ({
  elements: osm.elements.map((e) => (e.type === 'way' && e.id === id ? ({ ...e, tags: { ...e.tags, ...patch } } as OsmWay) : e)),
})

describe('kitalált táblázás', () => {
  const world = buildWorld(osm, route, { seed: 1 })

  it('különböző rangú utak kereszteződése: a főúton Főútvonal, a mellékúton Elsőbbségadás kötelező', () => {
    const near = codesNear(world, 2)
    expect(near).toContain('B-003')
    expect(near).toContain('B-001')
    // A mellékút felől elsőbbségadási hely is lesz (a vizsgabiztosnak és a forgalomnak)
    const [x, z] = toLocal(world.proj, coords[2])
    expect(world.stops.filter((s) => s.kind === 'give_way' && Math.hypot(s.at[0] - x, s.at[1] - z) < 20).length).toBe(2)
  })

  it('az OSM-ben felvett táblát nem duplázza', () => {
    // A 3-as csomópontnál az egyik mellékági elsőbbségadás az adatokból jön: összesen kettő, nem három
    const [x, z] = toLocal(world.proj, coords[3])
    expect(world.stops.filter((s) => s.kind === 'give_way' && Math.hypot(s.at[0] - x, s.at[1] - z) < 20).length).toBe(2)
  })

  it('egyenrangú utak kereszteződésében nincs elsőbbségi tábla (jobbkéz-szabály)', () => {
    const near = codesNear(world, 40, 15)
    expect(near).not.toContain('B-003')
    expect(near).not.toContain('B-001')
  })

  it('ahol változik a megengedett sebesség, sebességkorlátozó tábla áll', () => {
    expect(codesNear(world, 4)).toContain('C-033-30')
  })

  it('egyirányú utca: a behajtásnál Egyirányú forgalmú út, a másik végén Behajtani tilos', () => {
    const w = buildWorld(withTags(5, { oneway: 'yes' }), route, { seed: 1 })
    const near = codesNear(w, 40)
    expect(near).toContain('E-012')
    expect(near).toContain('C-001')
  })
})
