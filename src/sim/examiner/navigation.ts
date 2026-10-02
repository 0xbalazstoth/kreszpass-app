import { ordinalWord } from '../../domain/examiner'
import type { Situation } from '../../domain/types'
import { headingAt, pointAt } from '../world/polyline'
import { projectOnSegment, wrapAngle, type XZ } from '../world/project'
import { indexWorld } from '../world/build'
import type { RoadIndex } from '../world/roadIndex'
import type { World } from '../world/types'

/**
 * A vizsgabiztos útbaigazításai: az útvonal kanyarodásai a valódi kereszteződésekben (a geometriából), a körforgalmak
 * kijárata (a helyzetekből), és a végén a megállás a járda mellett. A vizsgán csak az irány hangzik el; a táblákat,
 * lámpákat a vizsgázónak kell felismernie.
 */

export interface Instruction {
  /** A manőver helye az útvonalon (m) */
  s: number
  kind: 'turn' | 'straight' | 'roundabout' | 'finish'
  dir?: 'left' | 'right'
  /** A kanyarodás szöge (radián) */
  angle?: number
  exit?: number
  /** A kereszteződés közepe (az irányjelzés és a körültekintés ellenőrzéséhez) */
  at: XZ
  text: string
  /** Az utca, ahová a manőver után érünk (ha van neve) */
  street?: string
}

/** Ennyivel a manőver előtt hangzik el az utasítás (m), mint a valódi vizsgán */
export const ANNOUNCE_M = 120
/** Ekkora irányváltozás egy kereszteződésben már kanyarodás (radián, kb. 35°) */
const TURN_RAD = 0.6
/** Az útvonalon ilyen közel lévő kereszteződésen halad át (m) */
const ON_ROUTE_M = 5

export function buildInstructions(world: World, situations: Array<Pick<Situation, 'd' | 'kind' | 'roundabout'>>, index: RoadIndex = indexWorld(world)): Instruction[] {
  const { route } = world
  const out: Instruction[] = []
  const rings = situations.filter((s) => s.kind === 'roundabout')

  // A körforgalomhoz tartozó csomópontok (ott a kijárat számít, nem a kanyarodás)
  const ringNodes = new Set<number>()
  for (const r of world.roads) if (r.roundabout) for (const n of r.nodes) ringNodes.add(n)

  for (const j of world.junctions) {
    if (j.arms < 3 || ringNodes.has(j.node)) continue
    // Az útvonal minden áthaladása ezen a kereszteződésen (egy hurok kétszer is érintheti)
    const passes: number[] = []
    let last = -Infinity
    for (let i = 0; i < route.pts.length - 1; i++) {
      const h = projectOnSegment(j.at, route.pts[i], route.pts[i + 1])
      if (h.dist > ON_ROUTE_M) continue
      const s = route.cum[i] + h.t * (route.cum[i + 1] - route.cum[i])
      if (s - last > 30) passes.push(s)
      last = s
    }
    for (const s of passes) {
      if (s < 15 || s > route.length - 15) continue
      if (rings.some((r) => Math.abs(r.d - s) < 40)) continue
      const hin = headingAt(route.pts, route.cum, s - 18, 6)
      const hout = headingAt(route.pts, route.cum, s + 18, 6)
      const delta = wrapAngle(hout - hin)
      if (Math.abs(delta) < TURN_RAD) {
        // Egyenesen át: jelzőlámpás kereszteződésben és négyágú (vagy nagyobb) kereszteződésben elhangzik
        const lit = world.lights.some((l) => Math.hypot(l.at[0] - j.at[0], l.at[1] - j.at[1]) < j.core + 25)
        if (lit || j.arms >= 4) out.push({ s, kind: 'straight', at: j.at, text: 'A kereszteződésben haladjon tovább egyenesen.' })
        continue
      }
      const dir = delta > 0 ? 'right' : 'left'
      out.push({ s, kind: 'turn', dir, angle: Math.abs(delta), at: j.at, text: `A következő kereszteződésnél forduljon ${dir === 'left' ? 'balra' : 'jobbra'}.` })
    }
  }

  for (const r of rings) {
    const exit = r.roundabout?.exit
    out.push({
      s: r.d,
      kind: 'roundabout',
      exit,
      at: pointAt(route.pts, route.cum, r.d),
      text: exit ? `A körforgalomban a ${ordinalWord(exit)} kijáraton hajtson ki.` : 'A következő körforgalomba hajtson be.',
    })
  }

  out.sort((a, b) => a.s - b.s)
  // Az egyenes áthaladás nem kell, ha közvetlenül mellette (pl. osztott pálya másik fele) másik egyenes van, vagy ha
  // nem sokkal utána kanyar jön (az utasítás és a panel ne mondjon egymásnak ellent)
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].kind !== 'straight') continue
    const si = out[i].s
    const clash = out.some((x, k) => k !== i && ((x.kind === 'straight' && k < i && Math.abs(x.s - si) < 25) || (x.kind !== 'straight' && x.s - si > -25 && x.s - si < 70)))
    if (clash) out.splice(i, 1)
  }
  // Osztott pályás út keresztezése: két csomópont néhány méterre, ugyanarra az irányra – ez egyetlen kanyar
  for (let i = out.length - 1; i > 0; i--) {
    const a = out[i - 1]
    const b = out[i]
    if (a.kind === 'turn' && b.kind === 'turn' && a.dir === b.dir && b.s - a.s < 16) out.splice(i, 1)
  }
  // Közvetlenül egymás után következő kanyarok: egy utasításban („…, majd azonnal …”)
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]
    const b = out[i + 1]
    if (b.s - a.s < 70 && a.kind === 'turn' && b.kind === 'turn') a.text = `${a.text.replace(/\.$/, '')}, majd azonnal ${b.dir === 'left' ? 'balra' : 'jobbra'}.`
  }

  // Az utca neve a manőver után (az útvonal irányába futó út)
  for (const x of out) {
    const s = Math.min(route.length, x.s + 25)
    const p = pointAt(route.pts, route.cum, s)
    const h = headingAt(route.pts, route.cum, s, 4)
    const hit = index
      .roadsAt(p)
      .filter((r) => Math.abs(Math.cos(wrapAngle(r.heading - h))) > 0.8)
      .sort((a, b) => a.dist - b.dist)[0]
    if (hit?.road.name) x.street = hit.road.name
  }

  const end = Math.max(0, route.length - 10)
  out.push({ s: end, kind: 'finish', at: pointAt(route.pts, route.cum, end), text: 'Az útvonal végén álljon meg jobbra, a járda mellett, és rögzítse a járművet.' })
  return out
}
