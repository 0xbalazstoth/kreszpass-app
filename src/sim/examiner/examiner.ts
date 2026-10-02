import { CAR } from '../../domain/maneuvers/geometry'
import type { Look } from '../../domain/maneuvers/types'
import type { SimState } from '../sim'
import { conflict, mustYield, relativeSide, type Movement } from '../traffic/junctions'
import type { TrafficSystem } from '../traffic/traffic'
import { CENTER_F } from '../vehicle'
import { dividerOf, halfWidthAt } from '../world/lanes'
import { lightState } from '../world/lights'
import { forwardOf, rightOf } from '../world/polyline'
import { wrapAngle, type XZ } from '../world/project'
import type { RoadIndex } from '../world/roadIndex'
import type { World } from '../world/types'
import { ANNOUNCE_M, type Instruction } from './navigation'
import { buildRoadGraph, findDetour, onDetour, type Detour, type RoadGraph } from './reroute'
import { startProgress, trackRoute, type RouteProgress } from './route'
import { ordinalWord } from '../../domain/examiner'

/**
 * A vizsgabiztos: vezetés közben figyeli a szabályokat, és a minősítő lap kódjaival jegyzi a hibákat.
 * Minden hibához rövid, magyar nyelvű magyarázat tartozik (gyakorló módban azonnal megjelenik, vizsgán a végén).
 */

export interface Fault {
  code: string
  /** A vezetés ideje (s) */
  t: number
  at: XZ
  /** Az útvonalon mért helye (m) */
  s: number
  note: string
}

export type ExamEnd = { kind: 'finished' } | { kind: 'failed'; reason: string }

/** A következő manőver a műszerfal útbaigazító paneljéhez */
export interface Guidance {
  kind: 'left' | 'right' | 'straight' | 'roundabout' | 'finish' | 'follow'
  /** Távolság a manőverig (m) */
  distance: number
  street?: string
  exit?: number
  /** Kerülő: rossz irányba fordult, vissza az útvonalra */
  detour: boolean
}

/** Ennyivel a kanyar előtt hangzik el a rövid emlékeztető (m) */
const REMIND_M = 35
/** Ennél messzebbi manővernél a panel csak azt mutatja: kövesse az utat */
const FOLLOW_M = 600

/** Gyorshajtásnak számít e fölött (km/h); a mérési pontatlanság és a pillanatnyi túllépés miatt */
const SPEED_TOLERANCE = 5
/** Kanyarodás előtt legalább ennyivel kell jelezni (m) */
const INDICATE_BEFORE_M = 25
/** A tükörbe nézés ennyivel az irányjelzés előtt is számít (s) */
const MIRROR_WINDOW_S = 8
/** Elindulás előtt ennyi időn belül kell körülnézni (s) */
const START_WINDOW_S = 15
/** Ennél hosszabb ideig feleslegesen bekapcsolva hagyott index megtévesztő (s) */
const STALE_INDICATOR_S = 20

const MIRRORS_FOR: Record<'left' | 'right', Look[]> = {
  left: ['mirror_left', 'mirror_inner', 'shoulder_left'],
  right: ['mirror_right', 'mirror_inner', 'shoulder_right'],
}

export class Examiner {
  readonly world: World
  readonly index: RoadIndex
  readonly instructions: Instruction[]
  faults: Fault[] = []
  /** Élő forgalom: elsőbbség, gyalogosok, követési távolság */
  traffic: TrafficSystem | null = null
  progress: RouteProgress = startProgress()
  /** Az éppen érvényes utasítás (kiírva és felolvasva); `untilS`: az útvonal e pontjáig marad kint */
  message: { text: string; t: number; untilS?: number } | null = null
  end: ExamEnd | null = null

  private announced = new Set<number>()
  private reminded = new Set<number>()
  private graph: RoadGraph | null = null
  private detour: Detour | null = null
  private detourT = -100
  private detourSaid = new Set<number>()
  private where: { at: XZ; heading: number } = { at: [0, 0], heading: 0 }
  private checkedTurns = new Set<number>()
  /** Az előző kanyar ellenőrzésének ideje: az irányjelzést ettől kezdve keressük */
  private lastTurnT = 0
  private looks: Array<{ t: number; look: Look }> = []
  private lastLook: Look = 'ahead'
  private indicators: Array<{ t: number; s: number; dir: 'left' | 'right' | null }> = []
  private movedOff = false
  private speeding: { since: number | null; flagged: boolean } = { since: null, flagged: false }
  private prevAlong = new Map<string, number>()
  private stopMin = new Map<number, number>()
  private yellowAt = new Map<number, { along: number; v: number }>()
  private wasYellow = new Set<number>()
  private inRing = false
  private ringLeftT = -1
  private wrongSide: { since: number | null; lastT: number } = { since: null, lastT: -100 }
  private wrongWay = new Set<number>()
  private wrongWayRoad = -1
  private wrongWayM = 0
  private staleFlagged = false
  private seenEvents = 0
  private lastStep = 0
  private stoppedSince: number | null = null
  private passChecked = new Set<number>()
  private crossingChecked = new Set<number>()
  private tailgate = { since: null as number | null, lastT: -100 }
  private onSay?: (text: string) => void

  constructor(world: World, index: RoadIndex, instructions: Instruction[], onSay?: (text: string) => void) {
    this.world = world
    this.index = index
    this.instructions = instructions
    this.onSay = onSay
    this.say('Kérem, induljon el, ha biztonságos.', 0)
  }

  private say(text: string, t: number, untilS?: number) {
    this.message = { text, t, untilS }
    this.onSay?.(text)
  }

  /** Az útbaigazító panel tartalma: a következő manőver és a távolsága (letérés után a kerülő) */
  guidance(): Guidance {
    const ps = this.progress.s
    if (this.detour && this.progress.offFor > 2) {
      const pos = onDetour(this.detour, this.where.at).s
      const turn = this.detour.turns.find((x) => x.s > pos - 2)
      if (turn) return { kind: turn.dir, distance: Math.max(0, turn.s - pos), detour: true }
      return { kind: 'follow', distance: Math.max(0, this.detour.cum[this.detour.cum.length - 1] - pos), detour: true }
    }
    const next = this.instructions.find((x) => x.s > ps - 3)
    if (!next) return { kind: 'finish', distance: 0, detour: false }
    const distance = Math.max(0, next.s - ps)
    if (distance > FOLLOW_M && next.kind !== 'finish') return { kind: 'follow', distance, detour: false }
    const kind = next.kind === 'turn' ? (next.dir ?? 'straight') : next.kind
    return { kind, distance, street: next.street, exit: next.exit, detour: false }
  }

  private fault(code: string, note: string, t: number, at: XZ) {
    this.faults.push({ code, note, t, at, s: this.progress.s })
  }

  private lookedRecently(kinds: Look[], from: number, to: number): boolean {
    return this.looks.some((l) => l.t >= from && l.t <= to && kinds.includes(l.look))
  }

  /** Az irányjelző állapota egy korábbi pillanatban */
  private indicatorAt(t: number): 'left' | 'right' | null {
    let dir: 'left' | 'right' | null = null
    for (const e of this.indicators) {
      if (e.t > t) break
      dir = e.dir
    }
    return dir
  }

  update(s: SimState): void {
    if (this.end) return
    const dt = s.t - this.lastStep
    this.lastStep = s.t
    const c = s.car
    const t = s.t
    const kmh = Math.abs(c.speed) * 3.6
    const centre: XZ = [c.x + Math.sin(c.heading) * CENTER_F, c.z - Math.cos(c.heading) * CENTER_F]
    const front: XZ = [c.x + Math.sin(c.heading) * CAR.front, c.z - Math.cos(c.heading) * CAR.front]
    this.progress = trackRoute(this.world.route, this.progress, centre, c.heading, dt)
    const ps = this.progress.s
    this.where = { at: centre, heading: c.heading }

    // Napló: nézés és irányjelzés változásai
    if (s.look !== this.lastLook && s.look !== 'ahead') this.looks.push({ t, look: s.look })
    this.lastLook = s.look
    const curInd = c.hazard ? null : c.indicator
    if (this.indicators[this.indicators.length - 1]?.dir !== curInd && !(this.indicators.length === 0 && curInd === null))
      this.indicators.push({ t, s: ps, dir: curInd })

    // ---------------------------------------------------------------- útbaigazítás
    const onRoute = this.progress.offFor <= 2
    // Mindig csak a soron következő (még előttünk lévő) utasítás hangzik el: a későbbi nem írja felül
    const nextIdx = this.instructions.findIndex((x) => x.s > ps - 5)
    for (const [i, ins] of this.instructions.entries()) {
      if (!onRoute) break
      if (i > nextIdx && nextIdx >= 0) break
      if (this.announced.has(i) || ps < ins.s - ANNOUNCE_M) continue
      if (ins.s < ps - 10) {
        this.announced.add(i)
        continue
      }
      this.announced.add(i)
      this.say(ins.text, t, ins.s)
      break
    }
    // Rövid emlékeztető közvetlenül a kanyar előtt
    for (const [i, ins] of this.instructions.entries()) {
      if (!onRoute || this.reminded.has(i) || (ins.kind !== 'turn' && ins.kind !== 'roundabout')) continue
      if (ps < ins.s - REMIND_M || ins.s < ps - 5) continue
      this.reminded.add(i)
      if (ins.kind === 'turn') this.say(ins.dir === 'left' ? 'Itt forduljon balra.' : 'Itt forduljon jobbra.', t, ins.s)
      else if (ins.exit) this.say(`A körforgalomban a ${ordinalWord(ins.exit)} kijáraton hajtson ki.`, t, ins.s + 40)
      break
    }

    // ---------------------------------------------------------------- letérés: kerülő vissza az útvonalra
    if (onRoute) {
      this.detour = null
      this.detourSaid.clear()
    } else {
      const off = this.detour ? onDetour(this.detour, centre).off : Infinity
      if (off > 12 && t - this.detourT > 2) {
        this.graph ??= buildRoadGraph(this.world)
        const was = this.detour
        this.detour = findDetour(this.world, this.graph, this.index, centre, c.heading, ps)
        this.detourT = t
        this.detourSaid.clear()
        if (!was)
          this.say(
            this.detour ? 'Letért az útvonalról. Kövesse az útbaigazítást vissza az útvonalra.' : 'Letért az útvonalról. Forduljon vissza, ha biztonságos.',
            t,
          )
      }
      if (this.detour) {
        const pos = onDetour(this.detour, centre).s
        this.detour.turns.forEach((x, i) => {
          if (this.detourSaid.has(i) || x.s - pos > 70 || x.s < pos) return
          this.detourSaid.add(i)
          this.say(`A következő kereszteződésnél forduljon ${x.dir === 'left' ? 'balra' : 'jobbra'}.`, t)
        })
      }
    }

    // ---------------------------------------------------------------- események (szegély, padka, ütközés)
    for (const e of s.events.slice(this.seenEvents)) {
      if (e.kind === 'kerb') this.fault('8/19', 'Felhajtott a járdaszegélyre.', e.t, e.at)
      if (e.kind === 'offroad') this.fault('8/19', 'Letért az úttestről (padkára, füves részre).', e.t, e.at)
      if (e.kind === 'crash') {
        const what = e.what === 'vehicle' ? 'Nekiütközött egy járműnek' : e.what === 'pedestrian' ? 'Elütött egy gyalogost' : 'Nekiütközött egy épületnek'
        this.fault('8/3', `${what}: balesetet okozott.`, e.t, e.at)
        this.end = { kind: 'failed', reason: e.what === 'pedestrian' ? 'Gázolás' : 'Ütközés' }
      }
    }
    this.seenEvents = s.events.length

    // ---------------------------------------------------------------- elindulás
    if (!this.movedOff && kmh > 3) {
      this.movedOff = true
      const ind = this.indicatorAt(t) ?? this.indicators.filter((e) => e.t > t - 5).map((e) => e.dir)[0]
      if (ind !== 'left') this.fault('8/6', 'Elinduláskor (a járda mellől kihúzódva) nem adott balra irányjelzést.', t, centre)
      const mirror = this.lookedRecently(['mirror_left'], t - START_WINDOW_S, t)
      const shoulder = this.lookedRecently(['shoulder_left'], t - START_WINDOW_S, t)
      if (!mirror && !shoulder) this.fault('8/6', 'Elindulás előtt nem nézett körül: a bal tükör és a bal váll fölötti hátranézés kötelező.', t, centre)
      else if (!shoulder) this.fault('4/5', 'Elindulás előtt nem nézett hátra a bal válla fölött: a holttérben (a tükörben nem látható helyen) is jöhet valaki.', t, centre)
      else if (!mirror) this.fault('4/5', 'Elindulás előtt nem nézett a bal tükörbe.', t, centre)
    }

    // ---------------------------------------------------------------- az út, amelyen haladunk
    const hit = this.index.nearest(centre)
    const onRoad = hit && hit.dist <= halfWidthAt(hit.road, hit.s) + 1 ? hit : null
    const inJunction = this.index.junctionAt(centre, 1) !== null

    // Gyorshajtás
    const limit = onRoad?.road.maxspeed ?? 50
    if (kmh > limit + SPEED_TOLERANCE) {
      this.speeding.since ??= t
      if (!this.speeding.flagged && t - this.speeding.since > 1.5) {
        this.speeding.flagged = true
        this.fault('8/16', `Gyorshajtás: ${Math.round(kmh)} km/h a megengedett ${limit} km/h helyett.`, t, centre)
      }
    } else if (kmh <= limit) this.speeding = { since: null, flagged: false }

    // Bal oldal, egyirányú út szemben
    // Csak ha valóban az úton halad (nem keresztezi, pl. osztott pályás út átszelésekor), és egyértelműen rajta van
    const alongRoad = onRoad && Math.abs(Math.cos(wrapAngle(c.heading - onRoad.heading))) > 0.82 && onRoad.dist < halfWidthAt(onRoad.road, onRoad.s) - 0.3
    if (onRoad && alongRoad && !inJunction && kmh > 3) {
      const r = onRoad.road
      const aligned = Math.cos(wrapAngle(c.heading - onRoad.heading)) >= 0
      if ((r.oneway === 1 && !aligned) || (r.oneway === -1 && aligned)) {
        // Legalább 12 m-t haladt rajta szemben (egy kereszteződés sarkának átszelése még nem behajtás)
        this.wrongWayM = this.wrongWayRoad === r.id ? this.wrongWayM + Math.abs(c.speed) * dt : 0
        this.wrongWayRoad = r.id
        if (this.wrongWayM > 12 && !this.wrongWay.has(r.id)) {
          this.wrongWay.add(r.id)
          this.fault('8/26', 'Behajtott az egyirányú útra a menetiránnyal szemben.', t, centre)
        }
      } else if (r.lanesFwd > 0 && r.lanesBack > 0) {
        // A felezővonal a haladási irányunk szerint (balra tőle a szembejövők sávjai)
        const lat = aligned ? onRoad.lateral : -onRoad.lateral
        const divider = aligned ? dividerOf(r) : -dividerOf(r)
        if (lat < divider - 0.6) {
          this.wrongSide.since ??= t
          if (t - this.wrongSide.since > 1.2 && t - this.wrongSide.lastT > 10) {
            this.wrongSide.lastT = t
            this.fault('8/21', 'A menetirány szerinti bal oldalon (a felezővonalon túl) haladt.', t, centre)
          }
        } else this.wrongSide.since = null
      }
    }

    // ---------------------------------------------------------------- STOP tábla
    this.world.stops.forEach((st, i) => {
      if (st.kind !== 'stop') return
      const d = Math.hypot(front[0] - st.at[0], front[1] - st.at[1])
      if (d > 40) {
        this.stopMin.delete(i)
        this.prevAlong.delete(`s${i}`)
        return
      }
      const [fx, fz] = forwardOf(st.heading)
      const [rx, rz] = rightOf(st.heading)
      const along = (front[0] - st.at[0]) * fx + (front[1] - st.at[1]) * fz
      const lat = (front[0] - st.at[0]) * rx + (front[1] - st.at[1]) * rz
      const facing = Math.abs(wrapAngle(c.heading - st.heading)) < 0.9
      if (!facing || Math.abs(lat) > st.halfSpan + 1.5) return
      if (along > -15 && along < 0.5) this.stopMin.set(i, Math.min(this.stopMin.get(i) ?? Infinity, kmh))
      const prev = this.prevAlong.get(`s${i}`)
      this.prevAlong.set(`s${i}`, along)
      if (prev !== undefined && prev < 0.3 && along >= 0.3 && (this.stopMin.get(i) ?? Infinity) > 1)
        this.fault('8/26', 'A STOP táblánál nem állt meg teljesen a megállási vonal előtt.', t, st.at)
    })

    // ---------------------------------------------------------------- jelzőlámpa
    this.world.lights.forEach((l, i) => {
      if (l.repeater) return
      const d = Math.hypot(front[0] - l.stopAt[0], front[1] - l.stopAt[1])
      if (d > 70) {
        this.prevAlong.delete(`l${i}`)
        this.yellowAt.delete(i)
        this.wasYellow.delete(i)
        return
      }
      const [fx, fz] = forwardOf(l.heading)
      const [rx, rz] = rightOf(l.heading)
      const along = (front[0] - l.stopAt[0]) * fx + (front[1] - l.stopAt[1]) * fz
      const lat = (front[0] - l.stopAt[0]) * rx + (front[1] - l.stopAt[1]) * rz
      if (Math.abs(wrapAngle(c.heading - l.heading)) > 0.9 || Math.abs(lat) > 6) return
      const state = lightState(this.world, l, t)
      // A sárga kezdetén: meg tudott volna-e állni kényelmesen (4 m/s², 0,8 s reakcióidő)
      if (state === 'yellow' && !this.wasYellow.has(i) && along < 0) this.yellowAt.set(i, { along, v: Math.abs(c.speed) })
      if (state === 'yellow') this.wasYellow.add(i)
      else this.wasYellow.delete(i)
      const prev = this.prevAlong.get(`l${i}`)
      this.prevAlong.set(`l${i}`, along)
      if (prev === undefined || !(prev < 0 && along >= 0)) return
      if (state === 'red' || state === 'red_yellow') this.fault('8/26', 'Tilos (piros) jelzésen hajtott át.', t, l.stopAt)
      else if (state === 'yellow') {
        const y = this.yellowAt.get(i)
        if (y && -y.along > (y.v * y.v) / (2 * 4) + y.v * 0.8 + 2)
          this.fault('8/26', 'Sárga jelzésnél áthajtott, pedig biztonságosan meg tudott volna állni.', t, l.stopAt)
      }
    })

    // ---------------------------------------------------------------- kanyarodás: irányjelzés és körültekintés
    for (const [i, ins] of this.instructions.entries()) {
      if (ins.kind !== 'turn' || this.checkedTurns.has(i) || !ins.dir) continue
      if (ps < ins.s - 3 || ps > ins.s + 40) continue
      if (Math.hypot(centre[0] - ins.at[0], centre[1] - ins.at[1]) > 14) continue
      this.checkedTurns.add(i)
      const want = ins.dir
      // Közvetlenül egymás utáni kanyaroknál az előző kanyar után már nem lehet 25 m-rel előre jelezni
      const prevTurn = this.instructions.slice(0, i).filter((x) => x.kind === 'turn').pop()
      let lead = prevTurn ? Math.min(INDICATE_BEFORE_M, Math.max(3, ins.s - prevTurn.s - 8)) : INDICATE_BEFORE_M
      // Közvetlenül az indulás után következő kanyarnál sincs 25 m
      lead = Math.min(lead, Math.max(3, ins.s - 12))
      // Az irányjelzés első bekapcsolása erre a kanyarra (ha közben magától kikapcsolt és újra bekapcsolta, az első számít)
      const from = Math.max(this.lastTurnT, t - 45)
      // Ha már az ablak előtt is ebbe az irányba jelzett (pl. két közeli kanyarnál), az akkori bekapcsolás számít
      const before = this.indicatorAt(from) === want ? [...this.indicators].reverse().find((e) => e.dir === want && e.t <= from) : undefined
      const on = before ?? this.indicators.find((e) => e.dir === want && e.t >= from && e.t <= t)
      this.lastTurnT = t
      const nowDir = this.indicatorAt(t)
      if (nowDir && nowDir !== want) this.fault('8/30', `Rossz irányba indexelt: ${want === 'left' ? 'balra' : 'jobbra'} kellett volna.`, t, ins.at)
      else if (!on || (nowDir !== want && t - on.t > 6)) this.fault('8/6', `Kanyarodás előtt nem adott irányjelzést (${want === 'left' ? 'balra' : 'jobbra'}).`, t, ins.at)
      else if (on.s > ins.s - lead && ins.s - (prevTurn?.s ?? 0) > 40) this.fault('6/8', 'Későn adott irányjelzést: a kanyarodás előtt időben (kb. 30 m-rel) kell jelezni.', t, ins.at)
      if (on && !this.lookedRecently(MIRRORS_FOR[want], on.t - MIRROR_WINDOW_S, t))
        this.fault('4/5', `Kanyarodás előtt nem nézett a ${want === 'left' ? 'bal' : 'jobb'} (vagy a belső) tükörbe.`, t, ins.at)
    }

    // ---------------------------------------------------------------- körforgalom: behajtáskor nem, kihajtáskor jobbra jelez
    const ringNow = !!onRoad?.road.roundabout
    if (ringNow && !this.inRing && this.indicatorAt(t) === 'left') this.fault('8/30', 'Körforgalomba behajtáskor balra indexelt (behajtáskor nem kell jelezni).', t, centre)
    if (!ringNow && this.inRing) this.ringLeftT = t
    if (this.ringLeftT > 0 && t - this.ringLeftT > 0.3) {
      const recent = this.indicators.some((e) => e.dir === 'right' && e.t > this.ringLeftT - 6) || this.indicatorAt(this.ringLeftT) === 'right'
      if (!recent) this.fault('8/6', 'A körforgalomból kihajtáskor nem jelzett jobbra.', t, centre)
      this.ringLeftT = -1
    }
    this.inRing = ringNow

    // ---------------------------------------------------------------- forgalom: elsőbbség, gyalogos, követési távolság
    const tr = this.traffic
    if (tr) {
      tr.setPlayerProgress(ps)
      if (onRoute) {
        // Elsőbbség: a megállási vonalon áthaladva senki, akinek elsőbbsége van, ne legyen bent vagy 3 s-en belül
        tr.passes.forEach((p, i) => {
          if (this.passChecked.has(i)) return
          const m = tr.models.get(p.node)
          if (!m) return
          const line = p.s - (m.j.core + 2)
          if (ps + 2.2 < line || ps > p.s + m.j.core) return
          this.passChecked.add(i)
          // Csak akinek a mozgása keresztezi a miénket, és elsőbbsége van (vagy már bent van a kereszteződésben)
          const crosses = (mv: Movement | null) => !p.movement || !mv || conflict(m, p.movement, mv)
          const others = tr
            .presencesAt(p.node)
            .filter((o) => crosses(o.movement) && mustYield(p.approach, o.approach) && (o.inside || o.eta < 3) && !(o.waiting && mustYield(o.approach, p.approach)))
          if (!others.length) return
          const side = relativeSide(p.approach.arm, others[0].approach.arm)
          const who =
            others[0].approach.arm.control === 'ring'
              ? 'a körforgalomban haladó járműnek'
              : others[0].approach.arm.control === 'priority' && p.approach.arm.control !== 'priority'
                ? 'a főúton érkező járműnek'
                : side === 'oncoming'
                  ? 'a szemből érkező járműnek (balra kanyarodáskor)'
                  : side === 'right'
                    ? 'a jobbról érkező járműnek'
                    : 'a kereszteződésben lévő járműnek'
          this.fault('8/24', `Nem adott elsőbbséget ${who}.`, t, m.j.at)
        })
        // Gyalogos a zebrán: a zebrán áthaladva ne legyen rajta gyalogos a mi oldalunk közelében
        for (const rc of tr.routeCrossings) {
          if (this.crossingChecked.has(rc.index) || ps + 2.2 < rc.s || ps > rc.s + 6) continue
          this.crossingChecked.add(rc.index)
          const cr = this.world.crossings[rc.index]
          const [rx, rz] = rightOf(cr.heading)
          const myLat = (centre[0] - cr.at[0]) * rx + (centre[1] - cr.at[1]) * rz
          const ped = tr.peds.find((p) => p.crossing === rc.index && p.mode === 'cross' && Math.abs((p.x - cr.at[0]) * rx + (p.z - cr.at[1]) * rz - myLat) < 4)
          if (ped) this.fault('8/27', 'Nem adott elsőbbséget a zebrán áthaladó gyalogosnak.', t, cr.at)
        }
      }
      // Követési távolság: 0,8 s-nál kisebb időköz 20 km/h fölött, 2 s-nál tovább
      const [fx, fz] = forwardOf(c.heading)
      const [rx, rz] = rightOf(c.heading)
      let gap = Infinity
      for (const o of tr.cars) {
        const along = (o.x - centre[0]) * fx + (o.z - centre[1]) * fz
        const lat = Math.abs((o.x - centre[0]) * rx + (o.z - centre[1]) * rz)
        if (along > 0 && along < 60 && lat < 1.5 && Math.cos(wrapAngle(o.heading - c.heading)) > 0.7) gap = Math.min(gap, along - CAR.length)
      }
      const v = Math.abs(c.speed)
      if (v > 5.5 && gap / v < 0.8) {
        this.tailgate.since ??= t
        if (t - this.tailgate.since > 2 && t - this.tailgate.lastT > 20) {
          this.tailgate.lastT = t
          this.fault('5/6', `Túl közel követte az előtte haladót (kb. ${(gap / v).toFixed(1)} s; legalább 1–2 s kell).`, t, centre)
        }
      } else this.tailgate.since = null
    }

    // ---------------------------------------------------------------- feleslegesen bekapcsolva hagyott irányjelző
    const lastInd = this.indicators[this.indicators.length - 1]
    if (lastInd?.dir && kmh > 10 && t - lastInd.t > STALE_INDICATOR_S && !this.staleFlagged) {
      const turnAhead = this.instructions.some((x) => x.s > ps - 30 && x.s - ps < (x.kind === 'finish' ? 160 : 100))
      if (!turnAhead) {
        this.staleFlagged = true
        this.fault('8/30', 'Az irányjelző feleslegesen bekapcsolva maradt (megtévesztő jelzés).', t, centre)
      }
    }
    if (!lastInd?.dir) this.staleFlagged = false

    // ---------------------------------------------------------------- megállás a végén
    const nearEnd = ps > this.world.route.length - 70
    if (kmh < 0.5) this.stoppedSince ??= t
    else this.stoppedSince = null
    if (nearEnd && this.stoppedSince !== null && c.handbrake) {
      const signalled = this.indicatorAt(t) === 'right' || this.indicators.some((e) => e.dir === 'right' && e.t > t - 25)
      if (!signalled) this.fault('8/6', 'Megálláskor (a járda mellé húzódva) nem jelzett jobbra.', t, centre)
      if (onRoad) {
        const aligned = Math.cos(wrapAngle(c.heading - onRoad.heading)) >= 0
        const lat = aligned ? onRoad.lateral : -onRoad.lateral
        const gap = halfWidthAt(onRoad.road, onRoad.s) - (lat + CAR.width / 2)
        if (gap > 0.8) this.fault('5/4', `Nem a járda mellett állt meg (kb. ${gap.toFixed(1)} m-re a szegélytől).`, t, centre)
      }
      this.end = { kind: 'finished' }
      this.say('Köszönöm, a vizsga véget ért.', t)
    }
    if (nearEnd && this.stoppedSince !== null && !c.handbrake && t - this.stoppedSince > 6 && (!this.message || t - this.message.t > 10))
      this.say('Rögzítse a járművet a kézifékkel.', t)
  }

  /** A vezetés eredménye: van-e a 8. blokkból (sikertelenséget okozó) hiba */
  get failed(): boolean {
    return this.faults.some((f) => f.code.startsWith('8/'))
  }
}
