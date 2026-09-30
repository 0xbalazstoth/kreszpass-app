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
  /** Az utcanevekből összeállított útvonal bemenete (település + utca soronként), hogy később szerkeszthető legyen */
  streets?: StreetRow[]
  createdAt: number
  updatedAt: number
}

/** Utcalista egy sora: település/kerület és utca vagy útszám. Üres település = a fölötte lévő soré. */
export interface StreetRow {
  town: string
  street: string
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
  | 'rail_crossing'
  | 'tram_stop'
  | 'bus_stop'
  /** Váratlan helyzet (akadály, mentő stb.): nem térképadatból, hanem a vezetés elején generálva */
  | 'hazard'

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
  /** generated: a vezetés elején véletlenszerűen elhelyezett váratlan helyzet, nincs eltárolva */
  source: 'osm' | 'mapillary' | 'manual' | 'generated'
  note?: string
  /**
   * A helyszínen ténylegesen álló (az OpenStreetMap-adatokból levezetett vagy ott kitáblázott) táblák kódjai,
   * a közeledés irányából. A kérdés fő tábláján felül ezek is megjelennek a 3D nézetben és a térképen.
   */
  signs?: string[]
  /** Vasúti átjárónál: van-e sorompó, illetve fénysorompó */
  rail?: { barrier: boolean; lights: boolean }
  /**
   * Körforgalomnál a valós adatokból: hányadik kijáraton hajtunk ki, hány kijárata van,
   * hány forgalmi sávos a körpálya, és a kihajtás iránya a behajtáshoz képest
   */
  roundabout?: RoundaboutInfo
  /** Villamos- vagy autóbuszmegállónál: a megálló fajtája, és (villamosnál) van-e járdasziget; ismeretlen = undefined */
  transit?: { kind: 'tram' | 'bus'; island?: boolean }
}

export interface RoundaboutInfo {
  exit: number
  exits: number
  lanes: number
  turn: Turn
}

/** Ennyire sűrűn kerülnek váratlan helyzetek az útvonalra */
export type HazardDensity = 'off' | 'few' | 'many'

/** tour: a teljes útvonal végigvezetése a vizsgabiztos hangos utasításaival */
export type Mode = 'practice' | 'exam' | 'review' | 'tour'

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

export interface SignCard {
  code: string
  card: Card
}

export interface SignResult {
  code: string
  correct: boolean
  /** A válaszlehetőségek megjelenésétől mért idő; null, ha lejárt az idő */
  reactionMs: number | null
}

export interface SignSession {
  id: string
  startedAt: number
  finishedAt?: number
  group: string
  results: SignResult[]
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
  /** A közeledés (3D jelenet, térképes repülés, utcaképek) időtartama (ms) */
  approachMs: number
  /** 3D nézet a vezetőülésből */
  view3d: boolean
  /** Domborzat a térképen */
  terrain: boolean
  /** Táblafelismerő gyakorlás: ennyi ideig látszik a tábla (ms) */
  signFlashMs: number
  /** Próbavizsgán minden válasz után rövid visszajelzés (helyes-e, kód), magyarázat nélkül */
  examFeedback: boolean
  /** Mozdulat-gyakorlás a közeledés alatt (tükör, index, fék) */
  actionDrill: boolean
  /** Teljes útvonalon a vizsgabiztos hangos utasításai */
  examinerVoice: boolean
  /** Teljes útvonalon a haladási sebesség (km/h) */
  tourSpeedKmh: number
  /** Váratlan helyzetek (akadály, labda, mentő…) az útvonal egyenes szakaszain */
  hazards: HazardDensity
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  mapillaryToken: '',
  okMs: 4000,
  lateMs: 7000,
  timeoutMs: 12000,
  approachMs: 2500,
  view3d: true,
  terrain: true,
  signFlashMs: 1200,
  examFeedback: true,
  actionDrill: false,
  examinerVoice: true,
  tourSpeedKmh: 40,
  hazards: 'few',
}
