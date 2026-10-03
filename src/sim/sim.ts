import { CAR } from '../domain/maneuvers/geometry'
import type { Look } from '../domain/maneuvers/types'
import { carPoints, initialCar, stepCar, toggleGear, toggleIndicator, type CarState, type Controls } from './vehicle'
import { CENTER_F } from './vehicle'
import { indexWorld } from './world/build'
import type { TrafficSystem } from './traffic/traffic'
import type { RoadIndex } from './world/roadIndex'
import type { World } from './world/types'

/**
 * A szimuláció: fix, 60 Hz-es lépésekben halad (a rajzolástól függetlenül), így a fizika és a szabályfigyelés
 * minden gépen ugyanúgy viselkedik.
 */

export const STEP_S = 1 / 60
/** Egy rajzolt képkocka legfeljebb ennyi szimulációs lépést pótol be (lassú gépen inkább lassul, mint hogy ugráljon) */
const MAX_STEPS = 6

/** Egyszeri kezelőmozdulatok (gombnyomás) */
export type SimAction = 'indicator_left' | 'indicator_right' | 'hazard' | 'gear' | 'handbrake'

/** Ami a vezetés közben történt (a vizsgabiztos és a visszajelzés ebből dolgozik) */
export type SimEvent =
  | { kind: 'kerb'; t: number; at: [number, number] }
  | { kind: 'crash'; t: number; at: [number, number]; what: 'building' | 'vehicle' | 'pedestrian' }
  | { kind: 'offroad'; t: number; at: [number, number] }

export interface SimState {
  /** A szimuláció ideje (s) */
  t: number
  car: CarState
  look: Look
  /** Kerék a járdán (szegélyen) / az autó a füvön */
  onKerb: boolean
  offRoad: boolean
  events: SimEvent[]
  /** Rövid kezelési tanács a műszerfalon (pl. miért nem indul az autó) és az ideje (s) */
  notice?: { text: string; t: number }
}

/** Ennyi ideig látszik a kezelési tanács (s) */
export const NOTICE_S = 3

export interface Sim {
  world: World
  index: RoadIndex
  state: SimState
  /** Élő forgalom (autók, gyalogosok); nélküle üres a város */
  traffic?: TrafficSystem
  /** A nem lefutott idő (s), a következő képkockánál pótoljuk */
  acc: number
}

export function createSim(world: World): Sim {
  const { start } = world
  // A kezdőpont a kocsi közepe; a modell a hátsó tengely közepével számol
  const x = start.x - Math.sin(start.heading) * CENTER_F
  const z = start.z + Math.cos(start.heading) * CENTER_F
  return {
    world,
    index: indexWorld(world),
    acc: 0,
    state: { t: 0, car: initialCar(x, z, start.heading), look: 'ahead', onKerb: false, offRoad: false, events: [] },
  }
}

export function applyAction(s: SimState, a: SimAction): SimState {
  switch (a) {
    case 'indicator_left':
      return { ...s, car: toggleIndicator(s.car, 'left') }
    case 'indicator_right':
      return { ...s, car: toggleIndicator(s.car, 'right') }
    case 'hazard':
      return { ...s, car: { ...s.car, hazard: !s.car.hazard } }
    case 'gear': {
      const car = toggleGear(s.car)
      // Automata váltó: menet közben nem vált (a kúszó autót előbb meg kell állítani)
      if (car === s.car) return { ...s, notice: { text: 'Váltani csak álló autóval lehet: tartsd lenyomva a féket (S), és úgy válts.', t: s.t } }
      return { ...s, car, notice: undefined }
    }
    case 'handbrake':
      return { ...s, car: { ...s.car, handbrake: !s.car.handbrake }, notice: undefined }
  }
}

/** Egy szimulációs lépés: mozgás, ütközés a házakkal, szegély és fű */
export function stepSim(sim: Pick<Sim, 'index'>, s: SimState, ctl: Controls): SimState {
  const t = s.t + STEP_S
  let car = stepCar(s.car, ctl, STEP_S)
  // Füvön (padkán) erősebben lassul
  if (s.offRoad && Math.abs(car.speed) > 0) car = { ...car, speed: car.speed * (1 - 0.6 * STEP_S) }
  const events: SimEvent[] = []
  const { corners, wheels } = carPoints(car)

  // Házfal: az autó nem mehet bele; megáll, és ütközésnek számít
  const hit = corners.find((c) => sim.index.buildingAt(c))
  if (hit) {
    if (Math.abs(s.car.speed) > 0.5) events.push({ kind: 'crash', t, at: hit, what: 'building' })
    car = { ...s.car, speed: 0 }
  }

  const onKerb = wheels.some((w) => sim.index.onPavement(w) && !sim.index.onAsphalt(w))
  const offRoad = wheels.every((w) => !sim.index.onAsphalt(w) && !sim.index.onPavement(w))
  if (onKerb && !s.onKerb) events.push({ kind: 'kerb', t, at: [car.x, car.z] })
  // A szegélyre felhajtás lassít (zökken)
  if (onKerb && !s.onKerb) car = { ...car, speed: car.speed * 0.7 }
  if (offRoad && !s.offRoad) events.push({ kind: 'offroad', t, at: [car.x, car.z] })

  // Gázt ad, de a kézifék be van húzva: nem indul el, mondjuk meg, miért
  const notice = ctl.throttle > 0.5 && car.handbrake && Math.abs(car.speed) < 0.1 ? { text: 'Be van húzva a kézifék: a Szóközzel engedd ki.', t } : s.notice
  return { ...s, t, car, onKerb, offRoad, notice, events: events.length ? [...s.events, ...events] : s.events }
}

/** Két irányított téglalap fedi-e egymást (szeparáló tengelyek) */
export function overlap(a: [number, number][], b: [number, number][]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < 4; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % 4]
      const nx = -(q[1] - p[1])
      const nz = q[0] - p[0]
      const pa = a.map(([x, z]) => x * nx + z * nz)
      const pb = b.map(([x, z]) => x * nx + z * nz)
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false
    }
  return true
}

/** Egy jármű (a közepével és irányával megadva) sarkai */
export function boxOf(x: number, z: number, heading: number, len: number, wid: number): [number, number][] {
  const fx = Math.sin(heading)
  const fz = -Math.cos(heading)
  const rx = Math.cos(heading)
  const rz = Math.sin(heading)
  const at = (f: number, r: number): [number, number] => [x + fx * f + rx * r, z + fz * f + rz * r]
  return [at(len / 2, -wid / 2), at(len / 2, wid / 2), at(-len / 2, wid / 2), at(-len / 2, -wid / 2)]
}

/** A vezető lépése, majd a forgalomé, végül az ütközések a forgalommal */
export function stepWorld(sim: Sim, s: SimState, ctl: Controls): SimState {
  let next = stepSim(sim, s, ctl)
  const tr = sim.traffic
  if (!tr) return next
  const c = next.car
  const cx = c.x + Math.sin(c.heading) * CENTER_F
  const cz = c.z - Math.cos(c.heading) * CENTER_F
  tr.step(STEP_S, next.t, { x: cx, z: cz, heading: c.heading, speed: Math.abs(c.speed) })
  const mine = boxOf(cx, cz, c.heading, CAR.length, CAR.width)
  for (const o of tr.cars) {
    if (Math.hypot(o.x - cx, o.z - cz) > 6) continue
    if (!overlap(mine, boxOf(o.x, o.z, o.heading, CAR.length, CAR.width))) continue
    // Ütközés akkor a vezető hibája, ha ő mozgott (az álló vezetőnek nekimenő autót a forgalom elkerüli)
    o.v = 0
    if (Math.abs(c.speed) > 0.3) next = { ...next, car: { ...next.car, speed: 0 }, events: [...next.events, { kind: 'crash', t: next.t, at: [cx, cz], what: 'vehicle' }] }
  }
  // Gázolás csak mozgó autóval (álló autónak a gyalogos nem megy neki: megkerüli vagy megvárja)
  for (const p of Math.abs(c.speed) > 0.5 ? tr.peds : []) {
    if (Math.hypot(p.x - cx, p.z - cz) > 4) continue
    if (!overlap(mine, boxOf(p.x, p.z, p.heading, 0.5, 0.5))) continue
    next = { ...next, car: { ...next.car, speed: 0 }, events: [...next.events, { kind: 'crash', t: next.t, at: [p.x, p.z], what: 'pedestrian' }] }
  }
  return next
}

/** A valós eltelt idő (s) szerinti lépések; visszaadja a lépésszámot */
export function advance(sim: Sim, ctl: Controls, realDt: number): number {
  sim.acc = Math.min(sim.acc + realDt, STEP_S * MAX_STEPS)
  let n = 0
  while (sim.acc >= STEP_S) {
    sim.state = stepWorld(sim, sim.state, ctl)
    sim.acc -= STEP_S
    n++
  }
  return n
}
