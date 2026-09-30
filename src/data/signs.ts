import type { Scene, SignType } from '../domain/questions'
import type { Situation, SituationKind } from '../domain/types'
import manifest from './signs.json'

/**
 * Valódi magyar KRESZ táblák (Wikimedia Commons, közkincs: PD-HU-exempt).
 * A képeket a `npm run signs` script tölti le a public/signs mappába.
 */

export type SignGroup = 'elsobbsegi' | 'tilalmi' | 'utasito' | 'veszely' | 'tajekoztato'

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
  elsobbsegi: 'Elsőbbséget szabályozó',
  veszely: 'Veszélyt jelző',
  tilalmi: 'Tilalmi',
  utasito: 'Utasítást adó',
  tajekoztato: 'Tájékoztató',
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

export function signsForScene(scene: Scene): SceneSigns {
  return {
    mine: scene.mySign ? [signCodeFor(scene.mySign, scene.speed)] : [],
    cross: scene.crossSign ? [signCodeFor(scene.crossSign)] : [],
    approach: scene.mySign === 'roundabout' ? ['A-056'] : [],
  }
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
  }
  return byKind[s.kind]
}
