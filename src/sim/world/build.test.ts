import { describe, expect, it } from 'vitest'
import { randomRoute } from '../../data/randomRoute'
import { rngFrom } from '../rng'
import { hasLocalTiles, loadArea } from '../__fixtures__/realArea'
import { buildWorld, indexWorld } from './build'
import { buildingCorners } from './roadIndex'

// Újpest környéke (a helyi csomag része)
const AREA: [number, number, number, number] = [19.06, 47.545, 19.12, 47.58]

describe.runIf(hasLocalTiles())('világ a valódi térképadatokból', () => {
  const osm = loadArea(AREA)
  const r = randomRoute(osm, { lengthM: 4000, rnd: rngFrom(3), near: [19.09, 47.562] })
  const t0 = performance.now()
  const world = buildWorld(osm, r.line, { seed: 1 })
  const ms = performance.now() - t0
  const index = indexWorld(world)

  it('gyorsan felépül, és van benne minden', () => {
    console.log(
      `${Math.round(ms)} ms: ${world.roads.length} út, ${world.junctions.length} csomópont, ${world.pavements.length} járdadarab, ` +
        `${world.markings.length} jel, ${world.buildings.length} ház, ${world.signs.length} tábla, ${world.lights.length} lámpa, ${world.furniture.length} fa/lámpa`,
    )
    expect(ms).toBeLessThan(4000)
    expect(world.roads.length).toBeGreaterThan(20)
    expect(world.junctions.some((j) => j.arms >= 3)).toBe(true)
    expect(world.pavements.length).toBeGreaterThan(100)
    expect(world.buildings.length).toBeGreaterThan(50)
  })

  it('az indulási pont az úttesten van', () => {
    expect(index.onAsphalt([world.start.x, world.start.z])).toBe(true)
  })

  it('a táblaoszlopok nem állnak az úttesten, és egy oszlopon legfeljebb három tábla van', () => {
    const onRoad = world.signs.filter((sg) => index.onAsphalt(sg.at, 0.2))
    expect(onRoad.length, `${onRoad.length}/${world.signs.length} oszlop az úttesten`).toBe(0)
    const lightsOnRoad = world.lights.filter((l) => index.onAsphalt(l.at, 0.2))
    expect(lightsOnRoad.length, `${lightsOnRoad.length}/${world.lights.length} lámpaoszlop az úttesten`).toBe(0)
    expect(world.signs.every((sg) => sg.codes.length >= 1 && sg.codes.length <= 3)).toBe(true)
    // Az egy irányba néző, közeli táblák közös oszlopon vannak
    expect(world.signs.filter((sg) => sg.codes.length > 1).length).toBeGreaterThan(10)
  })

  it('a házak nem lógnak az úttestre', () => {
    for (const b of world.buildings) for (const c of buildingCorners(b)) expect(index.onAsphalt(c)).toBe(false)
  })

  it('a járdák nem fedik a többi utat', () => {
    let bad = 0
    for (const p of world.pavements) {
      const c: [number, number] = [(p.quad[0][0] + p.quad[2][0]) / 2, (p.quad[0][1] + p.quad[2][1]) / 2]
      if (index.roadsAt(c).length) bad++
    }
    expect(bad / world.pavements.length).toBeLessThan(0.01)
  })
})
