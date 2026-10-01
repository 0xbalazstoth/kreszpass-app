import type { LineString } from 'geojson'
import type { Situation } from '../domain/types'
import { RouteGeom, type LngLat } from '../lib/geo'
import type { OsmData } from './osm'
import { SIGN_BY_CODE, speedSignCode } from './signs'
import { signsAlongRoute } from './situations'

/**
 * A valódi táblák egy útvonal mentén, a táblagyakorlás „Az utakon” módjához: az OpenStreetMap-ben kitáblázott táblák,
 * és a helyzetekből biztosan következő táblák (STOP, elsőbbségadás, sebességkorlátozás, zebra, körforgalom…).
 */

export interface RoadSign {
  code: string
  /** Távolság az útvonal elejétől (m) */
  d: number
  lngLat: LngLat
  source: 'osm' | 'situation'
}

/** Ennyin belül ugyanaz a tábla egynek számít (m) */
const SAME_SIGN_M = 30
/** A figyelmeztető táblák ennyivel a veszélyes hely előtt állnak (m) */
const WARNING_BEFORE_M = 60

type SignAt = { code: string; offset: number }

/**
 * A helyzetnél ténylegesen álló táblák, a helyzethez képesti helyükkel (negatív = előtte).
 * Az ellenőrizendő helyzeteknél csak a biztosan ott álló táblák: a körforgalom és a vasúti átjáró táblái, a megálló
 * táblája ott van akkor is, ha a kijárat, a sorompó vagy a járdasziget bizonytalan; a kikövetkeztetett elsőbbségi
 * táblák (főútvonal, elsőbbségadás) viszont nem.
 * Az egyenrangú kereszteződés és a jelzőlámpa jelképe (A-027, A-026) nem feltétlenül áll ott, ezért kimarad.
 */
function situationSigns(s: Situation): SignAt[] {
  const at = (code: string, offset = 0): SignAt => ({ code, offset })
  const sure = !s.needsReview
  switch (s.kind) {
    case 'stop':
      return sure ? [at('B-002')] : []
    case 'give_way':
      return sure ? [at('B-001')] : []
    case 'priority':
      return sure ? [at('B-003')] : []
    case 'speed_change':
      return s.speedTo ? [at(speedSignCode(s.speedTo))] : []
    case 'crossing':
      return [at('E-038')]
    case 'roundabout':
      return [at('A-056', -WARNING_BEFORE_M), at('B-001'), at('D-017')]
    case 'rail_crossing': {
      const warn = sure ? [at(s.rail?.barrier ? 'A-038' : 'A-039', -WARNING_BEFORE_M - 20)] : []
      return [...warn, at('A-045', -WARNING_BEFORE_M), at('A-041')]
    }
    case 'tram_stop':
      return s.transit?.island === false ? [at('A-053+H-023', -WARNING_BEFORE_M), at('E-041')] : [at('E-041')]
    case 'bus_stop':
      return [at('E-039')]
    default:
      return []
  }
}

export function roadSignsAlongRoute(line: LineString, osm: OsmData, situations: Situation[]): RoadSign[] {
  const geom = new RouteGeom(line)
  const all: RoadSign[] = signsAlongRoute(line, osm).map((x) => ({ ...x, source: 'osm' }))
  for (const s of situations) {
    // A generált (váratlan) helyzeteknél nincs tábla
    if (s.source === 'generated') continue
    // Az „Egyirányú forgalmú út” tábla a befordulás után, a célút elején áll
    const own = [...situationSigns(s), ...(s.signs ?? []).map((code) => ({ code, offset: code === 'E-012' ? 20 : -5 }))]
    for (const { code, offset } of own) {
      const d = geom.clampD(s.d + offset)
      all.push({ code, d, lngLat: geom.pointAt(d), source: 'situation' })
    }
  }
  const out: RoadSign[] = []
  for (const x of all.filter((x) => SIGN_BY_CODE.has(x.code)).sort((a, b) => a.d - b.d)) {
    if (out.some((y) => y.code === x.code && Math.abs(y.d - x.d) < SAME_SIGN_M)) continue
    out.push(x)
  }
  return out
}

/** Egy véletlen szakasz: `count` egymást követő tábla, haladási sorrendben */
export function pickRoadStretch<T>(signs: T[], count: number, rng: () => number = Math.random): T[] {
  if (signs.length <= count) return [...signs]
  const start = Math.floor(rng() * (signs.length - count + 1))
  return signs.slice(start, start + count)
}

/**
 * Több útvonal tábláiból egy kör: útvonalanként egy véletlen szakasz, amíg össze nem jön `count` tábla.
 * Egy útvonal táblái haladási sorrendben, egymás után jönnek.
 */
export function fillFromRoutes<T>(perRoute: T[][], count: number, rng: () => number = Math.random): T[] {
  const out: T[] = []
  for (const signs of perRoute) {
    if (out.length >= count) break
    out.push(...pickRoadStretch(signs, count - out.length, rng))
  }
  return out
}
