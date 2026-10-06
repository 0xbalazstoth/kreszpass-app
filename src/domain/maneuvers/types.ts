import type { CarPoint, Gear, Pose, Segment } from './geometry'

/** Téglalap a helyszínen (méter, középpont és kiterjedés; rotY a 3D jelenet szerinti forgatás) */
export interface SiteRect {
  x: number
  z: number
  w: number
  d: number
  rotY?: number
}

export interface ParkedCar {
  pose: Pose
  color: string
}

/** A manőver helyszíne: úttest, járdaszegélyek, burkolati jelek, parkoló autók és a cél */
export interface Site {
  asphalt: SiteRect[]
  /** Kiemelt szegélyek, járda: ezekhez nem érhet a kocsi (8/19) */
  kerbs: SiteRect[]
  /** Fehér burkolati jelek */
  markings: SiteRect[]
  cars: ParkedCar[]
  /** Ahol a kocsinak a végén állnia kell, és a megengedett eltérés */
  target: { pose: Pose; posTol: number; headTol: number }
  /** A felülnézeti rajz kerete: [nyugat, észak, kelet, dél] (x, z) */
  bounds: [number, number, number, number]
}

/** Merre néz a vezető a lépés alatt */
export type Look = 'ahead' | 'down' | 'left' | 'right' | 'mirror_left' | 'mirror_right' | 'mirror_inner' | 'shoulder_left' | 'shoulder_right' | 'back'

export interface ManeuverStep {
  title: string
  /** A teendők sorrendben, részletesen: körültekintés, kormány, sebességfokozat, tempó, index */
  how: string[]
  /** Mihez igazodj (a referenciapont szóban) */
  cue?: string
  /**
   * A lépés elején ennek a kocsipontnak ezen a vonalon kell lennie: axis 'z' = a pont z koordinátája egyezik az `at`
   * z-jével (keresztirányú vonal), 'x' = az x-e. A tesztek ellenőrzik, hogy a szöveg és a mozgás egyezik.
   */
  ref?: { car: CarPoint; at: [number, number]; axis: 'x' | 'z'; label: string }
  /** A lépés mozgása; üres = állva végzett teendők (körültekintés, sebességváltás) */
  motion: Segment[]
  gear: Gear | 'N'
  indicator?: 'left' | 'right'
  look: Look
  /** Gyakori hibák a minősítő lap kódjával */
  mistakes?: { code: string; text: string }[]
}

export interface Maneuver {
  id: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7'
  title: string
  /** Egy mondatos összefoglaló a kártyán */
  summary: string
  site: Site
  start: Pose
  steps: ManeuverStep[]
  /** Ennek a lépésnek a végén kell a célban állni (alapból az utolsó; beállás+kiállásnál a beállás vége) */
  targetAfter?: number
  /** Mit néz a vizsgabiztos: kódok és rövid magyarázat */
  exam: { code: string; text: string }[]
}
