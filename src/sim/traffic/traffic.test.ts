import { describe, expect, it } from 'vitest'
import { CAR } from '../../domain/maneuvers/geometry'
import { randomRoute } from '../../data/randomRoute'
import { buildRoadGraph } from '../examiner/reroute'
import { rngFrom } from '../rng'
import { hasLocalTiles, loadArea } from '../__fixtures__/realArea'
import { buildWorld, indexWorld } from '../world/build'
import type { Road } from '../world/types'
import { idmAccel, IDM_DEFAULT } from './idm'
import { buildJunctionModels, mustYield, routeJunctionPasses, type ArmModel, type Control, type Turn } from './junctions'
import { boxOf, overlap } from '../sim'
import { TrafficSystem } from './traffic'

const arm = (heading: number, control: Control): ArmModel =>
  ({ road: {} as Road, s: 0, dir: 1, canApproach: true, canLeave: true, heading, control, lineS: 0 }) as ArmModel
const ap = (heading: number, control: Control, turn: Turn = 'straight') => ({ arm: arm(heading, control), turn })

// Észak felé haladunk (heading 0); jobbról (keletről) érkező nyugat felé halad (−π/2)
const N = 0
const FROM_RIGHT = -Math.PI / 2
const FROM_LEFT = Math.PI / 2
const ONCOMING = Math.PI

describe('elsőbbség (KRESZ)', () => {
  it('egyenrangú kereszteződésben a jobbról érkezőnek kell elsőbbséget adni', () => {
    expect(mustYield(ap(N, 'equal'), ap(FROM_RIGHT, 'equal'))).toBe(true)
    expect(mustYield(ap(N, 'equal'), ap(FROM_LEFT, 'equal'))).toBe(false)
    expect(mustYield(ap(FROM_LEFT, 'equal'), ap(N, 'equal'))).toBe(true)
  })

  it('mellékútról a főúton haladónak; főútról senkinek (balra kanyarodást kivéve)', () => {
    expect(mustYield(ap(N, 'give_way'), ap(FROM_LEFT, 'priority'))).toBe(true)
    expect(mustYield(ap(N, 'stop'), ap(FROM_RIGHT, 'priority'))).toBe(true)
    expect(mustYield(ap(FROM_LEFT, 'priority'), ap(N, 'give_way'))).toBe(false)
  })

  it('balra kanyarodva a szemből egyenesen haladót vagy jobbra kanyarodót el kell engedni', () => {
    expect(mustYield(ap(N, 'priority', 'left'), ap(ONCOMING, 'priority', 'straight'))).toBe(true)
    expect(mustYield(ap(N, 'priority', 'left'), ap(ONCOMING, 'priority', 'right'))).toBe(true)
    expect(mustYield(ap(N, 'signal', 'left'), ap(ONCOMING, 'signal', 'straight'))).toBe(true)
    expect(mustYield(ap(N, 'signal', 'straight'), ap(FROM_RIGHT, 'signal', 'straight'))).toBe(false)
  })

  it('körforgalomba behajtva a körben haladónak kell elsőbbséget adni', () => {
    expect(mustYield(ap(N, 'ring_entry'), ap(FROM_LEFT, 'ring'))).toBe(true)
    expect(mustYield(ap(FROM_LEFT, 'ring'), ap(N, 'ring_entry'))).toBe(false)
  })
})

describe('követés (IDM)', () => {
  it('az előttünk haladót biztonságos távolságban követi, és nem megy bele', () => {
    const p = { ...IDM_DEFAULT, v0: 14 }
    let lead = 40
    let x = 0
    let v = 14
    let minGap = Infinity
    for (let t = 0; t < 120; t += 0.05) {
      lead += 10 * 0.05
      v = Math.max(0, v + idmAccel(p, v, lead - x - CAR.length, v - 10) * 0.05)
      x += v * 0.05
      minGap = Math.min(minGap, lead - x - CAR.length)
    }
    const gap = lead - x - CAR.length
    expect(minGap).toBeGreaterThan(0)
    // Egyensúlyban kb. s0 + v·T
    expect(gap).toBeGreaterThan(p.s0 + 10 * p.T - 2)
    expect(gap).toBeLessThan(p.s0 + 10 * p.T + 8)
  })
})

describe.runIf(hasLocalTiles())('élő forgalom a valódi utcákon', () => {
  const osm = loadArea([19.06, 47.545, 19.12, 47.58])
  const r = randomRoute(osm, { lengthM: 3500, rnd: rngFrom(3), near: [19.09, 47.562] })
  const world = buildWorld(osm, r.line, { seed: 3 })
  const index = indexWorld(world)
  const graph = buildRoadGraph(world)
  const models = buildJunctionModels(world)

  it('a kereszteződések szabályai a táblákkal összhangban vannak', () => {
    const controls = [...models.values()].flatMap((m) => m.arms.map((a) => a.control))
    expect(controls).toContain('priority')
    expect(controls).toContain('give_way')
    expect(controls).toContain('signal')
  })

  it('öt perc alatt az autók nem ütköznek egymásba, és nem ragadnak be', () => {
    const tr = new TrafficSystem(world, graph, index, models, routeJunctionPasses(world, models), { seed: 5, cars: 24, peds: 10, directors: false })
    // A vezető a város közepén áll, félreállva (ne zavarja a forgalmat)
    const mid = world.route.pts[Math.floor(world.route.pts.length / 2)]
    const player = { x: mid[0] + 200, z: mid[1] + 200, heading: 0, speed: 0 }
    const stuck = new Map<number, number>()
    let overlaps = 0
    let maxStuck = 0
    let seen = 0
    // Holtpont: egyszerre sok autó áll régóta (forgalmas helyen egy-egy autó várhat sokat, de a forgalom halad)
    let worstJam = 0
    for (let i = 0; i < 60 * 300; i++) {
      tr.step(1 / 60, i / 60, player)
      if (i % 30) continue
      seen = Math.max(seen, tr.cars.length)
      for (const c of tr.cars) {
        const st = c.v < 0.1 ? (stuck.get(c.id) ?? 0) + 0.5 : 0
        stuck.set(c.id, st)
        maxStuck = Math.max(maxStuck, st)
      }
      worstJam = Math.max(worstJam, tr.cars.filter((c) => (stuck.get(c.id) ?? 0) > 60).length / Math.max(1, tr.cars.length))
      for (let a = 0; a < tr.cars.length; a++)
        for (let b = a + 1; b < tr.cars.length; b++) {
          const A = tr.cars[a]
          const B = tr.cars[b]
          if (Math.hypot(A.x - B.x, A.z - B.z) > 6) continue
          // Valódi ütközés: a két kocsi téglalapja (kicsit kisebbre véve, a tükrök nélkül) fedi egymást
          if (overlap(boxOf(A.x, A.z, A.heading, CAR.length - 0.2, CAR.width - 0.2), boxOf(B.x, B.z, B.heading, CAR.length - 0.2, CAR.width - 0.2))) overlaps++
        }
    }
    expect(seen).toBeGreaterThan(10)
    expect(overlaps).toBe(0)
    // Nincs holtpont: soha nem áll egyszerre az autók harmada egy percnél tovább, és egyik sem marad örökre
    console.log(`leghosszabb állás ${maxStuck} s, legrosszabb torlódás ${(worstJam * 100).toFixed(0)}%`)
    expect(worstJam).toBeLessThan(0.34)
    expect(maxStuck).toBeLessThan(240)
  })
})
