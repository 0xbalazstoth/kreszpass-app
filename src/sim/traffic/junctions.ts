import { armsAt, mainArms, nodeIndex, stopBack, type Arm } from '../world/junctionArms'
import { rightLaneCentre } from '../world/lanes'
import { headingAt, offsetAt, pointAt } from '../world/polyline'
import { projectOnSegment, wrapAngle, type XZ } from '../world/project'
import type { Junction, Road, World } from '../world/types'

/**
 * Kereszteződések szabályai a forgalomhoz: minden útágra, hogy mi szabályozza (lámpa, STOP, elsőbbségadás, főút,
 * egyenrangú, körforgalom), és ki kinek köteles elsőbbséget adni. Ugyanazokból az adatokból, mint a táblák és a
 * lámpák, így a vezető azt látja, ami szerint a többiek közlekednek.
 */

export type Control = 'signal' | 'stop' | 'give_way' | 'priority' | 'equal' | 'ring_entry' | 'ring'
export type Turn = 'left' | 'right' | 'straight'

export interface ArmModel extends Arm {
  /** A csomópont felé haladás iránya (heading) a csomópont előtt */
  heading: number
  control: Control
  /** A megállási (várakozási) vonal helye az úton (m) */
  lineS: number
  /** Lámpás ágon a lámpa sorszáma (world.lights) */
  light?: number
}

export interface JunctionModel {
  j: Junction
  arms: ArmModel[]
}

/** Ennyi méteren belül a megközelítéshez tartozik a lámpa vagy a tábla */
const ATTACH_M = 18

export function buildJunctionModels(world: World): Map<number, JunctionModel> {
  const nodeOn = nodeIndex(world.roads)
  const out = new Map<number, JunctionModel>()
  for (const j of world.junctions) {
    if (j.node < 0 || j.arms < 3) continue
    const arms = armsAt(nodeOn, j.node)
    if (arms.length < 3) continue
    const ring = arms.some((a) => a.road.roundabout)
    const main = ring ? [] : mainArms(arms)
    const models: ArmModel[] = arms.map((a) => {
      const sBefore = a.s - a.dir * 8
      const heading = headingAt(a.road.pts, a.road.cum, Math.max(0, Math.min(a.road.length, sBefore))) + (a.dir === 1 ? 0 : Math.PI)
      const lineS = Math.max(0, Math.min(a.road.length, a.s - a.dir * stopBack(j, a.road, a.dir)))
      const lineAt = pointAt(a.road.pts, a.road.cum, lineS)
      const near = (p: XZ, h: number) => Math.hypot(p[0] - lineAt[0], p[1] - lineAt[1]) < ATTACH_M && Math.abs(wrapAngle(h - heading)) < 0.7
      let control: Control
      const light = world.lights.findIndex((l) => !l.repeater && near(l.stopAt, l.heading))
      if (light >= 0) control = 'signal'
      else if (a.road.roundabout) control = 'ring'
      else if (ring) control = 'ring_entry'
      else if (world.stops.some((s) => s.kind === 'stop' && near(s.at, s.heading))) control = 'stop'
      else if (main.length) control = main.includes(a) ? 'priority' : 'give_way'
      else if (world.stops.some((s) => s.kind === 'give_way' && near(s.at, s.heading))) control = 'give_way'
      else control = 'equal'
      return { ...a, heading, control, lineS, ...(light >= 0 ? { light } : {}) }
    })
    // Hegyesszögben becsatlakozó ágon a magtól mért vonal még a másik úton lehet: a várakozó autó ott a többiek
    // útjában állna. Addig hátrébb visszük, amíg a várakozó autó (a sávja közepén) egyik másik ágon sem áll.
    for (const a of models) {
      if (!a.canApproach) continue
      const others = models.filter((b) => b.road !== a.road)
      const onOther = (s: number) => {
        const p = lanePoint(a, s, true).at
        // A várakozó kocsi eleje és a hátulja (a vonal előtt egy kocsihossznyi)
        const back = lanePoint(a, Math.max(0, Math.min(a.road.length, s - a.dir * 4)), true).at
        return others.some((b) => [p, back].some((q) => distToRoad(q, b.road) < b.road.halfWidth + 1.1))
      }
      let back = stopBack(j, a.road, a.dir)
      while (back < j.core + 25 && onOther(a.s - a.dir * back)) back += 1
      a.lineS = Math.max(0, Math.min(a.road.length, a.s - a.dir * back))
    }
    out.set(j.node, { j, arms: models })
  }
  return out
}

/** A megközelítés iránya alapján a csomópont útága (amelyről a jármű érkezik) */
export function armFor(m: JunctionModel, heading: number): ArmModel | null {
  let best: ArmModel | null = null
  let bestD = Infinity
  for (const a of m.arms) {
    if (!a.canApproach) continue
    const d = Math.abs(wrapAngle(a.heading - heading))
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return bestD < 0.9 ? best : null
}

export function turnOf(headingIn: number, headingOut: number): Turn {
  const d = wrapAngle(headingOut - headingIn)
  return d > 0.5 ? 'right' : d < -0.5 ? 'left' : 'straight'
}

export interface Approach {
  arm: ArmModel
  turn: Turn
}

/** Honnan érkezik a másik a mi haladási irányunkhoz képest */
export function relativeSide(me: ArmModel, other: ArmModel): 'right' | 'left' | 'oncoming' | 'same' {
  const d = wrapAngle(other.heading - me.heading)
  if (Math.abs(d) < 0.6) return 'same'
  if (Math.abs(d) > 2.5) return 'oncoming'
  // Ha a másik iránya a miénkhez képest balra fordult (−90°), akkor jobbról jön
  return d < 0 ? 'right' : 'left'
}

const MINOR = new Set<Control>(['stop', 'give_way'])

/**
 * Köteles-e „me” elsőbbséget adni „other”-nek ugyanabban a kereszteződésben (KRESZ szerint):
 * mellékútról a főúton haladónak, körforgalomba behajtva a körben haladónak, egyenrangúban a jobbról érkezőnek,
 * balra kanyarodva a szemből egyenesen haladónak vagy jobbra kanyarodónak (lámpánál, zölden is).
 */
export function mustYield(me: Approach, other: Approach): boolean {
  if (me.arm === other.arm) return false
  const side = relativeSide(me.arm, other.arm)
  const leftVsOncoming = me.turn === 'left' && side === 'oncoming' && other.turn !== 'left'
  const a = me.arm.control
  const b = other.arm.control
  if (a === 'signal' || b === 'signal') return a === 'signal' && b === 'signal' && leftVsOncoming
  if (a === 'ring') return false
  if (a === 'ring_entry') return b === 'ring'
  if (b === 'ring') return true
  if (MINOR.has(a) && b === 'priority') return true
  if (a === 'priority' && MINOR.has(b)) return false
  if (a === 'priority' && b === 'priority') return leftVsOncoming
  // Egyenrangú (vagy két mellékút): jobbkéz-szabály, és a balra kanyarodó elengedi a szembejövőt
  return side === 'right' || leftVsOncoming
}

/** Az útvonal áthaladásai a kereszteződéseken: hol (s), melyik ágról és merre */
export interface RoutePass {
  node: number
  s: number
  approach: Approach
  movement: Movement | null
}

export function routeJunctionPasses(world: World, models: Map<number, JunctionModel>): RoutePass[] {
  const { route } = world
  const out: RoutePass[] = []
  for (const [node, m] of models) {
    let last = -Infinity
    for (let i = 0; i < route.pts.length - 1; i++) {
      const h = projectOnSegment(m.j.at, route.pts[i], route.pts[i + 1])
      if (h.dist > 5) continue
      const s = route.cum[i] + h.t * (route.cum[i + 1] - route.cum[i])
      if (s - last < 30) continue
      last = s
      if (s < 10 || s > route.length - 5) continue
      const hin = headingAt(route.pts, route.cum, s - 12, 5)
      const hout = headingAt(route.pts, route.cum, s + 12, 5)
      // Az ág az irány alapján; ha az útvonal ott kanyarog, az alapján, hogy a csomópont előtt melyik úton halad
      let arm = armFor(m, hin)
      if (!arm) {
        const before = pointAt(route.pts, route.cum, Math.max(0, s - 8))
        let bestD = Infinity
        for (const a of m.arms) {
          if (!a.canApproach) continue
          const p = pointAt(a.road.pts, a.road.cum, Math.max(0, Math.min(a.road.length, a.s - a.dir * 8)))
          const d = Math.hypot(p[0] - before[0], p[1] - before[1])
          if (d < bestD && d < 6) {
            bestD = d
            arm = a
          }
        }
      }
      const exit = exitArmFor(m, hout)
      if (arm) out.push({ node, s, approach: { arm, turn: turnOf(hin, hout) }, movement: exit ? movementOf(m, arm, exit) : null })
    }
  }
  return out.sort((a, b) => a.s - b.s)
}

// ---------------------------------------------------------------- mozgások a kereszteződésen át

/** Egy mozgás: melyik ágról melyik ágra, és a sáv közepén haladó íve a megállási vonaltól a kijáratig */
export interface Movement {
  key: string
  inArm: ArmModel
  outArm: ArmModel
  curve: XZ[]
}

/** Az ág sávközepe a megadott helyen, a haladási irány szerint (toward: a csomópont felé) */
/** Egy pont távolsága egy út középvonalától (m) */
function distToRoad(p: XZ, r: Road): number {
  let best = Infinity
  for (let i = 0; i < r.pts.length - 1; i++) best = Math.min(best, projectOnSegment(p, r.pts[i], r.pts[i + 1]).dist)
  return best
}

function lanePoint(a: Arm, s: number, toward: boolean): { at: XZ; heading: number } {
  const r = a.road
  const travel: 1 | -1 = toward ? a.dir : (-a.dir as 1 | -1)
  const roadH = headingAt(r.pts, r.cum, s, 2)
  const lat = travel === 1 ? rightLaneCentre(r, true) : -rightLaneCentre(r, false)
  return { at: offsetAt(r.pts, r.cum, s, lat, roadH), heading: roadH + (travel === 1 ? 0 : Math.PI) }
}

const movements = new WeakMap<JunctionModel, Map<string, Movement>>()

/** A mozgás íve: harmadfokú Bézier a bejövő sáv megállási vonalától a kimenő sáv kijáratáig, érintőirányban */
export function movementOf(m: JunctionModel, inArm: ArmModel, outArm: ArmModel): Movement {
  let cache = movements.get(m)
  if (!cache) {
    cache = new Map()
    movements.set(m, cache)
  }
  const key = `${m.arms.indexOf(inArm)}>${m.arms.indexOf(outArm)}`
  const hit = cache.get(key)
  if (hit) return hit
  const A = lanePoint(inArm, inArm.lineS, true)
  const sOut = Math.max(0, Math.min(outArm.road.length, outArm.s - outArm.dir * (stopBack(m.j, outArm.road, outArm.dir) + 1)))
  const B = lanePoint(outArm, sOut, false)
  // Jobbra kanyarodva tágabb ív (a hátsó kerék ne menjen fel a sarkon a szegélyre), balra a szembejövő sávot elkerülve
  const right = wrapAngle(B.heading - A.heading) > 0.5
  const L = Math.hypot(B.at[0] - A.at[0], B.at[1] - A.at[1]) * (right ? 0.55 : 0.4)
  const p1: XZ = [A.at[0] + Math.sin(A.heading) * L, A.at[1] - Math.cos(A.heading) * L]
  const p2: XZ = [B.at[0] - Math.sin(B.heading) * L, B.at[1] + Math.cos(B.heading) * L]
  const curve: XZ[] = []
  for (let k = 0; k <= 12; k++) {
    const t = k / 12
    const u = 1 - t
    curve.push([
      u * u * u * A.at[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * B.at[0],
      u * u * u * A.at[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * B.at[1],
    ])
  }
  const mv = { key, inArm, outArm, curve }
  cache.set(key, mv)
  return mv
}

/** A kijárati ág: amelyik irányában a csomópontból elhaladunk */
export function exitArmFor(m: JunctionModel, headingOut: number): ArmModel | null {
  let best: ArmModel | null = null
  let bestD = Infinity
  for (const a of m.arms) {
    if (!a.canLeave) continue
    const d = Math.abs(wrapAngle(a.heading + Math.PI - headingOut))
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return bestD < 0.9 ? best : null
}

const conflicts = new WeakMap<Movement, WeakMap<Movement, boolean>>()

/**
 * Két mozgás keresztezi (vagy érinti) egymást: az íveik közelebb jutnak egymáshoz, mint egy kocsi szélessége.
 * Egymáshoz közeli csomópontok (pl. osztott pályás út két fele) mozgásai között is működik.
 */
export function conflict(_m: JunctionModel | null, a: Movement, b: Movement): boolean {
  if (a.inArm === b.inArm) return false
  let row = conflicts.get(a)
  if (!row) {
    row = new WeakMap()
    conflicts.set(a, row)
  }
  const hit = row.get(b)
  if (hit !== undefined) return hit
  let min = Infinity
  for (const p of a.curve) for (const q of b.curve) min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1]))
  const res = min < 2.6
  row.set(b, res)
  return res
}

/** Résztvevő a kereszteződésben (AI-jármű vagy a vezető) */
export interface Mover {
  approach: Approach
  movement: Movement | null
  /** Hány másodperc múlva ér a kereszteződés közepéhez */
  eta: number
  /** Túl van a megállási vonalán, és még nincs kint */
  inside: boolean
  /** Áll a megállási vonalánál */
  waiting: boolean
  /** Egy helyben áll (bárhol) */
  still?: boolean
}

/**
 * Behajthat-e „me” most: senki ne legyen bent, akinek a mozgása keresztezi az övét, és ne érkezzen `etaLimit`
 * másodpercen belül olyan, akinek elsőbbsége van és a mozgása keresztezi az övét. `waited`: ennyi ideje vár;
 * holtpont ellen ennyi után (ha bent senki sincs) behajt.
 */
export function mustWait(m: JunctionModel, me: Mover, others: Mover[], etaLimit: number, waited = 0): boolean {
  const crosses = (o: Mover) => !me.movement || !o.movement || conflict(m, me.movement, o.movement)
  // Nagyon hosszú várakozás után (körbeérő várakozás a kereszteződésben) a bent álló sem tartja vissza: ha a
  // teste útban van, az ütközés-figyelés úgyis megállítja
  if (others.some((o) => o.inside && crosses(o) && !(waited > 15 && o.still))) return true
  // Sokáig várva kisebb rést is elfogad (ahogy a valóságban), és a szintén várakozóktól nem tart
  const limit = waited > 7 ? Math.min(etaLimit, 2) : etaLimit
  return others.some(
    (o) =>
      !o.inside &&
      mustYield(me.approach, o.approach) &&
      o.eta < limit &&
      crosses(o) &&
      !(o.waiting && (mustYield(o.approach, me.approach) || waited > 7)) &&
      !(waited > 15 && o.still),
  )
}
