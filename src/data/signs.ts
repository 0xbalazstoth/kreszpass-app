import type { Scene, SignType } from '../domain/questions'
import type { Situation, SituationKind } from '../domain/types'
import manifest from './signs.json'

/**
 * Valódi magyar KRESZ táblák (Wikimedia Commons, közkincs: PD-HU-exempt).
 * A képeket a `npm run signs` script tölti le a public/signs mappába.
 */

/** A csoportok a nyomtatható KRESZ-táblalista szakaszait követik */
export type SignGroup = 'utvonal' | 'elsobbsegi' | 'utasito' | 'megallas' | 'veszely' | 'vasut' | 'tajekoztato' | 'tilalmi'

export interface SignInfo {
  code: string
  name: string
  group: SignGroup
  file: string
  source: string
  license: string
  author: string
}

export const SIGNS: SignInfo[] = manifest as SignInfo[]
export const SIGN_BY_CODE = new Map(SIGNS.map((s) => [s.code, s]))

export const GROUP_LABEL: Record<SignGroup, string> = {
  utvonal: 'Útvonaltípust jelző',
  elsobbsegi: 'Elsőbbséget szabályozó',
  utasito: 'Utasítást adó',
  megallas: 'Megállási és várakozási tilalmat jelző',
  veszely: 'Veszélyt jelző',
  vasut: 'Vasúti átjárót jelző',
  tajekoztato: 'Tájékoztató',
  tilalmi: 'Járművek forgalmára vonatkozó tilalmi',
}

export function signUrl(code: string): string {
  const info = SIGN_BY_CODE.get(code)
  return `${import.meta.env.BASE_URL}signs/${info?.file ?? `${code}.png`}`
}

const SPEEDS = SIGNS.filter((s) => s.code.startsWith('C-033-'))
  .map((s) => Number(s.code.slice(6)))
  .sort((a, b) => a - b)

/** A legközelebbi elérhető sebességkorlátozó tábla */
export function speedSignCode(kmh: number): string {
  const best = SPEEDS.reduce((a, b) => (Math.abs(b - kmh) < Math.abs(a - kmh) ? b : a), SPEEDS[0])
  return `C-033-${best}`
}

export function signCodeFor(type: SignType, speed?: number): string {
  switch (type) {
    case 'stop':
      return 'B-002'
    case 'give_way':
      return 'B-001'
    case 'priority_road':
      return 'B-003'
    case 'crossing':
      return 'E-038'
    case 'roundabout':
      // Magyarországon a körforgalom bejáratánál elsőbbségadás kötelező tábla áll
      return 'B-001'
    case 'speed':
      return speedSignCode(speed ?? 50)
    case 'rail':
      // Andráskereszt a vasúti átjárónál
      return 'A-041'
    case 'tram':
      return 'E-041'
    case 'bus':
      return 'E-039'
  }
}

export interface SceneSigns {
  /** A saját irányunkban, a kereszteződés/átkelő előtt */
  mine: string[]
  /** A keresztező úton, a partnerek felé fordítva */
  cross: string[]
  /** Előre jelző tábla a közeledés elején (pl. körforgalom) */
  approach: string[]
}

/** A célút elején (kanyarodás után) álló táblák: ezek nem a saját oszlopunkra kerülnek */
export const TARGET_ROAD_SIGNS = new Set(['E-012'])

export function signsForScene(scene: Scene): SceneSigns & { target: string[] } {
  if (scene.roadSign) return { mine: [scene.roadSign], cross: [], approach: [], target: [] }
  const main = scene.mySign ? [signCodeFor(scene.mySign, scene.speed)] : []
  // A helyszínen valóban álló további táblák (OSM), a fő tábla alatt; legfeljebb kettő, hogy olvasható maradjon
  const extra = (scene.extraSigns ?? []).filter((c) => !main.includes(c) && SIGN_BY_CODE.has(c))
  // Körforgalom bejáratánál az elsőbbségadás mellett a „Körforgalom” utasító tábla is áll
  if (scene.mySign === 'roundabout') main.push('D-017')
  // Úton folyó munkák: a munkaterület elején a „Kikerülési irány: balra” tábla
  if (scene.hazard === 'roadworks') main.push('D-015')
  const approach =
    scene.mySign === 'roundabout'
      ? ['A-056']
      : scene.rail
        ? [scene.rail.barrier ? 'A-038' : 'A-039', 'A-045']
        : scene.transit?.kind === 'tram' && !scene.transit.island
          ? ['A-053+H-023']
          : scene.hazard === 'roadworks'
            ? ['A-025']
            : []
  return {
    mine: [...main, ...extra.filter((c) => !TARGET_ROAD_SIGNS.has(c) && !approach.includes(c) && !main.includes(c)).slice(0, 2)],
    cross: scene.crossSign ? [signCodeFor(scene.crossSign)] : [],
    approach,
    target: scene.turn !== 'straight' ? extra.filter((c) => TARGET_ROAD_SIGNS.has(c)) : [],
  }
}

/**
 * Az OpenStreetMap `traffic_sign` címkéjének értelmezése (pl. „HU:B-001”, „HU:C033[70]”, „stop”, „maxspeed”).
 * Csak az appban meglévő táblákat adja vissza. A „city_limit” jelentése irányfüggő (kezdete/vége),
 * ezért azt külön, `city_limit` jelöléssel adja vissza.
 */
export function parseTrafficSign(tags: Record<string, string> | undefined): string[] {
  const value = tags?.traffic_sign
  if (!value) return []
  const out: string[] = []
  for (const raw of value.split(/[;,]/)) {
    const token = raw.trim()
    let code: string | null = null
    if (token === 'city_limit') code = 'city_limit'
    else if (token === 'stop') code = 'B-002'
    else if (token === 'give_way' || token === 'yield') code = 'B-001'
    else if (token === 'maxspeed') {
      const v = Number.parseInt(tags?.maxspeed ?? '', 10)
      code = Number.isFinite(v) ? `C-033-${v}` : null
    } else {
      const m = /^(?:HU:)?([A-G])[-_ ]?0*(\d{1,3})(?:\[(\d+)\])?$/i.exec(token)
      if (m) {
        const base = `${m[1].toUpperCase()}-${m[2].padStart(3, '0')}`
        code = m[3] ? `${base}-${Number(m[3])}` : base
      }
    }
    if (code && (code === 'city_limit' || SIGN_BY_CODE.has(code)) && !out.includes(code)) out.push(code)
  }
  return out
}

/** A helyzet jelképe a térképen és a szerkesztőben */
export function signForSituation(s: Pick<Situation, 'kind' | 'speedTo'>): string {
  const byKind: Record<SituationKind, string> = {
    stop: 'B-002',
    give_way: 'B-001',
    priority: 'B-003',
    equal: 'A-027',
    signals: 'A-026',
    roundabout: 'A-056',
    crossing: 'E-038',
    speed_change: s.speedTo ? speedSignCode(s.speedTo) : 'C-043',
    rail_crossing: 'A-041',
    tram_stop: 'E-041',
    bus_stop: 'E-039',
    hazard: 'A-053',
  }
  return byKind[s.kind]
}
