import { describe, expect, it } from 'vitest'
import { randomRoute } from '../../data/randomRoute'
import { generateSituations } from '../../data/situations'
import { rngFrom } from '../rng'
import { createSim } from '../sim'
import { CENTER_F } from '../vehicle'
import { hasLocalTiles, loadArea } from '../__fixtures__/realArea'
import { buildWorld } from '../world/build'
import { pointAt } from '../world/polyline'
import type { XZ } from '../world/project'
import { Examiner } from './examiner'
import { buildInstructions } from './navigation'
import { buildRoadGraph, findDetour } from './reroute'

const AREA: [number, number, number, number] = [19.06, 47.545, 19.12, 47.58]

describe.runIf(hasLocalTiles())('útbaigazítás', () => {
  const osm = loadArea(AREA)
  const r = randomRoute(osm, { lengthM: 3500, rnd: rngFrom(3), near: [19.09, 47.562] })
  const world = buildWorld(osm, r.line, { seed: 3 })
  const sim = createSim(world)
  const instructions = buildInstructions(world, generateSituations(r.line, osm, { routeId: 't', newId: () => 'x' }), sim.index)
  const turns = instructions.filter((x) => x.kind === 'turn')

  it('a panel a következő kanyart mutatja, a távolsággal és az utca nevével', () => {
    const ex = new Examiner(world, sim.index, instructions)
    const ins = turns[1]
    ex.progress = { s: ins.s - 100, off: 0, along: true, offFor: 0 }
    const g = ex.guidance()
    expect(g.kind).toBe(ins.dir)
    expect(Math.round(g.distance)).toBe(100)
    expect(instructions.filter((x) => x.street).length).toBeGreaterThan(instructions.length / 2)
  })

  it('távoli manővernél „kövesse az utat”, a végén a megállás', () => {
    const ex = new Examiner(world, sim.index, instructions)
    const gaps = instructions.map((x, i) => [x.s - (i ? instructions[i - 1].s : 0), x.s] as const).filter(([gap]) => gap > 650)
    if (gaps.length) {
      ex.progress = { s: gaps[0][1] - 640, off: 0, along: true, offFor: 0 }
      expect(ex.guidance().kind).toBe('follow')
    }
    ex.progress = { s: world.route.length - 40, off: 0, along: true, offFor: 0 }
    expect(ex.guidance().kind).toBe('finish')
  })

  it('rossz irányba fordulva szabályos kerülő vezet vissza az útvonalra', () => {
    const graph = buildRoadGraph(world)
    let tested = 0
    for (const ins of turns) {
      // Egy olyan ág a kereszteződésben, amelyre az útvonal nem fordul be
      const hits = sim.index.roadsAt(ins.at)
      for (const h of hits) {
        const r = h.road
        for (const dir of [1, -1] as const) {
          const s = h.s + dir * 40
          if (s < 0 || s > r.length) continue
          if (r.oneway !== 0 && r.oneway !== dir) continue
          const at = pointAt(r.pts, r.cum, s)
          const routeNear = world.route.pts.some((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) < 25)
          if (routeNear) continue
          const heading = Math.atan2(at[0] - ins.at[0], -(at[1] - ins.at[1]))
          const d = findDetour(world, graph, sim.index, at, heading, ins.s)
          expect(d, `kerülő ${Math.round(ins.s)} m-nél`).not.toBeNull()
          if (!d) continue
          const end = d.pts[d.pts.length - 1]
          const rp = pointAt(world.route.pts, world.route.cum, d.rejoinS)
          expect(Math.hypot(end[0] - rp[0], end[1] - rp[1])).toBeLessThan(9)
          // Csak szabályos (az egyirányúságot betartó) lépések: minden szakasz a gráf egy éle
          const coordOf = (p: XZ) => [...graph.coord.entries()].find(([, c]) => c[0] === p[0] && c[1] === p[1])?.[0]
          for (let i = 1; i < d.pts.length - 1; i++) {
            const a = coordOf(d.pts[i])
            const b = coordOf(d.pts[i + 1])
            if (a === undefined || b === undefined) continue
            expect(graph.out.get(a)?.some((e) => e.to === b)).toBe(true)
          }
          tested++
        }
      }
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('letérés után a vizsgabiztos kerülőt mutat, visszatérve folytatódik az útvonal', () => {
    const ex = new Examiner(world, sim.index, instructions)
    const ins = turns[1]
    ex.progress = { s: ins.s - 5, off: 0, along: true, offFor: 0 }
    // Az autó egy olyan úton áll, amely legalább 40 m-re van az útvonaltól
    let state = { ...sim.state }
    const far = world.roads.find((rd) => rd.pts.every((p) => world.route.pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 40)))
    expect(far).toBeTruthy()
    const p = far!.pts[0]
    const q = far!.pts[1]
    const heading = Math.atan2(q[0] - p[0], -(q[1] - p[1]))
    for (let i = 0; i < 300; i++) {
      state = { ...state, t: state.t + 1 / 60, car: { ...state.car, x: p[0] - Math.sin(heading) * CENTER_F, z: p[1] + Math.cos(heading) * CENTER_F, heading, speed: 0, handbrake: false } }
      ex.update(state)
    }
    expect(ex.progress.offFor).toBeGreaterThan(2)
    expect(ex.guidance().detour).toBe(true)
    // Vissza az útvonalra: a kanyar utáni szakaszon folytatódik a haladás
    const back = pointAt(world.route.pts, world.route.cum, ins.s + 60)
    const h2 = Math.atan2(...((): [number, number] => {
      const b2 = pointAt(world.route.pts, world.route.cum, ins.s + 64)
      return [b2[0] - back[0], -(b2[1] - back[1])]
    })())
    state = { ...state, t: state.t + 1 / 60, car: { ...state.car, x: back[0], z: back[1], heading: h2 } }
    for (let i = 0; i < 10; i++) {
      state = { ...state, t: state.t + 1 / 60 }
      ex.update(state)
    }
    expect(ex.progress.offFor).toBe(0)
    expect(ex.progress.s).toBeGreaterThan(ins.s + 40)
    expect(ex.guidance().detour).toBe(false)
  })
})
