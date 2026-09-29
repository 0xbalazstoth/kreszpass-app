import type { LineString } from 'geojson'
import type { Card } from 'ts-fsrs'

export interface Route {
  id: string
  name: string
  /** A minősítő lap „Vizsgaútvonal-azonosító” mezője */
  examRouteId?: string
  line: LineString
  /** Kézzel lerakott útpontok (az útra illesztés előtti állapot) */
  waypoints: [number, number][]
  createdAt: number
  updatedAt: number
}

export type SituationKind =
  | 'stop'
  | 'give_way'
  | 'priority'
  | 'equal'
  | 'signals'
  | 'roundabout'
  | 'crossing'
  | 'speed_change'

export type Turn = 'straight' | 'left' | 'right'

export interface Situation {
  id: string
  routeId: string
  /** Távolság az útvonal elejétől, méterben */
  d: number
  lng: number
  lat: number
  /** Haladási irány a helyzet előtt (fok, észak = 0) */
  bearing: number
  kind: SituationKind
  turn: Turn
  /** Sebességváltozásnál: eddigi és új korlát (km/h) */
  speedFrom?: number
  speedTo?: number
  /** A generátor bizonytalan, kézzel ellenőrizni kell */
  needsReview: boolean
  source: 'osm' | 'mapillary' | 'manual'
  note?: string
}

export type Mode = 'practice' | 'exam' | 'review'

export type Outcome = 'ok' | 'late' | 'slow' | 'wrong' | 'timeout'

export interface Attempt {
  situationId: string
  promptId: string
  /** A kérdés címe megjelenítéshez */
  promptTitle?: string
  reactionMs: number | null
  chosen: number | null
  outcome: Outcome
  /** A minősítő lap kódjai, amelyeket ez a válasz kiváltott */
  codes: string[]
  at: number
}

export interface ExamSession {
  id: string
  routeId: string | null
  mode: Mode
  startedAt: number
  finishedAt?: number
  attempts: Attempt[]
}

export interface SituationCard {
  situationId: string
  routeId: string
  card: Card
}

export interface Settings {
  id: 'settings'
  mapillaryToken: string
  /** Eddig helyes és időben (ms) */
  okMs: number
  /** Eddig „kissé késve” → 6/4 */
  lateMs: number
  /** Eddig „lassan ismeri fel” → 6/2, utána időtúllépés → 8/25 */
  timeoutMs: number
  /** A közeledés képkockáinak ideje (ms) */
  frameMs: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  mapillaryToken: '',
  okMs: 4000,
  lateMs: 7000,
  timeoutMs: 12000,
  frameMs: 700,
}
