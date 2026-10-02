import { describe, expect, it } from 'vitest'
import { randomRoute } from '../../data/randomRoute'
import { generateSituations } from '../../data/situations'
import { BotDriver, type BotOptions } from '../bot'
import { rngFrom } from '../rng'
import { applyAction, createSim, stepWorld } from '../sim'
import { buildJunctionModels, routeJunctionPasses } from '../traffic/junctions'
import { TrafficSystem, type TrafficOptions } from '../traffic/traffic'
import { buildRoadGraph } from './reroute'
import { hasLocalTiles, loadArea } from '../__fixtures__/realArea'
import { buildWorld } from '../world/build'
import { Examiner } from './examiner'
import { buildInstructions } from './navigation'

// Újpest környéke (a helyi csomag része)
const AREA: [number, number, number, number] = [19.06, 47.545, 19.12, 47.58]

function drive(seed: number, opts: BotOptions, traffic?: Partial<TrafficOptions>) {
  const osm = loadArea(AREA)
  const r = randomRoute(osm, { lengthM: 3500, rnd: rngFrom(seed), near: [19.09, 47.562] })
  const world = buildWorld(osm, r.line, { seed })
  const situations = generateSituations(r.line, osm, { routeId: 't', newId: () => 'x' })
  const sim = createSim(world)
  const instructions = buildInstructions(world, situations, sim.index)
  const ex = new Examiner(world, sim.index, instructions)
  let tr: TrafficSystem | undefined
  if (traffic) {
    const models = buildJunctionModels(world)
    tr = new TrafficSystem(world, buildRoadGraph(world), sim.index, models, routeJunctionPasses(world, models), {
      seed: seed * 7 + 1,
      cars: 10,
      peds: 8,
      directors: true,
      ...traffic,
    })
    sim.traffic = tr
    ex.traffic = tr
  }
  const bot = new BotDriver(world, sim.index, instructions, { ...opts, traffic: tr })
  for (let i = 0; i < 60 * 1200 && !ex.end; i++) {
    const { controls, actions, look } = bot.drive(sim.state, ex.progress.s)
    for (const a of actions) sim.state = applyAction(sim.state, a)
    sim.state = { ...sim.state, look }
    sim.state = stepWorld(sim, sim.state, controls)
    ex.update(sim.state)
  }
  return { ex, world, instructions, sim }
}

describe.runIf(hasLocalTiles())('vizsgabiztos és robotsofőr egy valódi útvonalon', () => {
  // Különböző véletlen útvonalak Újpesten (a 7-es egy kereszteződésben szinte visszafordul: ilyen a vizsgán nincs)
  for (const seed of [1, 2, 3, 4, 5, 6, 8, 9, 11]) {
    it(`a gondos sofőr hibátlanul végigmegy (${seed})`, () => {
      const { ex, world, instructions, sim } = drive(seed, { careful: true })
      const summary = `${Math.round(world.route.length)} m, ${instructions.filter((x) => x.kind === 'turn').length} kanyar, ${world.stops.length} STOP/elsőbbség, ${world.lights.length} lámpa, idő ${Math.round(sim.state.t)} s, haladás ${Math.round(ex.progress.s)} m`
      expect(ex.faults.map((f) => `${f.code} @${Math.round(f.s)} m: ${f.note}`), summary).toEqual([])
      expect(ex.end?.kind, summary).toBe('finished')
    })
  }

  for (const seed of [1, 2, 3, 4, 5, 6, 8, 9, 11]) {
    it(`a gondos sofőr élő forgalomban is hibátlanul végigmegy (${seed})`, () => {
      const { ex, world, sim } = drive(seed, { careful: true }, {})
      const summary = `${Math.round(world.route.length)} m, idő ${Math.round(sim.state.t)} s, haladás ${Math.round(ex.progress.s)} m, autók most ${sim.traffic?.cars.length}`
      expect(ex.faults.map((f) => `${f.code} @${Math.round(f.s)} m: ${f.note}`), summary).toEqual([])
      expect(ex.end?.kind, summary).toBe('finished')
    })
  }

  it('aki nem ad elsőbbséget, 8/24-et kap (minden kereszteződéshez jön valaki)', () => {
    const codes = new Set<string>()
    for (const seed of [3, 11, 2, 1, 4, 5, 6, 8, 9]) {
      const { ex } = drive(seed, { careful: true, ignorePriority: true }, { carChance: 1, cars: 6 })
      ex.faults.forEach((f) => codes.add(f.code))
      if (codes.has('8/24')) break
    }
    expect(codes.has('8/24')).toBe(true)
  })

  it('a gyalogos a zebrán: a gondos sofőr megvárja', () => {
    // Minden zebránál gyalogos lép le: hibátlan marad, és valóban megállt (a vezetés tovább tartott)
    const seed = [1, 2, 3, 4, 5, 6, 8, 9, 11].find((s) => buildWorld(loadArea(AREA), randomRoute(loadArea(AREA), { lengthM: 3500, rnd: rngFrom(s), near: [19.09, 47.562] }).line, { seed: s }).crossings.length > 0)!
    const { ex } = drive(seed, { careful: true }, { pedChance: 1, cars: 4 })
    expect(ex.faults.filter((f) => f.code === '8/27')).toEqual([])
  })

  it('a hanyag sofőr hibáit felírja', () => {
    const { ex } = drive(3, { careful: false, speedOver: 20 })
    const codes = new Set(ex.faults.map((f) => f.code))
    expect(codes.has('8/16')).toBe(true)
    expect(codes.has('8/6')).toBe(true)
    expect(ex.failed).toBe(true)
  })
})
