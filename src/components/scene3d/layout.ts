import { signsForScene } from '../../data/signs'
import type { LightState, Scene, SceneCar, Side } from '../../domain/questions'
import type { Turn } from '../../domain/types'

/**
 * A kérdés vázlatleírásából (Scene) egy 3D világ elrendezése, méterben.
 *
 * Koordináták: Y felfelé. A saját autónk a −Z irányba halad, a kereszteződés közepe az origó.
 * Jobb oldali közlekedés: a mi sávunk x ∈ [0, 3.5], a szembejövőé x ∈ [−3.5, 0].
 * A keresztező úton a balról érkező (+X felé haladó) a z ∈ [0, 3.5], a jobbról érkező a z ∈ [−3.5, 0] sávban halad.
 * Ez a modul tiszta logika, hogy tesztelhető legyen; a rajzolást a parts.tsx végzi.
 */

export const LANE = 3.5
export const HALF = LANE // kétsávos út fele
export const SIDEWALK = 2.5
export const RING_OUTER = 14
export const RING_INNER = 7

export interface Rect {
  /** Középpont */
  x: number
  z: number
  /** Kiterjedés X és Z irányban */
  w: number
  d: number
}

export interface SignPost3D {
  codes: string[]
  x: number
  z: number
  /** Y tengely körüli forgatás: 0 = a tábla a +Z felé néz (felénk, ahogy közeledünk) */
  rotY: number
  size: number
}

export interface Light3D {
  x: number
  z: number
  rotY: number
  state: LightState
  /** Lámpa magassága (m) */
  height: number
}

export interface Car3D {
  color: string
  /** Kezdő- és megállási pont */
  from: [number, number]
  to: [number, number]
  rotY: number
  waiting: boolean
  /** Körforgalomban íven halad: szögek radiánban, középpont az origó */
  arc?: { r: number; a0: number; a1: number }
}

export interface Ped3D {
  from: [number, number]
  to: [number, number]
  state: 'crossing' | 'waiting'
  /** Merre néz álló helyzetben */
  rotY: number
}

export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
}

export interface Layout3D {
  kind: Scene['layout']
  asphalt: Rect[]
  sidewalks: Rect[]
  /** Fehér útburkolati jelek */
  markings: Rect[]
  ring?: { inner: number; outer: number }
  signs: SignPost3D[]
  lights: Light3D[]
  cars: Car3D[]
  peds: Ped3D[]
  blocker?: { x: number; z: number }
  buildings: Building[]
  camera: { x: number; y: number; startZ: number; stopZ: number }
  /** Megállás után a vezető ennyit fordítja a fejét (radián, + = balra), hogy lássa a partnert */
  lookYaw: number
  turn: Turn
}

const CAR_COLORS = ['#dc2626', '#f59e0b', '#16a34a', '#0f766e', '#7c3aed', '#e5e7eb', '#111827', '#9a3412']
const BUILDING_COLORS = ['#d6cfc4', '#c9b8a3', '#e4ddd2', '#b8b1a7', '#d9c6a5', '#c4c9cf', '#e8d5c0']

/** Determinisztikus álvéletlen a jelenet leírásából, hogy ugyanaz a kérdés mindig ugyanúgy nézzen ki */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/** Szaggatott vonal darabjai egy tengely mentén */
function dashes(axis: 'x' | 'z', from: number, to: number, fixed: number, len = 3, gap = 3, width = 0.15): Rect[] {
  const out: Rect[] = []
  const dir = Math.sign(to - from)
  for (let p = from; dir > 0 ? p < to : p > to; p += dir * (len + gap)) {
    const c = p + (dir * len) / 2
    out.push(axis === 'z' ? { x: fixed, z: c, w: width, d: len } : { x: c, z: fixed, w: len, d: width })
  }
  return out
}

/**
 * Zebra: a csíkok a forgalommal párhuzamosak.
 * axis 'z': a Z irányú úton (a csíkok Z irányban hosszúak, X mentén sorakoznak).
 */
function zebra(axis: 'x' | 'z', centre: number, across: [number, number], depth = 3): Rect[] {
  const out: Rect[] = []
  const [a, b] = across
  for (let p = a + 0.25; p < b - 0.2; p += 0.9) {
    out.push(axis === 'z' ? { x: p + 0.25, z: centre, w: 0.5, d: depth } : { x: centre, z: p + 0.25, w: depth, d: 0.5 })
  }
  return out
}

function buildingsAlong(rng: () => number, arms: Array<{ axis: 'x' | 'z'; from: number; to: number; offset: number }>): Building[] {
  const out: Building[] = []
  for (const arm of arms) {
    const dir = Math.sign(arm.to - arm.from)
    for (let p = arm.from; dir > 0 ? p < arm.to : p > arm.to; p += dir * (9 + rng() * 5)) {
      const w = 8 + rng() * 4
      const depth = 9 + rng() * 6
      const h = 7 + rng() * 16
      const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)]
      const side = Math.sign(arm.offset)
      const off = arm.offset + side * (depth / 2)
      out.push(
        arm.axis === 'z'
          ? { x: off, z: p + (dir * w) / 2, w: depth, d: w, h, color }
          : { x: p + (dir * w) / 2, z: off, w, d: depth, h, color },
      )
    }
  }
  return out
}

const HEADING: Record<Side, number> = {
  // Y körüli forgatás, amellyel a −Z felé néző modell a mozgás irányába fordul
  left: -Math.PI / 2, // balról jön, +X felé halad
  right: Math.PI / 2, // jobbról jön, −X felé halad
  ahead: Math.PI, // szemből jön, +Z felé halad
}

function junctionCar(c: SceneCar, color: string): Car3D {
  // A mozgó partner a kereszteződés széle előtt lassít meg (így nem dönti el a választ), a várakozó a vonalánál áll
  const stopGap = c.waiting ? 1.5 : 3
  const edge = HALF + SIDEWALK
  switch (c.from) {
    case 'left':
      return { color, from: [-(c.waiting ? edge + stopGap : 55), LANE / 2], to: [-(edge + stopGap), LANE / 2], rotY: HEADING.left, waiting: !!c.waiting }
    case 'right':
      return { color, from: [c.waiting ? edge + stopGap : 55, -LANE / 2], to: [edge + stopGap, -LANE / 2], rotY: HEADING.right, waiting: !!c.waiting }
    case 'ahead':
      return { color, from: [-LANE / 2, -(c.waiting ? edge + stopGap : 55)], to: [-LANE / 2, -(edge + stopGap)], rotY: HEADING.ahead, waiting: !!c.waiting }
  }
}

function buildRaw(scene: Scene): Layout3D {
  const rng = seeded(JSON.stringify(scene))
  const signs = signsForScene(scene)
  const carColor = () => CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]
  const L = 70 // az utak hossza a középponttól

  if (scene.layout === 'roundabout') {
    const R = RING_OUTER
    // A kérdés a bejárat előtt jön, amikor a tábla és a körben érkező még jól látszik
    const stopZ = R + 12
    const asphalt: Rect[] = [
      { x: 0, z: (R + L) / 2, w: 2 * HALF, d: L - R + 2 },
      { x: 0, z: -(R + L) / 2, w: 2 * HALF, d: L - R + 2 },
      { x: (R + L) / 2, z: 0, w: L - R + 2, d: 2 * HALF },
      { x: -(R + L) / 2, z: 0, w: L - R + 2, d: 2 * HALF },
    ]
    const markings: Rect[] = [
      ...dashes('z', R + 2, L, 0),
      ...dashes('z', -R - 2, -L, 0),
      ...dashes('x', R + 2, L, 0),
      ...dashes('x', -R - 2, -L, 0),
      // Elsőbbségadás („cápafog”) a bejáratnál
      ...[0.4, 1.2, 2.0, 2.8].map((x) => ({ x, z: R + 1, w: 0.5, d: 0.5 })),
    ]
    if (scene.pedestrian?.where === 'exit_crossing') markings.push(...zebra('z', -(R + 4), [-HALF, HALF]))
    const cars: Car3D[] = scene.cars.map((c) => {
      const r = (RING_INNER + RING_OUTER) / 2
      // Az óramutatóval ellentétesen (felülről nézve) kering, a bejáratunk a 270°-os (déli) pontnál van
      return c.from === 'left'
        ? { color: carColor(), from: [0, 0], to: [0, 0], rotY: 0, waiting: false, arc: { r, a0: Math.PI * 0.95, a1: Math.PI * 1.28 } }
        : { color: carColor(), from: [0, 0], to: [0, 0], rotY: 0, waiting: false, arc: { r, a0: Math.PI * 0.1, a1: Math.PI * 0.45 } }
    })
    const peds: Ped3D[] =
      scene.pedestrian?.where === 'exit_crossing'
        ? [{ from: [HALF + 1, -(R + 4)], to: [-HALF - 1, -(R + 4)], state: 'crossing', rotY: Math.PI / 2 }]
        : []
    return {
      kind: 'roundabout',
      asphalt,
      sidewalks: [],
      markings,
      ring: { inner: RING_INNER, outer: R },
      signs: [
        { codes: signs.mine, x: HALF + 1.2, z: R + 2.5, rotY: 0, size: 1.1 },
        ...signs.approach.map((code) => ({ codes: [code], x: HALF + 1.2, z: R + 38, rotY: 0, size: 1.0 })),
      ].filter((s) => s.codes.length),
      lights: [],
      cars,
      peds,
      buildings: buildingsAlong(rng, [
        { axis: 'z', from: R + 8, to: L, offset: HALF + SIDEWALK + 2 },
        { axis: 'z', from: R + 8, to: L, offset: -(HALF + SIDEWALK + 2) },
        { axis: 'z', from: -R - 8, to: -L, offset: HALF + SIDEWALK + 2 },
        { axis: 'z', from: -R - 8, to: -L, offset: -(HALF + SIDEWALK + 2) },
      ]),
      camera: { x: LANE / 2 - 0.45, y: 1.25, startZ: 62, stopZ },
      lookYaw: 0,
      turn: scene.turn,
    }
  }

  if (scene.layout === 'road') {
    const oneWayTwoLanes = !!scene.blocker
    const hasZebra = scene.mySign === 'crossing'
    const isSpeed = scene.mySign === 'speed'
    const markings: Rect[] = [...dashes('z', L, -L, 0)]
    if (hasZebra) markings.push(...zebra('z', 0, [-HALF, HALF]))
    const ped = scene.pedestrian?.where === 'my_crossing' ? scene.pedestrian : undefined
    const peds: Ped3D[] = ped
      ? ped.state === 'crossing'
        ? [{ from: [-HALF - 0.8, 0], to: [HALF + 0.8, 0], state: 'crossing', rotY: -Math.PI / 2 }]
        : [{ from: [HALF + 1.3, 0], to: [HALF + 1.3, 0], state: 'waiting', rotY: Math.PI / 2 }]
      : []
    const signPosts: SignPost3D[] = isSpeed
      ? [{ codes: signs.mine, x: HALF + 1.2, z: 0, rotY: 0, size: 1.0 }]
      : [
          { codes: signs.mine, x: HALF + 1.2, z: 1.8, rotY: 0, size: 1.1 },
          { codes: signs.mine, x: -HALF - 1.2, z: 1.8, rotY: 0, size: 1.1 },
        ]
    return {
      kind: 'road',
      asphalt: [{ x: 0, z: 0, w: 2 * HALF, d: 2 * L }],
      sidewalks: [
        { x: HALF + SIDEWALK / 2, z: 0, w: SIDEWALK, d: 2 * L },
        { x: -HALF - SIDEWALK / 2, z: 0, w: SIDEWALK, d: 2 * L },
      ],
      markings,
      signs: signPosts.filter((s) => s.codes.length),
      lights: [],
      cars: oneWayTwoLanes ? [] : [{ color: carColor(), from: [-LANE / 2, -60], to: [-LANE / 2, -25], rotY: HEADING.ahead, waiting: false }],
      peds,
      blocker: scene.blocker ? { x: -LANE / 2, z: 5.5 } : undefined,
      buildings: buildingsAlong(rng, [
        { axis: 'z', from: L, to: -L, offset: HALF + SIDEWALK + 1 },
        { axis: 'z', from: L, to: -L, offset: -(HALF + SIDEWALK + 1) },
      ]),
      camera: { x: LANE / 2 - 0.45, y: 1.25, startZ: 62, stopZ: isSpeed ? 16 : 11 },
      lookYaw: 0,
      turn: 'straight',
    }
  }

  // ---------------------------------------------------------------- kereszteződés
  const edge = HALF + SIDEWALK
  const stopLineZ = edge + 0.8
  const asphalt: Rect[] = [
    { x: 0, z: 0, w: 2 * HALF, d: 2 * L },
    { x: 0, z: 0, w: 2 * L, d: 2 * HALF },
  ]
  const sidewalks: Rect[] = []
  for (const sx of [1, -1])
    for (const sz of [1, -1]) {
      // Négy saroktömb járdája (L alakban, két téglalappal)
      sidewalks.push({ x: sx * (HALF + (L - HALF) / 2), z: sz * (HALF + SIDEWALK / 2), w: L - HALF, d: SIDEWALK })
      sidewalks.push({ x: sx * (HALF + SIDEWALK / 2), z: sz * (edge + (L - edge) / 2), w: SIDEWALK, d: L - edge })
    }
  const markings: Rect[] = [
    ...dashes('z', edge + 1, L, 0),
    ...dashes('z', -edge - 1, -L, 0),
    ...dashes('x', edge + 1, L, 0),
    ...dashes('x', -edge - 1, -L, 0),
  ]
  if (scene.mySign === 'stop' || scene.light) markings.push({ x: HALF / 2, z: stopLineZ, w: HALF, d: 0.4 })
  if (scene.mySign === 'give_way') markings.push(...[0.4, 1.2, 2.0, 2.8].map((x) => ({ x, z: stopLineZ, w: 0.5, d: 0.5 })))

  const peds: Ped3D[] = []
  if (scene.pedestrian?.where === 'target_road') {
    const side = scene.turn === 'left' ? -1 : 1
    const zx = side * (edge + 2)
    markings.push(...zebra('z', zx, [-HALF, HALF]).map((r) => ({ ...r, x: zx, z: r.x, w: 3, d: 0.5 })))
    peds.push({ from: [zx, -HALF - 0.8], to: [zx, HALF + 0.8], state: 'crossing', rotY: Math.PI })
  }

  const signPosts: SignPost3D[] = []
  if (!scene.light && signs.mine.length) signPosts.push({ codes: signs.mine, x: HALF + 1.2, z: edge + 1.2, rotY: 0, size: 1.1 })
  if (signs.cross.length) {
    // A keresztező út táblái a partnerek felé fordulnak (oldalról látjuk őket)
    signPosts.push({ codes: signs.cross, x: -(edge + 1.2), z: HALF + 1.2, rotY: -Math.PI / 2, size: 0.9 })
    signPosts.push({ codes: signs.cross, x: edge + 1.2, z: -(HALF + 1.2), rotY: Math.PI / 2, size: 0.9 })
  }

  const lights: Light3D[] = scene.light
    ? [
        { x: HALF + 1.0, z: edge + 0.6, rotY: 0, state: scene.light, height: 3.0 },
        // Túloldali ismétlő lámpa, ahogy a magyar kereszteződésekben szokás
        { x: HALF + 1.0, z: -(edge + 0.6), rotY: 0, state: scene.light, height: 3.0 },
      ]
    : []

  const offset = HALF + SIDEWALK + 1.5
  return {
    kind: 'junction',
    asphalt,
    sidewalks,
    markings,
    signs: signPosts,
    lights,
    cars: scene.cars.map((c) => junctionCar(c, carColor())),
    peds,
    buildings: buildingsAlong(rng, [
      { axis: 'z', from: edge + 6, to: L, offset },
      { axis: 'z', from: edge + 6, to: L, offset: -offset },
      { axis: 'z', from: -edge - 6, to: -L, offset },
      { axis: 'z', from: -edge - 6, to: -L, offset: -offset },
    ]),
    // A kérdés kb. 10 m-rel a stopvonal előtt jön: ekkor kell döntenie a vezetőnek, és a tábla még előtte van
    camera: { x: LANE / 2 - 0.45, y: 1.25, startZ: 62, stopZ: stopLineZ + 10 },
    lookYaw: 0,
    turn: scene.turn,
  }
}

/** Vízszintes irány (radián) a kamerából egy ponthoz; 0 = előre (−Z), + = balra */
export function bearingFromCamera(l: Pick<Layout3D, 'camera'>, x: number, z: number): number {
  return Math.atan2(-(x - l.camera.x), -(z - l.camera.stopZ))
}

/**
 * Fejfordítás a kérdés idejére: a fontos elemek (saját tábla, lámpa, partnerautók, gyalogosok)
 * közé néz, hogy egyszerre lássa őket. Ha nincs ilyen, a kanyarodás irányába pillant.
 */
function frameYaw(l: Layout3D): number {
  const points: Array<[number, number]> = []
  for (const s of l.signs) if (s.rotY === 0 && s.z < l.camera.stopZ && s.z > l.camera.stopZ - 40) points.push([s.x, s.z])
  for (const c of l.cars) {
    const p = carPose(c, 1)
    points.push([p.x, p.z])
  }
  for (const p of l.peds) points.push([(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2])
  if (l.blocker) points.push([l.blocker.x, l.blocker.z])
  const turnYaw = l.turn === 'left' ? 0.2 : l.turn === 'right' ? -0.2 : 0
  if (points.length === 0) return turnYaw
  const angles = points.map(([x, z]) => bearingFromCamera(l, x, z))
  const lo = Math.min(...angles)
  const hi = Math.max(...angles)
  return Math.max(-0.6, Math.min(0.6, (lo + hi) / 2))
}

export function buildLayout(scene: Scene): Layout3D {
  const raw = buildRaw(scene)
  return { ...raw, lookYaw: frameYaw(raw) }
}

/** Közeledés: lassuló mozgás (ease-out), 0..1 */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - c, 3)
}

/** Egy partnerautó helyzete és iránya a közeledés adott pillanatában */
export function carPose(car: Car3D, t: number): { x: number; z: number; rotY: number } {
  const e = car.waiting ? 1 : easeOut(t)
  if (car.arc) {
    const a = car.arc.a0 + (car.arc.a1 - car.arc.a0) * e
    // Óramutatóval ellentétes keringés felülről: pozíció (r·cos a, −r·sin a), menetirány a növekvő szög felé
    // A −Z felé néző modellt θ szöggel forgatva a (−sin θ, −cos θ) irányba néz; ez a pálya érintője, ha θ = a
    return { x: car.arc.r * Math.cos(a), z: -car.arc.r * Math.sin(a), rotY: a }
  }
  return { x: car.from[0] + (car.to[0] - car.from[0]) * e, z: car.from[1] + (car.to[1] - car.from[1]) * e, rotY: car.rotY }
}
