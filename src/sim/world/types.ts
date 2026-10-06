import type { Projection, XZ } from './project'
import type { Poly } from './streets'

/** Egy út (OSM-szakasz) a szimulátor síkjában */
export interface Road {
  /** Egyedi sorszám (egy OSM-út a folyosóból kilépve több darabra eshet) */
  id: number
  wayId: number
  pts: XZ[]
  nodes: number[]
  /** Az egyes pontok távolsága az út elejétől (m) */
  cum: number[]
  length: number
  halfWidth: number
  /** Szélesebb folytatásnál: a félszélesség az út elején, illetve végén (onnan keskenyedik a saját szélességére) */
  hwStart?: number
  hwEnd?: number
  laneWidth: number
  /** Sávok a rajzolási irányban (előre) és vele szemben */
  lanesFwd: number
  lanesBack: number
  /** 1: csak előre, −1: csak visszafelé, 0: kétirányú */
  oneway: 1 | -1 | 0
  highway: string
  /** Az út rangja (autópálya 7 … lakó-pihenő övezet 0) és hogy kitáblázott főútvonal-e */
  rank: number
  priority: boolean
  name: string
  /** km/h */
  maxspeed: number
  roundabout: boolean
  /** Van-e burkolati jel (felezővonal) */
  marked: boolean
  /** Járda a jobb, illetve a bal oldalon: belső és külső széle a középvonaltól (m), ha van */
  walkR?: [number, number]
  walkL?: [number, number]
}

/** Kereszteződés (vagy két út találkozása): kitöltő kör az úttesten */
export interface Junction {
  node: number
  at: XZ
  /** A kitöltő burkolat sugara (a sarkok lekerekítésével együtt) */
  radius: number
  /** A legszélesebb befutó út félszélessége: a megállási vonalak ettől kicsit kijjebb vannak */
  core: number
  /** Hány útág fut be (3+ = valódi kereszteződés) */
  arms: number
  /**
   * Lekerekített (itt: levágott) sarkok két szomszédos útág között: háromszögek a két út szegélyvonalának
   * metszéspontjánál. Ezek is úttestnek számítanak, így a kanyarodó autó nem megy fel a sarkon a járdára.
   */
  fillets: Array<[XZ, XZ, XZ]>
  /**
   * Útáganként (`${road.id}:${dir}`, dir a csomópont felé haladás iránya) a kereszteződés széle a csomóponttól (m):
   * itt végződik az ág burkolata, és kezdődik a kereszteződésé (az osm2streets szerint)
   */
  trims?: Record<string, number>
}

/** Négyszög (a sarkok sorrendje körben) */
export type Quad = [XZ, XZ, XZ, XZ]

/** Járdadarab: a négyszög és az úttest felőli éle (a szegélykő) */
export interface PavementPiece {
  quad: Quad
  kerb: [XZ, XZ]
  /** A rács-cella (a rajzolás darabolásához) */
  chunk: string
}

/** Festett burkolati jel: téglalap, középpont, irány (a hossza ebbe az irányba esik) */
export interface Stripe {
  at: XZ
  heading: number
  length: number
  width: number
}

export interface SimBuilding {
  x: number
  z: number
  /** Homlokzat hossza (az út mentén) és mélység */
  w: number
  d: number
  h: number
  /** Y körüli forgatás (a homlokzat az út felé néz) */
  rotY: number
  color: string
}

export interface SignSite {
  codes: string[]
  at: XZ
  /** 0 = a tábla a +Z felé néz (az észak felé haladók látják) */
  rotY: number
}

export interface LightSite {
  at: XZ
  rotY: number
  controller: number
  phase: 0 | 1
  /** A megállási vonal közepe és a megközelítés iránya (a szabályfigyeléshez) */
  stopAt: XZ
  heading: number
  /** Ismétlő lámpa a kereszteződés túloldalán (a megállási vonalnál várakozó is látja); a szabályfigyelés nem ezt nézi */
  repeater?: boolean
}

/** STOP vagy elsőbbségadás kötelező: a megállási vonal közepe, a megközelítés iránya és a sávok félszélessége */
export interface StopSite {
  kind: 'stop' | 'give_way'
  at: XZ
  heading: number
  halfSpan: number
}

/** Kijelölt gyalogos-átkelőhely (zebra): közepe, az út iránya és az úttest félszélessége */
export interface CrossingSite {
  at: XZ
  heading: number
  halfWidth: number
}

export interface FurnitureSite {
  kind: 'lamp' | 'tree'
  x: number
  z: number
  rotY: number
}

/** A vizsgaútvonal a síkon */
export interface RoutePath {
  pts: XZ[]
  cum: number[]
  length: number
}

export interface World {
  proj: Projection
  roads: Road[]
  junctions: Junction[]
  pavements: PavementPiece[]
  markings: Stripe[]
  buildings: SimBuilding[]
  furniture: FurnitureSite[]
  signs: SignSite[]
  lights: LightSite[]
  stops: StopSite[]
  crossings: CrossingSite[]
  /** Lámpacsoportok időeltolása (s) */
  controllers: number[]
  route: RoutePath
  start: { x: number; z: number; heading: number }
  /** [minX, minZ, maxX, maxZ] */
  bounds: [number, number, number, number]
  /** Valósághű utcageometria (osm2streets); nélküle az utak egyszerű szalagok */
  streets?: StreetSurfaces
}

export interface StreetSurfaces {
  asphalt: Poly[]
  junctions: Poly[]
  pavement: Poly[]
  kerbs: Poly[]
  paint: Poly[]
}
