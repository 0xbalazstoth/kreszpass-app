import { speedSignCode } from '../../data/signs'
import { armsAt, mainArms, stopBack, type Arm } from './junctionArms'
import { halfWidthAt } from './lanes'
import { headingAt, offsetAt } from './polyline'
import { wrapAngle, type XZ } from './project'
import type { Junction, LightSite, Road, StopSite } from './types'

/**
 * Kitalált, de a szabályokkal összhangban lévő táblázás az egész világban (az OpenStreetMap-ben a táblák többsége nincs
 * felvéve): főútvonal és elsőbbségadás a különböző rangú utak kereszteződésében, körforgalom, egyirányú utca két vége,
 * sebességkorlátozás, ahol a megengedett sebesség változik. Az egyenrangú utak kereszteződésében nincs tábla
 * (jobbkéz-szabály), mint a valóságban a lakóutcákon.
 */

export interface SignageContext {
  junctions: Junction[]
  /** A csomópontot érintő utak és a csomópont sorszáma bennük */
  nodeOn: Map<number, Array<{ road: Road; i: number }>>
  lights: LightSite[]
  stops: StopSite[]
  addSign: (code: string, at: XZ, rotY: number) => void
  /** Úttesten (vagy kereszteződés burkolatán) van-e a pont: ide nem kerülhet táblaoszlop */
  onAsphalt: (p: XZ) => boolean
  /** Megállási (elsőbbségadási) vonal festése; a megközelítés iránya és a sávok tartománya */
  stopLine: (r: Road, s: number, dir: 1 | -1, kind: 'solid' | 'teeth') => { heading: number; lo: number; hi: number; kerb: number }
}


/** Tábla az ágon, a csomóponttól `back` méterre, a haladási irány szerinti jobb oldalon (toward: a csomópont felé haladóknak) */
function signOnArm(ctx: SignageContext, a: Arm, code: string, back: number, toward: boolean) {
  const r = a.road
  // A tábla annak szól, aki a csomópont felé (toward) vagy onnan elfelé halad
  const travelDir = toward ? a.dir : (-a.dir as 1 | -1)
  // A csomóponttól az ág belseje felé; ha a hely még a kereszteződés burkolatán van, beljebb visszük
  for (let extra = 0; extra <= 16; extra += 2) {
    const s = a.s - a.dir * (back + extra)
    if (s < 0 || s > r.length) return
    const roadH = headingAt(r.pts, r.cum, s)
    const h = roadH + (travelDir === 1 ? 0 : Math.PI)
    const at = offsetAt(r.pts, r.cum, s, travelDir * (halfWidthAt(r, s) + 1.0), roadH)
    if (ctx.onAsphalt(at)) continue
    ctx.addSign(code, at, -h)
    return
  }
}

export function inferSignage(ctx: SignageContext): void {
  for (const j of ctx.junctions) {
    if (j.node < 0) continue
    const arms = armsAt(ctx.nodeOn, j.node)
    if (arms.length < 2) continue
    const real = j.arms >= 3

    // ---------------------------------------------------------------- sebességkorlátozás az ágba behajtva
    for (const a of arms) {
      if (!a.canLeave || a.road.length < 20) continue
      const other = arms.filter((b) => b.road !== a.road)
      if (other.some((b) => b.road.maxspeed !== a.road.maxspeed)) signOnArm(ctx, a, speedSignCode(a.road.maxspeed), stopBack(j, a.road, a.dir) + 4, false)
    }
    if (!real) continue

    // ---------------------------------------------------------------- egyirányú utca: behajtás és „Behajtani tilos”
    for (const a of arms) {
      if (a.road.oneway === 0 || a.road.roundabout || a.road.length < 15) continue
      if (a.canLeave) signOnArm(ctx, a, 'E-012', stopBack(j, a.road, a.dir) + 1, false)
      else signOnArm(ctx, a, 'C-001', stopBack(j, a.road, a.dir), false)
    }

    // Jelzőlámpás kereszteződésben a lámpa szabályoz
    if (ctx.lights.some((l) => Math.hypot(l.at[0] - j.at[0], l.at[1] - j.at[1]) < j.core + 25)) continue

    // ---------------------------------------------------------------- körforgalom bejárata
    if (arms.some((a) => a.road.roundabout)) {
      for (const a of arms) {
        if (a.road.roundabout || !a.canApproach) continue
        const line = stopBack(j, a.road, a.dir) - 0.5
        if (a.s - a.dir * line < 0 || a.s - a.dir * line > a.road.length) continue
        ctx.stopLine(a.road, a.s - a.dir * line, a.dir, 'teeth')
        signOnArm(ctx, a, 'B-001', line, true)
        signOnArm(ctx, a, 'D-017', line + 0.1, true)
        signOnArm(ctx, a, 'A-056', line + 55, true)
      }
      continue
    }

    // ---------------------------------------------------------------- főútvonal és elsőbbségadás
    const main = mainArms(arms)
    // Egyenrangú kereszteződés: nincs tábla, jobbkéz-szabály
    if (!main.length) continue
    for (const a of arms) {
      if (!a.canApproach) continue
      const line = stopBack(j, a.road, a.dir)
      const sl = a.s - a.dir * line
      if (sl < 0 || sl > a.road.length) continue
      if (main.includes(a)) {
        signOnArm(ctx, a, 'B-003', line + 1, true)
        continue
      }
      // Ha az adatokban már STOP vagy elsőbbségadás van ezen az ágon, az marad
      const at = offsetAt(a.road.pts, a.road.cum, sl, 0)
      const h = headingAt(a.road.pts, a.road.cum, sl) + (a.dir === 1 ? 0 : Math.PI)
      if (ctx.stops.some((st) => Math.hypot(st.at[0] - at[0], st.at[1] - at[1]) < 18 && Math.abs(wrapAngle(st.heading - h)) < 0.6)) continue
      const ln = ctx.stopLine(a.road, sl, a.dir, 'teeth')
      ctx.stops.push({ kind: 'give_way', at: offsetAt(a.road.pts, a.road.cum, sl, (ln.lo + ln.hi) / 2), heading: ln.heading, halfSpan: (ln.hi - ln.lo) / 2 })
      signOnArm(ctx, a, 'B-001', line, true)
    }
  }
}
