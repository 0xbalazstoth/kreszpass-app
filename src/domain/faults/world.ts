import type { SiteRect } from '../maneuvers/types'
import type { World, WorldBuilding, WorldLight, WorldSign } from './types'

/**
 * Helyszínsablonok a leckékhez, a 3D jelenet egyezményeivel: a mi utunk az x = 0 tengely mentén, észak–déli irányban,
 * a mi sávunk x ∈ [0, 3,5], a szembejövőé x ∈ [−3,5, 0]. Kereszteződésnél a középpont az origó.
 */

export const LANE = 3.5
export const SIDEWALK = 2.5
/** A parkolósáv szélessége (m) */
export const PARKING = 2.3
/** A parkolósávban álló autó hátsó tengelyének x helye (a kocsi közepe a sáv közepén) */
export const PARKED_X = LANE + PARKING / 2
const LINE_W = 0.15
const BUILDING_COLORS = ['#e7dccb', '#d9c7a7', '#cbd5e1', '#e5e7eb', '#d6b9a0', '#c7d2c0']

/** Szaggatott vonal a z tengely mentén (x-ben rögzítve), from → to */
export function dashesZ(x: number, from: number, to: number, len = 3, gap = 3): SiteRect[] {
  const out: SiteRect[] = []
  const [a, b] = from < to ? [from, to] : [to, from]
  for (let z = a; z + len <= b; z += len + gap) out.push({ x, z: z + len / 2, w: LINE_W, d: len })
  return out
}

export function dashesX(z: number, from: number, to: number, len = 3, gap = 3): SiteRect[] {
  const out: SiteRect[] = []
  const [a, b] = from < to ? [from, to] : [to, from]
  for (let x = a; x + len <= b; x += len + gap) out.push({ x: x + len / 2, z, w: len, d: LINE_W })
  return out
}

/** Folytonos vonal a z tengely mentén */
export const solidZ = (x: number, from: number, to: number): SiteRect => ({ x, z: (from + to) / 2, w: LINE_W, d: Math.abs(to - from) })

/** Gyalogos-átkelőhely (zebra) az úton keresztben, a z helyen */
export function zebra(z: number, halfWidth = LANE, depth = 3): SiteRect[] {
  const out: SiteRect[] = []
  for (let x = -halfWidth + 0.35; x < halfWidth; x += 1.0) out.push({ x, z, w: 0.5, d: depth })
  return out
}

/** Stopvonal a mi sávunkban (a z helyen) */
export const stopLine = (z: number): SiteRect => ({ x: LANE / 2, z, w: LANE, d: 0.4 })

/** Elsőbbségadás kötelező: cápafog-sor a mi sávunkban */
export const sharkTeeth = (z: number): SiteRect[] => [0.4, 1.2, 2.0, 2.8].map((x) => ({ x, z, w: 0.5, d: 0.5 }))

/** Determinisztikus házsor egy oldalon (a 3D nézet hátteréhez) */
export function buildingRow(x: number, from: number, to: number, seed = 1, depth = 10): WorldBuilding[] {
  const out: WorldBuilding[] = []
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const [a, b] = from < to ? [from, to] : [to, from]
  for (let z = a; z < b; ) {
    const w = 9 + rnd() * 8
    const len = Math.min(w, b - z)
    if (len > 4) out.push({ x: x + Math.sign(x) * (depth / 2), z: z + len / 2, w: depth, d: len - 1.5, h: 6 + rnd() * 9, color: BUILDING_COLORS[Math.floor(rnd() * BUILDING_COLORS.length)] })
    z += w
  }
  return out
}

export interface RoadOpts {
  /** Az út déli és északi vége (z) */
  south?: number
  north?: number
  /** Parkolósáv a jobb oldalon (a mi sávunk mellett, a járda előtt) */
  parking?: boolean
  /** Felezővonal: szaggatott (alap) vagy folytonos */
  centre?: 'dashed' | 'solid' | 'none'
  buildings?: boolean
  /** A felülnézet szélessége (m), alapból az út és a járdák */
  viewHalfWidth?: number
}

/** Egyenes, kétirányú (vagy kétsávos egyirányú) utca járdával */
export function straightRoad(o: RoadOpts = {}): World {
  const south = o.south ?? 80
  const north = o.north ?? -80
  const len = south - north
  const mid = (south + north) / 2
  const markings: SiteRect[] = o.centre === 'solid' ? [solidZ(0, north, south)] : o.centre === 'none' ? [] : dashesZ(0, north, south)
  const pk = o.parking ? PARKING : 0
  const half = LANE + SIDEWALK + pk
  const vh = o.viewHalfWidth ?? half + 2
  return {
    asphalt: [{ x: pk / 2, z: mid, w: 2 * LANE + pk, d: len }],
    sidewalks: [
      { x: LANE + pk + SIDEWALK / 2, z: mid, w: SIDEWALK, d: len },
      { x: -LANE - SIDEWALK / 2, z: mid, w: SIDEWALK, d: len },
    ],
    markings,
    buildings: o.buildings === false ? [] : [...buildingRow(half + 3, north, south, 1), ...buildingRow(-(LANE + SIDEWALK) - 3, north, south, 2)],
    bounds: [-vh, north, vh, south],
    view: [2 * vh, 46],
  }
}

export interface JunctionOpts {
  /** Az ágak hossza a középponttól */
  arm?: number
  /** A mi águnkon: stopvonal (lámpa, STOP) vagy cápafogak (elsőbbségadás kötelező) */
  myLine?: 'stop' | 'give_way'
  /** Zebra a mi águnkon a kereszteződés előtt */
  zebra?: boolean
  /** A mi utunk (észak–dél) egyirányú, két sávval észak felé; a felezővonal helyén sávelválasztó, a kereszteződésben terelővonal */
  oneWayNS?: boolean
  buildings?: boolean
}

/** A kereszteződés szélétől (a járda külső szélétől) mérve a mi stopvonalunk helye */
export const JUNCTION_EDGE = LANE + SIDEWALK
export const STOP_Z = JUNCTION_EDGE + 0.8

/** Négyágú, kétirányú utakkal alkotott kereszteződés, középpont az origó */
export function junction(o: JunctionOpts = {}): World {
  const L = o.arm ?? 60
  const edge = JUNCTION_EDGE
  // Saroktömbönként két járdatéglalap; a sarok (ahol a kettő találkozna) úttest: ez a sarok lekerekítése, hogy a
  // jobbra kanyarodó kerék ne érjen a járdára
  const sidewalks: SiteRect[] = []
  const corners: SiteRect[] = []
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      sidewalks.push({ x: sx * (edge + (L - edge) / 2), z: sz * (LANE + SIDEWALK / 2), w: L - edge, d: SIDEWALK })
      sidewalks.push({ x: sx * (LANE + SIDEWALK / 2), z: sz * (edge + (L - edge) / 2), w: SIDEWALK, d: L - edge })
      corners.push({ x: sx * (LANE + SIDEWALK / 2), z: sz * (LANE + SIDEWALK / 2), w: SIDEWALK, d: SIDEWALK })
    }
  const markings: SiteRect[] = [...dashesZ(0, edge + 1, L), ...dashesZ(0, -edge - 1, -L), ...dashesX(0, edge + 1, L), ...dashesX(0, -edge - 1, -L)]
  if (o.myLine === 'stop') markings.push(stopLine(STOP_Z))
  if (o.myLine === 'give_way') markings.push(...sharkTeeth(STOP_Z))
  if (o.zebra) markings.push(...zebra(edge + 2.6))
  if (o.oneWayNS) markings.push(...dashesZ(0, -edge, edge, 1, 1.5))
  const off = LANE + SIDEWALK + 3
  return {
    asphalt: [{ x: 0, z: 0, w: 2 * LANE, d: 2 * L }, { x: 0, z: 0, w: 2 * L, d: 2 * LANE }, ...corners],
    sidewalks,
    markings,
    buildings:
      o.buildings === false
        ? []
        : [
            ...buildingRow(off, edge + 4, L, 3),
            ...buildingRow(-off, edge + 4, L, 4),
            ...buildingRow(off, -L, -edge - 4, 5),
            ...buildingRow(-off, -L, -edge - 4, 6),
          ],
    bounds: [-22, -22, 22, 30],
  }
}

/** Lámpa a mi águnkon, jobb oldalt a stopvonalnál (és a túloldalon az ismétlő) */
export function myLights(id = 'L'): WorldLight[] {
  return [
    { id, x: LANE + 1.0, z: JUNCTION_EDGE + 0.6, facing: 0 },
    { id, x: LANE + 1.0, z: -(JUNCTION_EDGE + 0.6), facing: 0 },
  ]
}

/** Tábla a mi utunk jobb oldalán, felénk fordulva */
export const signRight = (code: string, z: number): WorldSign => ({ code, x: LANE + 1.2, z, facing: 0 })

/** Több helyszínrész egyesítése (a határ az elsőé, ha nincs megadva) */
export function withWorld(base: World, extra: Partial<World>): World {
  return {
    asphalt: [...base.asphalt, ...(extra.asphalt ?? [])],
    sidewalks: [...base.sidewalks, ...(extra.sidewalks ?? [])],
    markings: [...base.markings, ...(extra.markings ?? [])],
    puddles: [...(base.puddles ?? []), ...(extra.puddles ?? [])],
    lights: [...(base.lights ?? []), ...(extra.lights ?? [])],
    signs: [...(base.signs ?? []), ...(extra.signs ?? [])],
    buildings: [...(base.buildings ?? []), ...(extra.buildings ?? [])],
    bounds: extra.bounds ?? base.bounds,
    view: 'view' in extra ? extra.view : base.view,
    night: extra.night ?? base.night,
  }
}
