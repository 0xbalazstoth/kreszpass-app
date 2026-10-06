import { CAR } from '../domain/maneuvers/geometry'
import type { Look } from '../domain/maneuvers/types'
import type { Instruction } from './examiner/navigation'
import { boxOf, overlap } from './sim'
import { buildJunctionModels, mustWait, routeJunctionPasses, type Mover } from './traffic/junctions'
import type { TrafficSystem } from './traffic/traffic'
import type { SimAction, SimState } from './sim'
import { CENTER_F, steerLimit, type Controls } from './vehicle'
import { stopBack } from './world/junctionArms'
import { halfWidthAt, rightLaneCentre } from './world/lanes'
import { lightState, yellowLeft } from './world/lights'
import { headingAt, pointAt, rightOf } from './world/polyline'
import { projectOnSegment, wrapAngle, type XZ } from './world/project'
import type { RoadIndex } from './world/roadIndex'
import type { World } from './world/types'

/**
 * Robotsofőr: végigvezet az útvonalon. A gondos változat minden szabályt betart (tesztben: hibátlan vizsga),
 * a hanyag nem néz körül, nem indexel, nem áll meg a STOP táblánál és gyorsan hajt (tesztben: ezek a hibák jönnek ki).
 * Tiszta logika, a szimuláció állapotából számol.
 */

export interface BotOptions {
  careful: boolean
  /** Élő forgalom: a robot követi az előtte haladót, elsőbbséget ad, megáll a gyalogos előtt */
  traffic?: TrafficSystem
  /** Nem ad elsőbbséget (a vizsgabiztos tesztjéhez) */
  ignorePriority?: boolean
  /** Ennyivel a megengedett sebesség fölött halad (km/h) */
  speedOver?: number
}

export class BotDriver {
  private world: World
  private index: RoadIndex
  private ins: Instruction[]
  private opts: BotOptions
  private ringExits: number[] = []
  private done = new Set<string>()
  private waitUntil = 0
  /** Mióta vár elsőbbségadás miatt (s) */
  private yieldSince: number | null = null
  private lookUntil = 0
  private look: Look = 'ahead'
  private startT: number | null = null
  private reengageT = 0
  private lane: { pts: XZ[]; cum: number[] } | null = null
  private laneS = 0

  constructor(world: World, index: RoadIndex, instructions: Instruction[], opts: BotOptions) {
    this.world = world
    this.index = index
    this.ins = instructions
    this.opts = opts
    const { route } = world
    // A körforgalomból kihajtás helyei: ahol az útvonal körpályáról rendes útra lép
    let was = false
    for (let s = 0; s < route.length; s += 2) {
      const p = pointAt(route.pts, route.cum, s)
      const hit = index.nearest(p)
      const ring = !!hit && hit.dist < halfWidthAt(hit.road, hit.s) && hit.road.roundabout
      if (was && !ring) this.ringExits.push(s)
      was = ring
    }
  }

  private glance(look: Look, t: number, seconds: number) {
    this.look = look
    this.lookUntil = t + seconds
  }

  /** Egy lépés: kezelőszervek, egyszeri mozdulatok és a nézés */
  drive(state: SimState, s: number): { controls: Controls; actions: SimAction[]; look: Look } {
    const c = state.car
    const t = state.t
    const actions: SimAction[] = []
    const careful = this.opts.careful
    if (t > this.lookUntil) this.look = 'ahead'
    const v = Math.abs(c.speed)
    const { route } = this.world

    // ---------------------------------------------------------------- elindulás: tükör, váll, index, kézifék
    if (this.startT === null) {
      this.startT = t
      if (careful) this.glance('mirror_left', t, 0.6)
    }
    const since = t - this.startT
    if (careful && since > 0.7 && !this.done.has('shoulder')) {
      this.done.add('shoulder')
      this.glance('shoulder_left', t, 0.7)
    }
    if (careful && since > 1.5 && !this.done.has('ind-start')) {
      this.done.add('ind-start')
      actions.push('indicator_left')
    }
    if (since > 2 && !this.done.has('hb')) {
      this.done.add('hb')
      actions.push('handbrake')
    }
    if (since < 2.2) return { controls: { throttle: 0, brake: 1, steer: 0, handbrake: false }, actions, look: this.look }
    // Besorolás után az elindulási indexet kikapcsoljuk (ha nem kapcsolt ki magától, és nem jön balra kanyar)
    if (careful && s > 25 && !this.done.has('ind-start-off')) {
      this.done.add('ind-start-off')
      const leftSoon = this.ins.some((x) => x.kind === 'turn' && x.dir === 'left' && x.s - s < 70)
      if (c.indicator === 'left' && !leftSoon) actions.push('indicator_left')
    }

    // ---------------------------------------------------------------- irányjelzés kanyarodás előtt
    const finishing = s > route.length - 70
    if (careful) {
      // Csak a legközelebbi, még előttünk lévő kanyarra jelzünk
      const nextTurn = this.ins.findIndex((x) => x.kind === 'turn' && x.s > s - 3)
      for (const [i, x] of this.ins.entries()) {
        if (x.kind !== 'turn' || !x.dir) continue
        const key = `turn${i}`
        if (i > nextTurn && !this.done.has(key)) continue
        if (!this.done.has(`${key}m`) && x.s - s < 65 && x.s - s > 0) {
          this.done.add(`${key}m`)
          this.glance(x.dir === 'left' ? 'mirror_left' : 'mirror_right', t, 0.5)
        }
        if (!this.done.has(key) && x.s - s < 60 && x.s - s > 0 && t > this.lookUntil - 0.1) {
          this.done.add(key)
          if (c.indicator !== x.dir) actions.push(x.dir === 'left' ? 'indicator_left' : 'indicator_right')
        }
        // Ha egy kanyarban a kanyarodás előtt magától kikapcsolt, újra bekapcsoljuk
        if (i === nextTurn && this.done.has(key) && x.s - s > 2 && c.indicator !== x.dir && t > this.reengageT) {
          this.reengageT = t + 0.6
          actions.push(x.dir === 'left' ? 'indicator_left' : 'indicator_right')
        }
        // Ha a kis szögű kanyar után nem kapcsolt ki magától, kikapcsoljuk
        if (this.done.has(key) && !this.done.has(`${key}off`) && s > x.s + 18) {
          this.done.add(`${key}off`)
          if (c.indicator === x.dir) actions.push(x.dir === 'left' ? 'indicator_left' : 'indicator_right')
        }
      }
      for (const [i, e] of this.ringExits.entries()) {
        const key = `ring${i}`
        if (!this.done.has(key) && e - s < 22 && e - s > 0) {
          this.done.add(key)
          this.glance('mirror_right', t, 0.4)
          if (c.indicator !== 'right') actions.push('indicator_right')
        }
        if (this.done.has(key) && !this.done.has(`${key}off`) && s > e + 15) {
          this.done.add(`${key}off`)
          if (c.indicator === 'right') actions.push('indicator_right')
        }
      }
      if (finishing && !this.done.has('finish-ind')) {
        this.done.add('finish-ind')
        this.glance('mirror_right', t, 0.5)
        if (c.indicator !== 'right') actions.push('indicator_right')
      }
      // A megállásig jelzünk (ha a kormány visszaforgatásakor magától kikapcsolt, újra bekapcsoljuk)
      if (finishing && this.done.has('finish-ind') && !this.done.has('hb-end') && c.indicator !== 'right' && t > this.reengageT) {
        this.reengageT = t + 0.6
        actions.push('indicator_right')
      }
    }

    // ---------------------------------------------------------------- kormányzás: követés a jobb oldali sávban
    // Stanley-szabályozó a kisimított sávvonalon: az első tengely oldaltávolsága és az irányeltérés alapján
    const fa: XZ = [c.x + Math.sin(c.heading) * CAR.wheelbase, c.z - Math.cos(c.heading) * CAR.wheelbase]
    const lane = this.lanePath()
    this.laneS = this.nearestOn(lane.pts, lane.cum, fa, this.laneS)
    const lanePt = pointAt(lane.pts, lane.cum, this.laneS)
    const pathH = headingAt(lane.pts, lane.cum, this.laneS + 2, 4)
    const [rx, rz] = rightOf(pathH)
    // e > 0: a sáv közepe tőlünk jobbra van
    const e = (lanePt[0] - fa[0]) * rx + (lanePt[1] - fa[1]) * rz
    let wheel = wrapAngle(pathH - c.heading) + Math.atan2(1.4 * e, v + 1.5)
    // Szegélyvédelem (mint a figyelmes vezető): ha a kocsi oldala a mostani íven néhány méterrel előrébb lelógna az
    // úttestről, elkormányzunk attól az oldaltól
    if (v > 0.5 && c.gear === 'D') {
      const bend = Math.tan(c.wheel) / CAR.wheelbase
      const reach = Math.min(7, 2 + v * 0.6)
      let x = c.x + Math.sin(c.heading) * (CAR.front - 0.4)
      let z = c.z - Math.cos(c.heading) * (CAR.front - 0.4)
      let h = c.heading
      for (let d = 0; d < reach; d += 1) {
        h += bend
        x += Math.sin(h)
        z -= Math.cos(h)
        const [qx, qz] = rightOf(h)
        const off = [1, -1].map((k) => !this.index.onAsphalt([x + qx * k * (CAR.width / 2 + 0.3), z + qz * k * (CAR.width / 2 + 0.3)]))
        // Csak ha az egyik oldal lóg le (keskeny úton mindkettő közel lehet: ott a sáv közepe a jó)
        const side = off[0] && !off[1] ? 1 : off[1] && !off[0] ? -1 : undefined
        if (side !== undefined) {
          wheel -= side * 0.12 * (1 - d / reach)
          break
        }
      }
    }
    const steer = Math.max(-1, Math.min(1, wheel / steerLimit(v)))

    // ---------------------------------------------------------------- sebesség
    const front = s + (CAR.front - CENTER_F)
    const ahead = (d: number) => Math.min(...this.ins.filter((x) => x.kind === 'turn' && x.s - s > -5 && x.s - s < d).map((x) => x.s - s), Infinity)
    const node = this.index.nearest(pointAt(route.pts, route.cum, s))
    const limit = (node?.road.maxspeed ?? 50) + (this.opts.speedOver ?? 0)
    let vt = (limit - 4) / 3.6
    // Kanyar előtt és közben lassan
    const curve = Math.abs(wrapAngle(headingAt(route.pts, route.cum, s + 25, 8) - headingAt(route.pts, route.cum, s + 2, 8)))
    if (curve > 0.25) vt = Math.min(vt, 24 / 3.6)
    if (ahead(45) < 45 || curve > 0.7) vt = Math.min(vt, 16 / 3.6)
    // Éles kanyarban lassabban, a szinte visszaforduló kanyarban lépésben
    const sharp = Math.max(0, ...this.ins.filter((x) => x.kind === 'turn' && x.s - s < 30 && x.s - s > -10).map((x) => x.angle ?? 0))
    if (sharp > 1.4 || curve > 1.3) vt = Math.min(vt, 11 / 3.6)
    if (sharp > 1.9 || curve > 1.7) vt = Math.min(vt, 7 / 3.6)
    // A követendő vonal görbülete előttünk (pl. éles útkanyar kereszteződés nélkül): oldalgyorsulás legfeljebb
    // 2,2 m/s², és időben (2 m/s²-tel) lelassítunk az ív elé
    for (let d = 0; d <= 35; d += 2) {
      const h0 = headingAt(lane.pts, lane.cum, this.laneS + d, 1.5)
      const h1 = headingAt(lane.pts, lane.cum, this.laneS + d + 5, 1.5)
      const k = Math.abs(wrapAngle(h1 - h0)) / 5
      if (k < 0.02) continue
      vt = Math.min(vt, Math.sqrt(2.2 / k + 2 * 2 * d))
    }
    // Megállás a STOP-nál, a tilos jelzésnél és a végén
    const stopAt = (lineS: number) => Math.sqrt(2 * 2.2 * Math.max(0, lineS - 1.2 - front))
    // A vizsgabiztossal azonos módon: a kocsi eleje és a megállási vonal, a vonal irányához képest
    const fp: XZ = [c.x + Math.sin(c.heading) * CAR.front, c.z - Math.cos(c.heading) * CAR.front]
    const lineAhead = (at: XZ, heading: number, halfSpan: number) => {
      const fx = Math.sin(heading)
      const fz = -Math.cos(heading)
      const along = (fp[0] - at[0]) * fx + (fp[1] - at[1]) * fz
      const lat = (fp[0] - at[0]) * Math.cos(heading) + (fp[1] - at[1]) * Math.sin(heading)
      if (Math.abs(wrapAngle(c.heading - heading)) > 0.9 || Math.abs(lat) > halfSpan || along > 0.2 || along < -80) return null
      return -along
    }
    const brakeFor = (dist: number) => Math.sqrt(2 * 2.2 * Math.max(0, dist - 1.2))
    let stopDist = Infinity
    if (careful)
      this.world.stops.forEach((st, i) => {
        if (st.kind !== 'stop' || this.done.has(`stop${i}`)) return
        const d = lineAhead(st.at, st.heading, st.halfSpan + 1.5)
        if (d === null) return
        vt = Math.min(vt, brakeFor(d))
        stopDist = Math.min(stopDist, d)
        if (v < 0.05 && d < 3) {
          this.done.add(`stop${i}`)
          this.waitUntil = t + 1.2
        }
      })
    this.world.lights.forEach((l) => {
      if (l.repeater) return
      const d = lineAhead(l.stopAt, l.heading, 6)
      if (d === null) return
      const state = lightState(this.world, l, t)
      let need = state === 'red' || state === 'red_yellow' || (state === 'yellow' && (v * v) / (2 * 4) + v * 0.8 + 1 < d)
      // Sárgánál akkor is megáll (erősebben fékezve), ha a pirosig nem érne át a vonalon, vagy egy lassú autó mögött
      // ragadna (különben pirosban hajtana át)
      if (state === 'yellow' && !need && (v * v) / (2 * 6) + 0.5 < d) {
        const late = d / Math.max(0.5, v) > yellowLeft(this.world, l, t) - 0.2
        const cx0 = c.x + Math.sin(c.heading) * CENTER_F
        const cz0 = c.z - Math.cos(c.heading) * CENTER_F
        const queued = (this.opts.traffic?.cars ?? []).some((o) => {
          const along = (o.x - cx0) * Math.sin(c.heading) - (o.z - cz0) * Math.cos(c.heading)
          const lat = Math.abs((o.x - cx0) * Math.cos(c.heading) + (o.z - cz0) * Math.sin(c.heading))
          return along > 0 && along < d + 14 && lat < 2 && o.v < Math.max(3, v - 2)
        })
        need = late || queued
      }
      if (need) {
        vt = Math.min(vt, brakeFor(d))
        stopDist = Math.min(stopDist, d)
      }
    })
    // ---------------------------------------------------------------- forgalom
    const tr = this.opts.traffic
    if (tr) {
      const cx = c.x + Math.sin(c.heading) * CENTER_F
      const cz = c.z - Math.cos(c.heading) * CENTER_F
      const [fx2, fz2] = [Math.sin(c.heading), -Math.cos(c.heading)]
      const [rx2, rz2] = rightOf(c.heading)
      // Az előttünk haladó: biztonságos követési távolság (kb. 1,6 s), megállásnál 2–3 m
      let gap = Infinity
      for (const o of tr.cars) {
        const along = (o.x - cx) * fx2 + (o.z - cz) * fz2
        const lat = Math.abs((o.x - cx) * rx2 + (o.z - cz) * rz2)
        if (along > 0 && along < 70 && lat < 1.8 && Math.cos(wrapAngle(o.heading - c.heading)) > 0.3) gap = Math.min(gap, along - CAR.length)
      }
      if (gap < 70) {
        vt = Math.min(vt, Math.max(0, (gap - 3) / 1.6))
        if (gap < 30) stopDist = Math.min(stopDist, gap - 1.5)
      }
      // Elsőbbség a kereszteződésben (a többi járművel azonos szabály, nagyobb ráhagyással)
      // Minden előttünk lévő kereszteződés, amelynek a megállási vonala közel van (egymásba érő kereszteződéseknél több is)
      const passes = this.opts.ignorePriority ? [] : tr.passes.filter((x) => x.s > s - (tr.models.get(x.node)?.j.core ?? 5) && x.s < s + 120)
      let yielding = false
      for (const pass of passes) {
        const m = tr.models.get(pass.node)!
        const lineDist = pass.s - stopBack(m.j, pass.approach.arm.road, pass.approach.arm.dir) - front
        if (lineDist <= -0.5 || lineDist >= 45) continue
        const others: Mover[] = tr.presencesAt(pass.node)
        const me: Mover = { approach: pass.approach, movement: pass.movement, eta: Infinity, inside: false, waiting: v < 0.5 && lineDist < 5 }
        // A többiekkel azonos szabály, nagyobb ráhagyással (4,5 s); hosszabb várakozás után a megállási vonalánál
        // álló (minket előre engedő) elsőbbségi járművet nem várja meg
        const waited = this.yieldSince === null ? 0 : t - this.yieldSince
        if (mustWait(m, me, waited > 6 ? others.filter((o) => !(o.still && o.waiting)) : others, 4.5)) {
          yielding = true
          vt = Math.min(vt, brakeFor(lineDist))
          stopDist = Math.min(stopDist, lineDist)
        }
      }
      if (yielding) this.yieldSince ??= t
      else if (v > 2) this.yieldSince = null
      // A saját sávvonalunk a következő pár méteren: ha ott áll vagy oda ér egy jármű (bármilyen irányból), megállunk
      const lane = this.lanePath()
      for (let d = 2; d <= Math.max(6, v * 1.4 + 4); d += 2) {
        const sp = Math.min(lane.cum[lane.cum.length - 1], this.laneS + d)
        const p = pointAt(lane.pts, lane.cum, sp)
        const box = boxOf(p[0], p[1], headingAt(lane.pts, lane.cum, sp, 2), CAR.length + 0.4, CAR.width + 0.4)
        if (tr.cars.some((o) => Math.hypot(o.x - p[0], o.z - p[1]) < 6 && overlap(box, boxOf(o.x, o.z, o.heading, CAR.length, CAR.width)))) {
          stopDist = Math.min(stopDist, d - CAR.wheelbase - 1)
          vt = Math.min(vt, brakeFor(d - CAR.wheelbase))
          break
        }
      }
      // Vészfék: a tényleges helyünkből a mostani kormányállással a következő pár méteren (az útvonal-követés
      // pontatlansága ne rejtsen el közeli akadályt; messzebbre nem, mert a kanyarban a kormány még visszatér)
      {
        let px = cx
        let pz = cz
        let h = c.heading
        const bend = Math.tan(c.wheel) / CAR.wheelbase
        for (let d = 1; d <= 3; d += 1) {
          h += bend
          px += Math.sin(h)
          pz -= Math.cos(h)
          const box = boxOf(px, pz, h, CAR.length + 0.2, CAR.width + 0.2)
          if (tr.cars.some((o) => Math.hypot(o.x - px, o.z - pz) < 6 && overlap(box, boxOf(o.x, o.z, o.heading, CAR.length, CAR.width)))) {
            stopDist = Math.min(stopDist, d - 1)
            vt = Math.min(vt, brakeFor(d))
            break
          }
        }
      }
      // Gyalogos a zebrán vagy lelépni készül
      for (const rc of tr.routeCrossings) {
        // A haladás (útvonal-követés) kanyarban késhet: a zebra távolságát a tényleges sávvonalunk mentén is mérjük
        let d = rc.s - front
        if (d < -1 || d > 70) continue
        const lane = this.lanePath()
        const cr = this.world.crossings[rc.index]
        const near = this.nearestOn(lane.pts, lane.cum, cr.at, this.laneS + d)
        const pt = pointAt(lane.pts, lane.cum, near)
        if (Math.hypot(pt[0] - cr.at[0], pt[1] - cr.at[1]) < cr.halfWidth + 2) d = Math.min(d, near - this.laneS - (CAR.front - CAR.wheelbase))
        if (tr.crossingBusy(rc.index, true)) {
          vt = Math.min(vt, brakeFor(d - 3))
          stopDist = Math.min(stopDist, d - 3)
        }
      }
    }

    if (finishing) vt = Math.min(vt, stopAt(route.length - 4))
    if (t < this.waitUntil) vt = 0

    let throttle = Math.max(0, Math.min(1, (vt - v) * 0.6))
    let brake = Math.max(0, Math.min(1, (v - vt) * 0.45))
    // Ha meg kell állni: legalább akkora fékezés, amekkora a hátralévő úton a megálláshoz kell
    if (stopDist < Infinity && v > 0.3) {
      const need = (v * v) / (2 * Math.max(0.4, stopDist - 1.2))
      if (need > 1.2) {
        brake = Math.max(brake, Math.min(1, (need / 8.5) * 1.25))
        throttle = 0
      }
    }
    if (vt < 0.05) {
      throttle = 0
      brake = 1
    }
    if (finishing && v < 0.05 && route.length - s < 40 && !this.done.has('hb-end')) {
      this.done.add('hb-end')
      actions.push('handbrake')
    }
    return { controls: { throttle, brake, steer, handbrake: false }, actions, look: this.look }
  }

  /** A pont vetülete egy töröttvonalra az eddigi helyzet környékén */
  private nearestOn(pts: XZ[], cum: number[], p: XZ, around: number): number {
    let best = { s: around, d: Infinity }
    for (let i = 0; i < pts.length - 1; i++) {
      if (cum[i + 1] < around - 10 || cum[i] > around + 30) continue
      const h = projectOnSegment(p, pts[i], pts[i + 1])
      if (h.dist < best.d) best = { s: cum[i] + h.t * (cum[i + 1] - cum[i]), d: h.dist }
    }
    return best.s
  }

  /**
   * A követendő vonal: az útvonal a megfelelő sávba (és a manőverek szerinti helyre) eltolva, majd kisimítva, hogy a
   * kereszteződések éles töréspontjai helyett ív legyen, amelyet egy autó végig tud követni.
   */
  private lanePath(): { pts: XZ[]; cum: number[] } {
    if (this.lane) return this.lane
    const { route } = this.world
    const step = 1.5
    const ss: number[] = []
    let lats: number[] = []
    for (let s = 0; s <= route.length; s += step) {
      const kerb = route.length - s < 40
      const nearTurn = this.ins.some((x) => x.kind === 'turn' && Math.abs(x.s - s) < 35)
      const now = this.laneLat(s, kerb)
      // Ha előttünk megszűnik a sávunk (ugyanazon az úton keskenyedik, kereszteződés nélkül), időben átsorolunk balra
      let lat = now
      if (!kerb && !nearTurn && !this.junctionBetween(s, s + 30))
        for (const ahead of [s + 15, s + 30]) if (this.sameKindAhead(s, ahead)) lat = Math.min(lat, this.laneLat(ahead, false))
      ss.push(s)
      lats.push(lat)
    }
    // Az oldaltávolság simítása (a sávváltás fokozatos legyen, ne ugorjon)
    for (let pass = 0; pass < 2; pass++) {
      const k = 4
      lats = lats.map((v, i) => {
        if (i < k || i >= lats.length - k) return v
        let sum = 0
        for (let j = i - k; j <= i + k; j++) sum += lats[j]
        return sum / (2 * k + 1)
      })
    }
    // A simított oldaltávolság sem viheti a kocsit a szegélyhez: az ott lévő úttest szélétől legalább 25 cm (a
    // szélesedő út felé csak ott sorol át, ahol már szélesebb a burkolat)
    lats = lats.map((v, i) => {
      const lim = this.lateralLimits(ss[i], v)
      return lim ? Math.max(lim[0], Math.min(lim[1], v)) : v
    })
    let pts: XZ[] = ss.map((s, i) => {
      const p = pointAt(route.pts, route.cum, s)
      const [rx, rz] = rightOf(headingAt(route.pts, route.cum, s, 3))
      return [p[0] + rx * lats[i], p[1] + rz * lats[i]] as XZ
    })
    // A kereszteződésekben ugyanazon az íven, mint a többi jármű (a megállási vonaltól a kijáratig): így az elsőbbség
    // és az ütközés-elkerülés ugyanazzal a mozgással számol
    const models = buildJunctionModels(this.world)
    /** A kanyarodó ívek pontjai (ezeket nem igazítjuk: a többi járművel egyeztetett pályák) */
    const turning: boolean[] = pts.map(() => false)
    for (const p of routeJunctionPasses(this.world, models)) {
      if (!p.movement) continue
      const curve = p.movement.curve
      const near = (q: XZ, lo: number, hi: number) => {
        let best = -1
        let bd = Infinity
        ss.forEach((sv, i) => {
          if (sv < lo || sv > hi || i >= pts.length) return
          const d = Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1])
          if (d < bd) {
            bd = d
            best = i
          }
        })
        return bd < 4 ? best : -1
      }
      const a = near(curve[0], p.s - 45, p.s)
      const b = near(curve[curve.length - 1], p.s, p.s + 45)
      if (a < 0 || b <= a) continue
      pts.splice(a, b - a + 1, ...curve)
      ss.splice(a, b - a + 1, ...curve.map((_, k) => ss[a] + ((ss[b] - ss[a]) * k) / (curve.length - 1)))
      turning.splice(a, b - a + 1, ...curve.map(() => p.approach.turn !== 'straight'))
    }
    pts = this.keepOnAsphalt(pts, turning)
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    this.lane = { pts, cum }
    return this.lane
  }

  /**
   * A követendő vonal igazítása: ahol a kocsi egyik oldala (25 cm ráhagyással) lelógna az úttestről (pl. a
   * kanyarodó ív egy sziget vagy sarok orránál), a vonalat a másik oldal felé toljuk, majd kisimítjuk
   */
  private keepOnAsphalt(pts0: XZ[], turning: boolean[]): XZ[] {
    let pts = pts0.map((p) => [p[0], p[1]] as XZ)
    const half = CAR.width / 2 + 0.25
    const inside = turning
    for (let pass = 0; pass < 16; pass++) {
      let moved = false
      pts = pts.map((p, i) => {
        // A kanyarodó ív a többi járművel egyeztetett (a várakozók mellett halad el): azt nem toljuk
        if (inside[i]) return p
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len < 0.01) return p
        const rx = -(b[1] - a[1]) / len
        const rz = (b[0] - a[0]) / len
        const right = this.index.onAsphalt([p[0] + rx * half, p[1] + rz * half])
        const left = this.index.onAsphalt([p[0] - rx * half, p[1] - rz * half])
        if (right === left) return p
        moved = true
        const k = right ? 0.25 : -0.25
        return [p[0] + rx * k, p[1] + rz * k] as XZ
      })
      if (!moved) break
      // Simítás (a kis tolások ne törjék meg a vonalat)
      pts = pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1 || inside[i]) return p
        const a = pts[i - 1]
        const b = pts[i + 1]
        return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4] as XZ
      })
    }
    return pts
  }

  /**
   * Az útvonaltól mért oldaltávolság határai, hogy a kocsi az úttesten maradjon: a megrajzolt úttestet keresztben
   * végigmérve a kívánt hely körül (így a szigetet, a szűkülést is látja); a kereszteződés belsejében nincs határ
   */
  private lateralLimits(s: number, want: number): [number, number] | null {
    const { route } = this.world
    const p = pointAt(route.pts, route.cum, s)
    if (this.index.inJunctionPaved(p)) return null
    const [rx, rz] = rightOf(headingAt(route.pts, route.cum, s, 4))
    const on = (l: number) => this.index.onAsphalt([p[0] + rx * l, p[1] + rz * l])
    // A kívánt helyhez legközelebbi úttestpont (a középvonal felé keresve)
    let start: number | null = null
    for (let k = 0; k <= 16 && start === null; k++) for (const l of [want - Math.sign(want || 1) * k * 0.25, want + Math.sign(want || 1) * k * 0.25]) if (start === null && on(l)) start = l
    if (start === null) return null
    let lo = start
    let hi = start
    while (hi - start < 20 && on(hi + 0.2)) hi += 0.2
    while (start - lo < 20 && on(lo - 0.2)) lo -= 0.2
    const m = CAR.width / 2 + 0.3
    if (hi - lo < 2 * m) return [(lo + hi) / 2, (lo + hi) / 2]
    return [lo + m, hi - m]
  }

  /** Van-e valódi kereszteződés az útvonalon a két pont között */
  private junctionBetween(a: number, b: number): boolean {
    const { route } = this.world
    for (const j of this.world.junctions) {
      if (j.arms < 3) continue
      for (let s = a; s <= b; s += 4) {
        const p = pointAt(route.pts, route.cum, s)
        if (Math.hypot(p[0] - j.at[0], p[1] - j.at[1]) < j.core + 2) return true
      }
    }
    return false
  }

  /** Az előttünk lévő pontnál ugyanolyan jellegű út van-e (mindkettő egy- vagy kétirányú): csak ott értelmes a sáv-megszűnés */
  private sameKindAhead(s: number, ahead: number): boolean {
    const { route } = this.world
    const at = (x: number) => this.index.nearest(pointAt(route.pts, route.cum, x))?.road
    const a = at(s)
    const b = at(ahead)
    return !!a && !!b && (a.oneway === 0) === (b.oneway === 0)
  }

  /** A jobb szélső sáv közepe (a végén a járda melletti hely) az útvonaltól jobbra mérve */
  private laneLat(s: number, kerb: boolean): number {
    const { route } = this.world
    const p = pointAt(route.pts, route.cum, s)
    const h = headingAt(route.pts, route.cum, s, 4)
    // Kereszteződésben több út is itt van: az útvonal irányába futó számít
    const candidates = this.index.roadsAt(p).filter((x) => Math.abs(Math.cos(wrapAngle(x.heading - h))) > 0.85)
    const hit = candidates.sort((a, b) => a.dist - b.dist)[0] ?? this.index.nearest(p)
    let lat = 1.6
    if (hit) {
      const aligned = Math.cos(wrapAngle(hit.heading - h)) >= 0
      const centreLat = aligned ? hit.lateral : -hit.lateral
      // Az útvonal pontja a középvonalhoz képest centreLat-ra van: ebből a jobb szélső sáv közepe
      const want = kerb ? halfWidthAt(hit.road, hit.s) - CAR.width / 2 - 0.3 : rightLaneCentre(hit.road, aligned)
      lat = want - centreLat
    }
    return lat
  }
}
