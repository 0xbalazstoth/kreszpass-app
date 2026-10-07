import type { Pose, Segment } from '../maneuvers/geometry'
import type { Look, SiteRect } from '../maneuvers/types'
import type { LightState, RailLight } from '../questions'

/**
 * A minősítő lap hibakódjainak bemutatói: minden kódhoz egy rövid jelenet, amely lépésenként lejátszható.
 * A sorrend mindig: helyzet → hibás végrehajtás → helyes végrehajtás. A hibás és a helyes ág ugyanonnan indul
 * (a helyzet végéről), így a kettő közvetlenül összevethető.
 *
 * Koordináták, mint a manővereknél és a 3D jelenetben: x kelet, z dél (méter), irány 0 = észak (−z).
 * A saját autó a mi sávunkban (x ∈ [0, 3,5]) észak felé halad. Autó póza a hátsó tengely közepe;
 * a többi szereplőé (busz, kerékpár, gyalogos, mentő) a test közepe.
 */

/** Kulcskocka: [a lépésen belüli idő 0..1, érték] */
export type Key<T> = [number, T]
/** Kulcskockák időrendben; számnál lineáris az átmenet, minden másnál lépcsős */
export type Track<T> = Key<T>[]

export type ActorKind = 'own' | 'car' | 'bus' | 'bike' | 'ped' | 'ambulance' | 'tram' | 'train'
export type Blink = 'off' | 'left' | 'right' | 'hazard'

export interface Actor {
  id: string
  kind: ActorKind
  color?: string
  start: Pose
}

export interface Move {
  /** Az út a lépés alatt; nélküle a szereplő áll */
  path: Segment[]
  /** A megtett út hányada (0..1) az idő függvényében; alapból egyenletes */
  profile?: Track<number>
}

/** Sebességfokozat a műszerfalon */
export type GearPos = 'N' | 'R' | '1' | '2' | '3' | '4' | '5'
export type HeadLights = 'off' | 'low' | 'high' | 'fog'

/** A saját autó kezelőszervei és műszerei */
export interface ControlState {
  /** km/h */
  speed: number
  /** fordulat/perc; negatív = a sebességből és a fokozatból számolva */
  rpm: number
  gear: GearPos
  /** Pedálok lenyomása 0..1 */
  clutch: number
  brake: number
  gas: number
  handbrake: boolean
  seatbelt: boolean
  engine: boolean
  lights: HeadLights
  indicator: Blink
  /** Kormány elfordulása fordulatban (+ = jobbra); ha nincs megadva, az útból számoljuk */
  steer: number | null
}

export type Controls = { [K in keyof ControlState]?: Track<ControlState[K]> }

/** Jelölések a felülnézeten (a 3D nézetben nem látszanak) */
export type Mark =
  /** Élő távolság két szereplő között (m-ben kiírva) */
  | { kind: 'gap'; a: string; b: string; bad?: boolean }
  /** Kiemelt terület (pl. „itt kellett volna megállni”) */
  | { kind: 'zone'; rect: SiteRect; bad?: boolean; label?: string }
  /** Felirat a helyszínen */
  | { kind: 'label'; at: [number, number]; text: string; bad?: boolean }

/**
 * A lépés szerepe: a hibakód-leckékben helyzet → hibás → helyes (a hibás és a helyes ág a helyzet végéről indul);
 * a forgalmi helyzetek bemutatóiban `step`: egyszerűen az előzőre épülő lépés.
 */
export type Phase = 'setup' | 'wrong' | 'right' | 'step'

export interface FaultStep {
  phase: Phase
  title: string
  /** Mit lát / mit csinál a vezető, mi a hiba és miért (legalább két mondat) */
  how: string[]
  /** A lépés hossza 1×-es tempónál (ms); alapból a leghosszabb út szerint */
  ms?: number
  /** Szereplőnként a mozgás; aki nincs itt, az áll (vagy a szereplőnél megadott alapmozgással halad) */
  moves?: Record<string, Move>
  controls?: Controls
  /** Lámpánként a jelzés */
  signals?: Record<string, Track<LightState>>
  /** Szereplők irányjelzője (a sajátunkét a controls.indicator adja) */
  blinks?: Record<string, Track<Blink>>
  look?: Track<Look>
  marks?: Mark[]
  /** A vasúti átjáró fényjelzője és a félsorompó (lezárva = true) */
  rail?: Track<RailLight>
  barrier?: Track<boolean>
  /** Gyakori hibák ennél a lépésnél, a minősítő lap kódjával */
  mistakes?: { code: string; text: string }[]
}

export interface WorldLight {
  id: string
  x: number
  z: number
  /** Merre néz a lámpa (a felé haladók látják): 0 = dél felé (felénk, ahogy északra haladunk) */
  facing: number
  /** Jobbra mutató zöld kiegészítő nyíl: a jelzését ezen az azonosítón adjuk meg ('green' = ég, minden más = nem ég) */
  arrow?: string
}

export interface WorldSign {
  code: string
  x: number
  z: number
  facing: number
}

export interface WorldBuilding {
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
}

export interface World {
  asphalt: SiteRect[]
  /** Járdák (a 3D-ben megemelve, szegéllyel) */
  sidewalks: SiteRect[]
  markings: SiteRect[]
  /** Víztócsák (4/11) */
  puddles?: SiteRect[]
  lights?: WorldLight[]
  signs?: WorldSign[]
  buildings?: WorldBuilding[]
  /** A helyszín kiterjedése a felülnézeten: [nyugat, észak, kelet, dél] */
  bounds: [number, number, number, number]
  /** Körforgalom körpályája (a középpont az origó) */
  ring?: { inner: number; outer: number }
  /** Vasúti átjáró: a sínpár középvonala (z), a fényjelző helye, és van-e félsorompó (a mi sávunk előtt) */
  rail?: { z: number; lightAt?: { x: number; z: number }; barrier?: { x: number; z: number; length: number } }
  /** Álló tárgyak: villamossínek (z irányban), járdasziget */
  extras?: { kind: 'tram_track' | 'island'; x: number; z: number; w: number; d: number; rotY?: number }[]
  /** Éjszaka (a felülnézet sötét, a fényszóró fénykévéje látszik) */
  night?: boolean
  /** Követő nézet: a felülnézet ekkora ablakban (szélesség, magasság m) a saját autót követi */
  view?: [number, number]
}

/** Egy lejátszható jelenet: helyszín, szereplők, lépések */
export interface Lesson {
  title: string
  summary: string
  world: World
  actors: Actor[]
  steps: FaultStep[]
}

export interface FaultLesson extends Lesson {
  /** A minősítő lap kódja (a lap szövege az EVAL_CODES-ban) */
  code: string
}
