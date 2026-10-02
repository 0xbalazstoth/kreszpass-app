import { CAR } from '../../domain/maneuvers/geometry'
import type { GraphEdge, RoadGraph } from '../examiner/reroute'
import { rngFrom } from '../rng'
import { lightState } from '../world/lights'
import { forwardOf, rightOf } from '../world/polyline'
import { projectOnSegment, wrapAngle, type XZ } from '../world/project'
import type { RoadIndex } from '../world/roadIndex'
import type { World } from '../world/types'
import { pointAt } from '../world/polyline'
import { idmAccel, IDM_DEFAULT, type IdmParams } from './idm'
import { mustWait, type JunctionModel, type Mover, type RoutePass } from './junctions'
import { buildPath, pathHeading, randomWalk, walkBack, type Path } from './paths'
import { boxOf, overlap } from '../sim'

/**
 * Élő forgalom a vezető körül: gépkocsik, amelyek a KRESZ szerint közlekednek (követési távolság, jelzőlámpa, STOP,
 * elsőbbségadás, jobbkéz-szabály, gyalogos a zebrán), és gyalogosok a járdán és a zebrákon. A vezető útvonalának
 * kereszteződéseihez és zebráihoz időzítve („rendező”) is érkeznek járművek és gyalogosok, hogy minden vezetésben
 * legyen elsőbbségi helyzet – és minden vezetés más legyen.
 */

export interface AiCar {
  id: number
  path: Path
  /** A kocsi közepe az útvonal mentén (m) */
  s: number
  v: number
  /** Az utolsó lépés gyorsulása (m/s²): a vezető miatti hirtelen fékezés felismeréséhez */
  accel: number
  params: IdmParams
  color: string
  x: number
  z: number
  heading: number
  blink: 'left' | 'right' | null
  stopped: Set<number>
  waitSince: number | null
  /** A zebrák az út mentén (s) és sorszámuk */
  crossings: Array<{ s: number; index: number }>
  /** A vezető útvonalának kereszteződéséhez rendezett jármű */
  directed: boolean
  /** Akinek a teste a következő pillanatban útban van (ütközés elkerülése); −1: a vezető */
  blocker: number | null
  /** Egymásra várakozó körben ő indulhat (nem veszi figyelembe az akadályát) */
  free: boolean
  /** Ennyi ideje áll (s) */
  stuckFor: number
}

export type PedMode = 'walk' | 'wait' | 'cross'

export interface Ped {
  id: number
  x: number
  z: number
  heading: number
  v: number
  mode: PedMode
  model: number
  /** Zebránál: melyik zebra, és a cél (a túloldali járdaszél) */
  crossing?: number
  target?: XZ
  /** A rendezett gyalogos akkor lép le, amikor a vezető ennyire van a zebrától (m) */
  stepAt?: number
}

/** A vezető autója a forgalom szemszögéből */
export interface PlayerCar {
  x: number
  z: number
  heading: number
  speed: number
}

export interface TrafficOptions {
  seed: number
  /** Háttérforgalom: ennyi autó és gyalogos a vezető körül */
  cars: number
  peds: number
  /** Időzített találkozások a vezető útvonalán */
  directors: boolean
  /** Ekkora eséllyel jön jármű egy kereszteződéshez, illetve gyalogos egy zebrához (alapból 0,5 és 0,6) */
  carChance?: number
  pedChance?: number
}

/**
 * Mennyi idő alatt ér a kereszteződés közepéhez (s): gyorsulással számolva, így az álló (pl. épp induló) jármű sem
 * tűnik „végtelen messzinek”
 */
export function etaOf(d: number, v: number, a = 1.5): number {
  if (d <= 0) return 0
  return (-v + Math.sqrt(v * v + 2 * a * d)) / a
}

const COLORS = ['#b91c1c', '#e5e7eb', '#111827', '#1d4ed8', '#9ca3af', '#065f46', '#92400e', '#f59e0b', '#475569', '#7c2d12']
const SPAWN_MIN = 90
const SPAWN_MAX = 260
const DESPAWN = 330
const PED_DESPAWN = 220
const HALF_LEN = CAR.length / 2
/** Ezen belül érkező jármű miatt nem hajt be (s) */
const YIELD_ETA = 4.5

type Presence = Mover

export class TrafficSystem {
  readonly world: World
  readonly graph: RoadGraph
  readonly index: RoadIndex
  readonly models: Map<number, JunctionModel>
  readonly passes: RoutePass[]
  cars: AiCar[] = []
  peds: Ped[] = []
  private opts: TrafficOptions
  private rnd: () => number
  private nextId = 1
  private playerS = 0
  private directedNodes = new Set<string>()
  private directedCrossings = new Set<number>()
  readonly routeCrossings: Array<{ s: number; index: number }>
  private t = 0
  private playerStill = 0
  private lastPlayer: PlayerCar | null = null

  /** A vezető utolsó ismert helye (a rajzolás ehhez méri a távolságot) */
  get viewer(): PlayerCar | null {
    return this.lastPlayer
  }

  constructor(world: World, graph: RoadGraph, index: RoadIndex, models: Map<number, JunctionModel>, passes: RoutePass[], opts: TrafficOptions) {
    this.world = world
    this.graph = graph
    this.index = index
    this.models = models
    this.passes = passes
    this.opts = opts
    this.rnd = rngFrom(opts.seed)
    this.routeCrossings = crossingsAlong(world, world.route.pts, world.route.cum)
  }

  /** A vezető hol tart az útvonalán (a vizsgabiztos frissíti) */
  setPlayerProgress(s: number): void {
    this.playerS = s
  }

  /** A vezető következő kereszteződése az útvonalán (ha a közelben van) */
  playerPresence(player: PlayerCar): (Presence & { node: number }) | null {
    const p = this.passes.find((x) => x.s > this.playerS - this.models.get(x.node)!.j.core - 1)
    if (!p) return null
    const m = this.models.get(p.node)!
    const d = p.s - this.playerS
    if (d > 80) return null
    const lineDist = d - (m.j.core + 2) - (CAR.front - 1.35)
    // Bent van: az eleje már túl van a megállási vonalán, és még nem hagyta el a kereszteződést
    const inside = lineDist < -0.5 && d > -(m.j.core + 1)
    return { node: p.node, approach: p.approach, movement: p.movement, eta: etaOf(d, player.speed), inside, waiting: player.speed < 0.5 && lineDist < 6 && lineDist > -1 }
  }

  /**
   * A kereszteződés (és a 25 m-en belüli szomszédos csomópontok, pl. osztott pályás út másik fele) közelében lévő
   * AI-járművek (a vizsgabiztos és a robotsofőr is ezt nézi)
   */
  presencesAt(node: number): Array<Presence & { car: AiCar }> {
    const out: Array<Presence & { car: AiCar }> = []
    const at = this.models.get(node)?.j.at
    for (const c of this.cars) {
      const pj = c.path.junctions.find((x) => x.node === node) ?? (at && c.path.junctions.find((x) => Math.hypot(x.model.j.at[0] - at[0], x.model.j.at[1] - at[1]) < 25 && x.s > c.s - 30))
      if (!pj) continue
      const d = pj.s - c.s
      const core = pj.model.j.core
      if (d < -(core + 2) || d > 90) continue
      const lineDist = pj.lineS - (c.s + HALF_LEN)
      out.push({ car: c, approach: pj.approach, movement: pj.movement, eta: etaOf(d, c.v), inside: lineDist < -0.5 && d > -(core + 1), waiting: c.v < 0.5 && lineDist < 5 && lineDist > -1 })
    }
    return out
  }

  /** Gyalogos a zebrán (az úttesten) vagy lelépni készül */
  crossingBusy(index: number, soon = false): boolean {
    return this.peds.some((p) => p.crossing === index && (p.mode === 'cross' || (soon && p.mode === 'wait' && p.stepAt === undefined)))
  }

  step(dt: number, t: number, player: PlayerCar): void {
    this.t = t
    this.lastPlayer = player
    const pfx = Math.sin(player.heading)
    const pfz = -Math.cos(player.heading)
    this.spawn(player, pfx, pfz)
    const me = this.playerPresence(player)
    // Ütközés elkerülése: kinek a teste van a következő pillanatbeli helyünkön (előbb mindenkinél, utána haladnak)
    for (const c of this.cars) {
      c.blocker = this.blockerOf(c, player)
      c.free = false
    }
    this.resolveCycles(player)
    // A vezetőre ne várjon a végtelenségig: ha a vezető áll, és a pontos útvonalunk elkerüli, elindulhatunk
    this.playerStill = player.speed < 0.2 ? this.playerStill + dt : 0
    if (this.playerStill > 2)
      for (const c of this.cars) if (c.blocker === -1 && c.v < 0.3 && this.blockerOf(c, player, true) === null) c.free = true
    for (const c of this.cars) this.drive(c, dt, player, me)
    // Feloldhatatlan torlódás: a vezetőtől távol (nem látja) a régóta álló autó eltűnik
    for (const c of this.cars) c.stuckFor = c.v < 0.1 ? c.stuckFor + dt : 0
    this.cars = this.cars.filter(
      (c) =>
        c.s < c.path.length - 2 &&
        Math.hypot(c.x - player.x, c.z - player.z) < DESPAWN &&
        !((c.stuckFor > 30 || (c.stuckFor > 15 && c.blocker !== null)) && Math.hypot(c.x - player.x, c.z - player.z) > 50),
    )
    for (const p of this.peds) this.walk(p, dt)
    this.peds = this.peds.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) < PED_DESPAWN && !(p.mode === 'cross' && !p.target))
  }

  // ---------------------------------------------------------------- autók

  /** Ahol a kocsi kb. egy másodperc múlva lesz: ha ott valaki van, meg kell állnia (bármilyen irányból) */
  private blockerOf(c: AiCar, player: PlayerCar, exact = false): number | null {
    // Pontos vizsgálatnál a karosszéria tükrök nélkül (kicsit kisebb), hogy az álló vezető mellett elférjen
    const growL = exact ? -0.2 : 0.4
    const growW = exact ? -0.2 : 0.3
    // A következő kb. egy másodpercnyi út, 2 m-enként: a kocsi teste ott valakivel fedné-e egymást
    const reach = Math.max(2.5, Math.min(12, c.v * 1.0 + 2.5))
    const near = this.cars.filter((o) => o !== c && Math.hypot(o.x - c.x, o.z - c.z) < reach + 20)
    // A mögöttünk ugyanabban a sávban jövő vezető nem akadály (oldalt vagy előttünk igen)
    const pAlong = (player.x - c.x) * Math.sin(c.heading) + (player.z - c.z) * -Math.cos(c.heading)
    const pLat = Math.abs((player.x - c.x) * Math.cos(c.heading) + (player.z - c.z) * Math.sin(c.heading))
    const playerAhead = !(pAlong < -3 && pLat < 1.8)
    const playerNear = playerAhead && Math.hypot(player.x - c.x, player.z - c.z) < reach + 7
    for (let d = 1.5; d <= reach + 0.01; d += 2) {
      const s = Math.min(c.path.length, c.s + d)
      const p = pointAt(c.path.pts, c.path.cum, s)
      const mine = boxOf(p[0], p[1], pathHeading(c.path, s), CAR.length + growL, CAR.width + growW)
      if (playerNear && overlap(mine, boxOf(player.x, player.z, player.heading, CAR.length, CAR.width))) return -1
      // Ennyi idő múlva érnénk oda: a többiek akkori helyét is nézzük (az oldalról érkezőt is időben észrevesszük)
      const tAt = d / Math.max(2, c.v)
      for (const o of near) {
        // A mögöttünk lévő nem akadály
        if ((o.x - c.x) * Math.sin(c.heading) + (o.z - c.z) * -Math.cos(c.heading) < 0) continue
        if (overlap(mine, boxOf(o.x, o.z, o.heading, CAR.length, CAR.width))) return o.id
        if (exact || o.v < 0.5) continue
        const os = Math.min(o.path.length, o.s + o.v * tAt)
        const op = pointAt(o.path.pts, o.path.cum, os)
        if (overlap(mine, boxOf(op[0], op[1], pathHeading(o.path, os), CAR.length, CAR.width))) return o.id
      }
    }
    return null
  }

  /**
   * Körbeérő várakozás (A vár B-re, B C-re, C A-ra): ha már mindannyian állnak, a körben a legkorábban érkezett
   * elindulhat – de csak ha a pontos (ráhagyás nélküli) teste valóban elfér.
   */
  private resolveCycles(player: PlayerCar) {
    const byId = new Map(this.cars.map((c) => [c.id, c]))
    for (const c of this.cars) {
      const chain = [c.id]
      let x = c.blocker
      while (x !== null && x > 0 && chain.length < 8 && !chain.includes(x)) {
        chain.push(x)
        x = byId.get(x)?.blocker ?? null
      }
      if (x !== c.id || Math.min(...chain) !== c.id) continue
      if (chain.some((id) => (byId.get(id)?.v ?? 0) > 0.3)) continue
      // Ha a pontos teste elfér, mehet; ha 20 s után sem oldódik, a többi AI-autón átcsúszva is (a vezetőn soha)
      if (this.blockerOf(c, player, true) === null || (c.stuckFor > 20 && this.blockerOf(c, player, true) !== -1)) c.free = true
    }
  }

  private drive(c: AiCar, dt: number, player: PlayerCar, me: (Presence & { node: number }) | null) {
    const front = c.s + HALF_LEN
    const fx = Math.sin(c.heading)
    const fz = -Math.cos(c.heading)
    const [rx, rz] = rightOf(c.heading)

    // Az előttünk haladó (AI vagy a vezető): a sávunkban, előre néző kúpban
    let gap = Infinity
    let dv = 0
    const consider = (ox: number, oz: number, oh: number, ov: number) => {
      const dx = ox - c.x
      const dz = oz - c.z
      const along = dx * fx + dz * fz
      if (along <= 0 || along > 80) return
      const lat = Math.abs(dx * rx + dz * rz)
      const cos = Math.cos(wrapAngle(oh - c.heading))
      // Csak az azonos irányba haladó; a más irányú akadályokat a test-ütközés figyelése kezeli
      if (lat > 1.7 || cos < 0.3) return
      const g = along - CAR.length
      if (g < gap) {
        gap = g
        dv = c.v - ov * Math.max(0, cos)
      }
    }
    // Kölcsönös akadálynál (két autó egymásra vár) a korábban érkezett megy: ő nem veszi figyelembe a másikat
    const yieldsToMe = (o: AiCar) => c.free && c.blocker === o.id
    for (const o of this.cars) if (o !== c && !yieldsToMe(o)) consider(o.x, o.z, o.heading, o.v)
    consider(player.x, player.z, player.heading, player.speed)
    for (const p of this.peds) if (p.mode === 'cross') consider(p.x, p.z, c.heading, 0)

    // Megállási pontok: lámpa, STOP, elsőbbségadás, gyalogos a zebrán
    let stopGap = Infinity
    const stopAt = (lineS: number) => {
      stopGap = Math.min(stopGap, Math.max(0.1, lineS - front - 0.8))
    }
    const pj = c.path.junctions.find((x) => x.s + x.model.j.core > front)
    if (pj && front < pj.lineS + 0.5) {
      const d = pj.lineS - front
      const arm = pj.approach.arm
      let hold = false
      if (arm.control === 'signal' && arm.light !== undefined) {
        const st = lightState(this.world, this.world.lights[arm.light], this.t)
        if (st === 'red' || st === 'red_yellow') hold = true
        if (st === 'yellow' && d > (c.v * c.v) / 6 + c.v * 0.5) hold = true
      }
      if (arm.control === 'stop' && !c.stopped.has(pj.node)) {
        hold = true
        if (c.v < 0.2 && d < 3) c.stopped.add(pj.node)
      }
      if (!hold && d < 40) {
        // Elsőbbség és foglaltság: csak azok számítanak, akiknek a mozgása keresztezi a miénket
        const others: Mover[] = this.presencesAt(pj.node).filter((x) => x.car !== c)
        if (me && me.node === pj.node) others.push(me)
        const myself: Mover = { approach: pj.approach, movement: pj.movement, eta: d / Math.max(0.5, c.v), inside: false, waiting: c.v < 0.5 && d < 5 }
        const waited = c.waitSince === null ? 0 : this.t - c.waitSince
        // Nem hajt be, ha a kijárat után nincs hely (ne álljon meg a kereszteződés közepén)
        const exitS = pj.s + (pj.s - pj.lineS)
        let exitBlocked = false
        for (let k = 0; k <= 8 && !exitBlocked; k += 2) {
          const q = pointAt(c.path.pts, c.path.cum, Math.min(c.path.length, exitS + k))
          exitBlocked = this.cars.some((o) => o !== c && o.v < 2 && Math.hypot(o.x - q[0], o.z - q[1]) < 2.5)
        }
        if (exitBlocked || mustWait(pj.model, myself, others, YIELD_ETA, waited)) {
          c.waitSince ??= this.t
          hold = true
        } else c.waitSince = null
      }
      if (hold) stopAt(pj.lineS)
    }
    if (c.blocker !== null && !(c.blocker === -1 && c.free)) {
      const o = this.cars.find((x) => x.id === c.blocker)
      if (!o || !yieldsToMe(o)) stopGap = Math.min(stopGap, 0.5)
    }
    for (const cr of c.crossings) {
      if (cr.s < front - 1 || cr.s - front > 35) continue
      if (this.crossingBusy(cr.index, true)) stopAt(cr.s - 3.5)
    }

    // Kanyarban lassabban: az útvonal irányváltozása a következő 20 m-en
    const turn = Math.abs(wrapAngle(pathHeading(c.path, c.s + 20) - pathHeading(c.path, c.s + 2)))
    const v0 = turn > 1.0 ? Math.min(c.params.v0, 4.5) : turn > 0.5 ? Math.min(c.params.v0, 6.5) : c.params.v0
    const leadGap = Math.min(gap, stopGap)
    const leadDv = stopGap < gap ? c.v : dv
    const a = idmAccel({ ...c.params, v0 }, c.v, leadGap, leadDv)
    c.accel = Math.max(-9, a)
    c.v = Math.max(0, c.v + c.accel * dt)
    c.s += c.v * dt
    this.place(c)

    // Irányjelzés a következő kanyar előtt
    const next = c.path.junctions.find((x) => x.s > c.s - 6)
    c.blink = next && next.s - c.s < 45 && next.approach.turn !== 'straight' ? next.approach.turn : null
  }

  private place(c: AiCar) {
    const p = pointAt(c.path.pts, c.path.cum, c.s)
    c.x = p[0]
    c.z = p[1]
    c.heading = pathHeading(c.path, c.s)
  }

  private newCar(path: Path, s: number, directed: boolean): AiCar {
    const road = path.edges[0].road
    const v0 = Math.max(6, (road.maxspeed - 2 - this.rnd() * 6) / 3.6)
    const c: AiCar = {
      id: this.nextId++,
      path,
      s,
      v: Math.min(v0, 8 + this.rnd() * 4),
      accel: 0,
      params: { ...IDM_DEFAULT, v0, T: 1.1 + this.rnd() * 0.5 },
      color: COLORS[Math.floor(this.rnd() * COLORS.length)],
      x: 0,
      z: 0,
      heading: 0,
      blink: null,
      blocker: null,
      free: false,
      stuckFor: 0,
      stopped: new Set(),
      waitSince: null,
      crossings: crossingsAlong(this.world, path.pts, path.cum),
      directed,
    }
    this.place(c)
    return c
  }

  private freeAt(p: XZ, r = 15): boolean {
    return !this.cars.some((c) => Math.hypot(c.x - p[0], c.z - p[1]) < r)
  }

  private spawn(player: PlayerCar, pfx: number, pfz: number) {
    // Háttérforgalom: a vezetőtől 90–260 m-re, nem közvetlenül előtte (ne „teremjen” a szeme előtt)
    for (let tries = 0; tries < 3 && this.cars.filter((c) => !c.directed).length < this.opts.cars; tries++) {
      const road = this.world.roads[Math.floor(this.rnd() * this.world.roads.length)]
      const seg = Math.floor(this.rnd() * (road.pts.length - 1))
      const at = road.pts[seg]
      const dir: 1 | -1 = road.oneway !== 0 ? road.oneway : this.rnd() < 0.5 ? 1 : -1
      const from = dir === 1 ? road.nodes[seg] : road.nodes[seg + 1]
      const edge = (this.graph.out.get(from) ?? []).find((e) => e.road === road && e.seg === seg && e.dir === dir)
      if (!edge || edge.len < 8 || !this.freeAt(at, 20)) continue
      const edges = randomWalk(this.graph, edge, 250 + this.rnd() * 350, this.rnd)
      const path = buildPath(this.graph, edges, this.models)
      // Az út közepén jelenik meg, nem kereszteződésben; a tényleges helyén mérve messze a vezetőtől és nem a szeme előtt
      const s0 = Math.min(edge.len / 2, 12)
      const p0 = pointAt(path.pts, path.cum, s0)
      const d = Math.hypot(p0[0] - player.x, p0[1] - player.z)
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue
      if (((p0[0] - player.x) * pfx + (p0[1] - player.z) * pfz) / d > 0.5 && d < 160) continue
      if (this.index.junctionAt(p0, 4) || !this.freeAt(p0, 20)) continue
      this.cars.push(this.newCar(path, s0, false))
    }
    // Háttér-gyalogosok a járdán
    for (let tries = 0; tries < 3 && this.peds.filter((p) => p.crossing === undefined).length < this.opts.peds; tries++) {
      const pc = this.world.pavements[Math.floor(this.rnd() * this.world.pavements.length)]
      const c: XZ = [(pc.quad[0][0] + pc.quad[2][0]) / 2, (pc.quad[0][1] + pc.quad[2][1]) / 2]
      const d = Math.hypot(c[0] - player.x, c[1] - player.z)
      if (d < 25 || d > 160) continue
      const dirSign = this.rnd() < 0.5 ? 1 : -1
      const h = Math.atan2(pc.kerb[1][0] - pc.kerb[0][0], -(pc.kerb[1][1] - pc.kerb[0][1])) + (dirSign === 1 ? 0 : Math.PI)
      this.peds.push({ id: this.nextId++, x: c[0], z: c[1], heading: h, v: 1.15 + this.rnd() * 0.4, mode: 'walk', model: Math.floor(this.rnd() * 5) })
    }
    if (this.opts.directors) this.direct(player)
  }

  /** Időzített találkozások a vezető útvonalán: jármű a kereszteződésben, gyalogos a zebrán */
  private direct(player: PlayerCar) {
    const v = Math.max(5, player.speed)
    for (const p of this.passes) {
      const d = p.s - this.playerS
      const key = `${p.node}@${Math.round(p.s)}`
      if (d < 70 || d > 140 || this.directedNodes.has(key)) continue
      this.directedNodes.add(key)
      if (this.rnd() > (this.opts.carChance ?? 0.5)) continue
      const m = this.models.get(p.node)!
      const arms = m.arms.filter((a) => a !== p.approach.arm && a.canApproach && a.road.length > 20)
      if (!arms.length) continue
      const arm = arms[Math.floor(this.rnd() * arms.length)]
      const vAi = Math.min(arm.road.maxspeed - 5, 40) / 3.6
      const eta = d / v + (this.rnd() * 2 - 1)
      const dBefore = Math.max(25, vAi * eta)
      const into = (this.graph.in.get(p.node) ?? []).find((e) => e.road === arm.road && e.dir === arm.dir)
      if (!into) continue
      const back = walkBack(this.graph, into, dBefore + 10)
      const outs = (this.graph.out.get(p.node) ?? []).filter((e) => e.to !== into.from)
      if (!outs.length) continue
      const first = outs[Math.floor(this.rnd() * outs.length)]
      const forward: GraphEdge[] = randomWalk(this.graph, first, 220, this.rnd)
      const path = buildPath(this.graph, [...back, ...forward], this.models)
      const pj = path.junctions.find((x) => x.node === p.node)
      if (!pj) continue
      const s = Math.max(0, pj.s - dBefore)
      const at = pointAt(path.pts, path.cum, s)
      if (!this.freeAt(at, 12)) continue
      const car = this.newCar(path, s, true)
      car.v = vAi
      this.cars.push(car)
    }
    // Gyalogos a zebránál: lelép, amikor a vezető még kényelmesen meg tud állni
    for (const rc of this.routeCrossings) {
      const d = rc.s - this.playerS
      if (d < 50 || d > 90 || this.directedCrossings.has(rc.index)) continue
      this.directedCrossings.add(rc.index)
      if (this.rnd() > (this.opts.pedChance ?? 0.6)) continue
      const cr = this.world.crossings[rc.index]
      const side = this.rnd() < 0.5 ? 1 : -1
      const [rx, rz] = rightOf(cr.heading)
      const from: XZ = [cr.at[0] + rx * side * (cr.halfWidth + 1.2), cr.at[1] + rz * side * (cr.halfWidth + 1.2)]
      const to: XZ = [cr.at[0] - rx * side * (cr.halfWidth + 1.2), cr.at[1] - rz * side * (cr.halfWidth + 1.2)]
      const stepAt = (v * v) / 5 + v * 1.0 + 12
      this.peds.push({
        id: this.nextId++,
        x: from[0],
        z: from[1],
        heading: Math.atan2(to[0] - from[0], -(to[1] - from[1])),
        v: 1.3,
        mode: 'wait',
        model: Math.floor(this.rnd() * 5),
        crossing: rc.index,
        target: to,
        stepAt,
      })
    }
  }

  // ---------------------------------------------------------------- gyalogosok

  private walk(p: Ped, dt: number) {
    if (p.mode === 'walk') {
      const [fx, fz] = forwardOf(p.heading)
      const nx = p.x + fx * p.v * dt
      const nz = p.z + fz * p.v * dt
      // A járda végén megfordul
      if (!this.index.onPavement([nx + fx * 0.8, nz + fz * 0.8])) p.heading += Math.PI
      else {
        p.x = nx
        p.z = nz
      }
      return
    }
    if (p.crossing === undefined || !p.target) return
    const cr = this.world.crossings[p.crossing]
    if (p.mode === 'wait') {
      // Rendezett gyalogos: a vezető közeledésére lép le; különben ha biztonságos rés van
      const dPlayer = this.routeCrossings.find((x) => x.index === p.crossing)!.s - this.playerS
      const ready = p.stepAt === undefined || (dPlayer > 0 && dPlayer < p.stepAt)
      if (!ready) return
      // Nem lép le közvetlenül egy AI autó elé (a vezetőnek viszont meg kell állnia)
      const danger = this.cars.some((c) => {
        const d = Math.hypot(c.x - cr.at[0], c.z - cr.at[1])
        return d < 30 && d / Math.max(0.5, c.v) < 2.5
      })
      if (danger) return
      p.mode = 'cross'
      p.stepAt = undefined
    }
    const dx = p.target[0] - p.x
    const dz = p.target[1] - p.z
    const d = Math.hypot(dx, dz)
    if (d < 0.2) {
      p.mode = 'walk'
      p.crossing = undefined
      p.target = undefined
      p.heading = cr.heading + (this.rnd() < 0.5 ? 0 : Math.PI)
      return
    }
    p.heading = Math.atan2(dx, -dz)
    const nx = p.x + (dx / d) * Math.min(d, p.v * dt)
    const nz = p.z + (dz / d) * Math.min(d, p.v * dt)
    // Járműnek nem megy neki: ha az útjában áll egy autó (a zebrán), megvárja
    const ahead = boxOf(nx + (dx / d) * 0.4, nz + (dz / d) * 0.4, p.heading, 0.6, 0.6)
    const inWay = (x: number, z: number, h: number) => Math.hypot(x - nx, z - nz) < 4 && overlap(ahead, boxOf(x, z, h, CAR.length, CAR.width))
    if (this.cars.some((c) => inWay(c.x, c.z, c.heading)) || (this.lastPlayer && inWay(this.lastPlayer.x, this.lastPlayer.z, this.lastPlayer.heading))) return
    p.x = nx
    p.z = nz
  }
}

/** Egy vonal mentén lévő zebrák (s) – a vonal a zebrán áthalad, nagyjából merőlegesen */
function crossingsAlong(world: World, pts: XZ[], cum: number[]): Array<{ s: number; index: number }> {
  const out: Array<{ s: number; index: number }> = []
  world.crossings.forEach((cr, index) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const h = projectOnSegment(cr.at, pts[i], pts[i + 1])
      if (h.dist > cr.halfWidth + 0.5) continue
      const segH = Math.atan2(pts[i + 1][0] - pts[i][0], -(pts[i + 1][1] - pts[i][1]))
      if (Math.abs(Math.cos(wrapAngle(segH - cr.heading))) < 0.7) continue
      out.push({ s: cum[i] + h.t * (cum[i + 1] - cum[i]), index })
      return
    }
  })
  return out.sort((a, b) => a.s - b.s)
}
