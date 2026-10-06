import { describe, expect, it } from 'vitest'
import { randomRoute } from '../../data/randomRoute'
import { rngFrom } from '../rng'
import { hasLocalTiles, loadArea } from '../__fixtures__/realArea'
import { buildWorld, indexWorld } from './build'
import { rightLaneCentre } from './lanes'
import { offsetAt } from './polyline'
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
    // (párhuzamosan futó tesztek mellett is; egyedül kb. 1,5 s az osm2streets-szel együtt)
    expect(ms).toBeLessThan(6000)
    expect(world.roads.length).toBeGreaterThan(20)
    expect(world.junctions.some((j) => j.arms >= 3)).toBe(true)
    expect(world.pavements.length).toBeGreaterThan(100)
    expect(world.buildings.length).toBeGreaterThan(50)
  })

  it('a valósághű utcageometria (osm2streets) elkészül, és a sávok közepe a rajzolt úttesten van', () => {
    expect(world.streets).toBeDefined()
    expect(world.streets!.junctions.length).toBeGreaterThan(20)
    expect(world.junctions.filter((j) => j.trims).length).toBeGreaterThan(20)
    // Minden út jobb sávjának közepe (a kereszteződésektől távol) az úttesten van
    let bad = 0
    let n = 0
    for (const r of world.roads)
      for (let s = 15; s < r.length - 15; s += 10) {
        for (const aligned of [true, false]) {
          if ((aligned && r.lanesFwd === 0) || (!aligned && r.lanesBack === 0)) continue
          const lat = aligned ? rightLaneCentre(r, true) : -rightLaneCentre(r, false)
          n++
          if (!index.onAsphalt(offsetAt(r.pts, r.cum, s, lat))) bad++
        }
      }
    expect(bad / n, `${bad}/${n} sávközép nincs az úttesten`).toBeLessThan(0.02)
  })

  it('az utak középvonala és szélessége a rajzolt úttesthez igazodik', () => {
    let bad = 0
    for (const road of world.roads) {
      let n = 0
      let miss = 0
      for (let s = 20; s < road.length - 20; s += 5) {
        if (index.inJunctionPaved(offsetAt(road.pts, road.cum, s, 0), 12)) continue
        n++
        for (const side of [1, -1]) {
          if (!index.onAsphalt(offsetAt(road.pts, road.cum, s, side * (road.halfWidth - 0.4)))) miss++
          if (index.onAsphalt(offsetAt(road.pts, road.cum, s, side * (road.halfWidth + 0.4)))) miss++
        }
      }
      if (n && miss / (4 * n) > 0.1) bad++
    }
    expect(bad / world.roads.length, `${bad}/${world.roads.length} út nem illeszkedik`).toBeLessThan(0.03)
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

  it('a járdák nem fedik az úttestet', () => {
    let bad = 0
    for (const p of world.pavements) {
      const c: [number, number] = [(p.quad[0][0] + p.quad[2][0]) / 2, (p.quad[0][1] + p.quad[2][1]) / 2]
      if (index.onAsphalt(c)) bad++
    }
    expect(bad / world.pavements.length).toBeLessThan(0.01)
  })
})
