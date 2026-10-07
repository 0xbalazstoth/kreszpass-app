import { signsForScene } from '../../data/signs'
import type { LightState, RailLight, Scene, SceneCar, Side } from '../../domain/questions'
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
  /** Kiterjedés X és Z irányban (elforgatás előtt) */
  w: number
  d: number
  /** Y tengely körüli elforgatás (radián): ferde utakhoz (körforgalom ágai) */
  rotY?: number
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

/** Vasúti átjáró: sínek keresztben, fényjelző és (ha van) sorompó a jobb oldalon */
export interface Rail3D {
  /** A sínpár középvonala */
  z: number
  light: RailLight
  /** Fényjelző helye (az Andráskereszt oszlopán) */
  lightAt?: { x: number; z: number }
  barrier?: { x: number; z: number; down: boolean; length: number }
}

/** Egyéb szereplők és tárgyak: járművek, akadályok, villamos, vonat… */
export type PropKind =
  | 'van'
  | 'ambulance'
  | 'car'
  | 'cone'
  | 'barrier'
  | 'dirt'
  | 'ball'
  | 'child'
  | 'cyclist'
  | 'tram'
  | 'bus'
  | 'train'
  | 'tractor'
  | 'island'
  | 'tram_track'
  /** Beton útelzáró elem (Jersey-fal) */
  | 'jersey'
  /** Útépítő munkás (láthatósági mellényben) */
  | 'worker'

export interface Prop3D {
  kind: PropKind
  /** Kiinduló helyzet (x, z) */
  at: [number, number]
  /** Y körüli forgatás: 0 = a −Z felé néz (mint mi) */
  rotY: number
  /**
   * Mozgás: approach – a közeledés végére ér a célba (lassulva); after – a kérdés megjelenése után indul;
   * always – a jelenet elejétől egyenletesen halad. A sebesség m/s, a késleltetés s.
   */
  move?: { to: [number, number]; when: 'approach' | 'after' | 'always'; speed?: number; delay?: number }
  color?: string
  /** Nyitott ajtó (parkoló autó, villamos, busz) */
  open?: boolean
  /** Villogó irányjelző vagy vészvillogó */
  blink?: 'left' | 'right' | 'hazard'
  /** Változó méretű tárgyaknál [szélesség, hossz] (járdasziget, sínpár, villamos hossza) */
  size?: [number, number]
}

/** Utcabútor a járdán: közvilágítási lámpa vagy fa */
export interface Furniture3D {
  kind: 'lamp' | 'tree'
  x: number
  z: number
  /** A lámpa karja az úttest felé néz */
  rotY: number
}

export interface Layout3D {
  kind: Scene['layout']
  rail?: Rail3D
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
  props?: Prop3D[]
  furniture?: Furniture3D[]
  /** Visszapillantó tükör megjelenítése (hátulról érkező mentőautó) */
  mirror?: boolean
  /** Sziréna hangja */
  siren?: boolean
  buildings: Building[]
  /**
   * A kamera útja: egyenesen a startZ-ből a stopZ-be, vagy (körforgalomban) íven: a körpálya közepétől r sugárban,
   * a0 → a1 szögig (radián, az óramutatóval ellentétesen). Az íven a kamera a menetirányba néz.
   */
  camera: {
    x: number
    y: number
    startZ: number
    stopZ: number
    arc?: { r: number; a0: number; a1: number }
    /** Egyenletes sebesség (lassulás nélkül): táblagyakorlásnál, hogy a tábla végig egyformán látszódjon */
    steady?: boolean
  }
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
    // Zárt sorú beépítés: a házak hézag nélkül követik egymást, így nem látszanak a vezető előtt
    // felénk forduló, csupasz oldalfalak (egy hézagnál egy közeli ház oldala nagy szürke falnak tűnt)
    for (let p = arm.from, w = 0; dir > 0 ? p < arm.to : p > arm.to; p += dir * w) {
      w = Math.min(9 + rng() * 5, Math.abs(arm.to - p))
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

  if (scene.layout === 'roundabout') return roundaboutLayout(scene, rng, signs, carColor, L)

  if (scene.layout === 'road' && scene.rail) {
    // A sínek a z = 0 vonalon; a megállás helye (Andráskereszt, fényjelző, sorompó) előttük, a jobb oldalon
    const r = scene.rail
    const crossZ = 4
    return {
      kind: 'road',
      rail: {
        z: 0,
        light: r.light,
        lightAt: r.light !== 'none' ? { x: HALF + 1.2, z: crossZ } : undefined,
        barrier: r.barrier ? { x: HALF + 0.5, z: crossZ - 1, down: !!r.barrierDown, length: HALF + 0.3 } : undefined,
      },
      asphalt: [{ x: 0, z: 0, w: 2 * HALF, d: 2 * L }],
      sidewalks: [],
      markings: [...dashes('z', L, crossZ + 3, 0), ...dashes('z', -4, -L, 0), { x: HALF / 2, z: crossZ + 1.2, w: HALF, d: 0.4 }],
      signs: [
        { codes: signs.mine, x: HALF + 1.2, z: crossZ, rotY: 0, size: 1.1 },
        { codes: signs.approach, x: HALF + 1.2, z: 38, rotY: 0, size: 1.0 },
      ].filter((p) => p.codes.length),
      lights: [],
      // Torlódás a sínek mögött: álló autók a sávunkban
      cars: r.queue ? [-6.5, -13, -19.5].map((z) => ({ color: carColor(), from: [LANE / 2, z] as [number, number], to: [LANE / 2, z] as [number, number], rotY: 0, waiting: true })) : [],
      peds: [],
      props: [
        // A vonat balról közeledik: a kérdés idején kb. 35 m-re van, utána áthalad előttünk
        ...(r.train ? [{ kind: 'train' as const, at: [-55, 0] as [number, number], rotY: -Math.PI / 2, move: { to: [160, 0] as [number, number], when: 'always' as const, speed: 8 } }] : []),
        ...(r.slowAhead
          ? [{ kind: 'tractor' as const, at: [LANE / 2, 22] as [number, number], rotY: 0, move: { to: [LANE / 2, -90] as [number, number], when: 'always' as const, speed: 3 } }]
          : []),
      ],
      buildings: buildingsAlong(rng, [
        { axis: 'z', from: L, to: 16, offset: HALF + SIDEWALK + 6 },
        { axis: 'z', from: L, to: 16, offset: -(HALF + SIDEWALK + 6) },
        { axis: 'z', from: -16, to: -L, offset: HALF + SIDEWALK + 6 },
        { axis: 'z', from: -16, to: -L, offset: -(HALF + SIDEWALK + 6) },
      ]).map((b) => ({ ...b, h: Math.min(b.h, 9) })),
      // Lassú jármű mögött hátrébb állunk meg
      camera: { x: LANE / 2 - 0.45, y: 1.25, startZ: 62, stopZ: r.slowAhead ? 28 : 16 },
      lookYaw: 0,
      turn: 'straight',
    }
  }

  if (scene.layout === 'road' && (scene.hazard || scene.transit || scene.roadSign)) return streetLayout(scene, rng, signs, carColor, L)

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
      // Előkert a járda mögött: a legközelebbi homlokzat ne töltse ki a látóteret
      buildings: buildingsAlong(rng, [
        { axis: 'z', from: L, to: -L, offset: HALF + SIDEWALK + 3.5 },
        { axis: 'z', from: L, to: -L, offset: -(HALF + SIDEWALK + 3.5) },
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

  // Egyirányú célút: a tábla a befordulás után, a célút jobb oldalán, a befordulók felé
  if (signs.target.length && scene.turn !== 'straight') {
    signPosts.push(
      scene.turn === 'left'
        ? { codes: signs.target, x: -(edge + 2.5), z: -(HALF + 1.2), rotY: Math.PI / 2, size: 0.9 }
        : { codes: signs.target, x: edge + 2.5, z: HALF + 1.2, rotY: -Math.PI / 2, size: 0.9 },
    )
  }

  const lights: Light3D[] = scene.light
    ? [
        { x: HALF + 1.0, z: edge + 0.6, rotY: 0, state: scene.light, height: 3.0 },
        // Túloldali ismétlő lámpa, ahogy a magyar kereszteződésekben szokás
        { x: HALF + 1.0, z: -(edge + 0.6), rotY: 0, state: scene.light, height: 3.0 },
      ]
    : []

  // Előkert a járda mögött, mint az utcán
  const offset = HALF + SIDEWALK + 3
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

type SceneSignsFull = ReturnType<typeof signsForScene>

/** Irányvektor a körforgalom középpontjától a szög felé (felülnézet: x = cos a, z = −sin a) */
function ringDir(a: number): [number, number] {
  return [Math.cos(a), -Math.sin(a)]
}

/** Az iránnyal merőleges (jobbra mutató, ha befelé nézünk) egységvektor */
function ringPerp(a: number): [number, number] {
  return [Math.sin(a), Math.cos(a)]
}

/** Téglalap a körforgalom egyik ága mentén (from–to távolság a középponttól) */
function armRect(a: number, from: number, to: number, w: number, across = 0): Rect {
  const [dx, dz] = ringDir(a)
  const [px, pz] = ringPerp(a)
  const m = (from + to) / 2
  return { x: dx * m + px * across, z: dz * m + pz * across, w, d: to - from, rotY: a - Math.PI / 2 }
}

/** A körpálya forgalmi sávjainak középvonala: egysávosnál a pálya közepe, kétsávosnál a belső és a külső sáv */
export function ringLaneRadius(lanes: number, lane: 'inner' | 'outer' | 'single'): number {
  if (lanes < 2 || lane === 'single') return (RING_INNER + RING_OUTER) / 2
  const w = (RING_OUTER - RING_INNER) / 2
  return lane === 'inner' ? RING_INNER + w / 2 : RING_OUTER - w / 2
}

/**
 * Körforgalom a valós kijáratszámmal: az ágak egyenletesen, a behajtási ág délen (felénk).
 * Behajtás előtt a kamera egyenesen közeledik; a körben (exit) íven halad, és a kijárat előtt áll meg.
 */
function roundaboutLayout(scene: Scene, rng: () => number, signs: SceneSignsFull, carColor: () => string, L: number): Layout3D {
  const R = RING_OUTER
  const info = scene.roundabout ?? { exits: 4, exit: 2, lanes: 1, phase: 'entry' as const }
  const n = Math.max(3, Math.min(6, info.exits))
  const armAngle = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / n
  // A 0. ág a behajtási ág; az n-edik kijárat (vagy azon túl) a megfordulás, ugyanide
  const exitK = Math.min(info.exit, n)
  const exitA = armAngle(exitK)
  const lanes = Math.min(2, info.lanes)

  const asphalt: Rect[] = Array.from({ length: n }, (_, k) => armRect(armAngle(k), R - 2, L, 2 * HALF))
  const markings: Rect[] = []
  for (let k = 0; k < n; k++) {
    const a = armAngle(k)
    // Felezővonal az ágakon
    for (let p = R + 2; p < L; p += 6) markings.push(armRect(a, p, p + 3, 0.15))
  }
  // Elsőbbségadás („cápafog”) a behajtásnál
  markings.push(...[0.4, 1.2, 2.0, 2.8].map((x) => ({ x, z: R + 1, w: 0.5, d: 0.5 })))
  if (lanes >= 2) {
    // Sávelválasztó szaggatott kör
    const r = (RING_INNER + R) / 2
    for (let i = 0; i < 40; i++) {
      if (i % 2) continue
      const a = (i / 40) * Math.PI * 2
      const [dx, dz] = ringDir(a)
      markings.push({ x: dx * r, z: dz * r, w: 0.15, d: 1.1, rotY: a })
    }
  }
  const peds: Ped3D[] = []
  if (scene.pedestrian?.where === 'exit_crossing') {
    // Zebra a kijárati ágon, a csíkok a forgalommal párhuzamosak
    for (let o = -HALF + 0.5; o < HALF - 0.2; o += 0.9) markings.push(armRect(exitA, R + 2.5, R + 5.5, 0.5, o))
    const [dx, dz] = ringDir(exitA)
    const [px, pz] = ringPerp(exitA)
    const c: [number, number] = [dx * (R + 4), dz * (R + 4)]
    peds.push({ from: [c[0] + px * (HALF + 1), c[1] + pz * (HALF + 1)], to: [c[0] - px * (HALF + 1), c[1] - pz * (HALF + 1)], state: 'crossing', rotY: exitA })
  }

  const cars: Car3D[] = []
  let camera: Layout3D['camera'] = { x: LANE / 2 - 0.45, y: 1.25, startZ: 62, stopZ: R + 12 }
  let lookYaw = 0
  if (info.phase === 'entry') {
    for (const c of scene.cars) {
      const r = ringLaneRadius(lanes, 'outer')
      // Az óramutatóval ellentétesen (felülről nézve) kering, a bejáratunk a 270°-os (déli) pontnál van
      cars.push(
        c.from === 'left'
          ? { color: carColor(), from: [0, 0], to: [0, 0], rotY: 0, waiting: false, arc: { r, a0: Math.PI * 0.95, a1: Math.PI * 1.28 } }
          : { color: carColor(), from: [0, 0], to: [0, 0], rotY: 0, waiting: false, arc: { r, a0: Math.PI * 0.1, a1: Math.PI * 0.45 } },
      )
    }
  } else {
    // A körben: távolabbi kijárathoz kétsávos körben a belső sávban haladunk
    const own = lanes >= 2 ? (info.exit > 2 ? 'inner' : 'outer') : 'single'
    const r = ringLaneRadius(lanes, own)
    // A várakozó autó a kijáratunk előtti bejáratnál áll, ott állunk meg; egyébként a kijárat előtt
    const stopK = scene.roundabout?.partner === 'entry_waiting' && exitK > 1 ? exitK - 1 : exitK
    const a1 = armAngle(stopK) - 0.42
    const a0 = Math.max(armAngle(0) + 0.3, a1 - 1.9)
    camera = { x: 0, y: 1.25, startZ: 0, stopZ: 0, arc: { r, a0, a1 } }
    // A kijárat előtt a vezető jobbra, a kijárat és a kijárati zebra felé néz
    lookYaw = -0.5
    if (scene.roundabout?.partner === 'outer_car') {
      // A külső sávban mellettünk, kissé előttünk: a vezető jobbra, a válla fölött néz, mielőtt átsorolna
      cars.push({ color: carColor(), from: [0, 0], to: [0, 0], rotY: 0, waiting: false, arc: { r: ringLaneRadius(lanes, 'outer'), a0: a0 + 0.08, a1: a1 + 0.12 } })
      lookYaw = -0.95
    }
    if (scene.roundabout?.partner === 'entry_waiting') {
      const a = armAngle(stopK)
      const [dx, dz] = ringDir(a)
      const [px, pz] = ringPerp(a)
      // A befelé haladók jobb oldala a −perp irány; a kocsi a körpálya felé néz
      const pos: [number, number] = [dx * (R + 3.5) - px * (LANE / 2), dz * (R + 3.5) - pz * (LANE / 2)]
      cars.push({ color: carColor(), from: pos, to: pos, rotY: a + Math.PI / 2, waiting: true })
      lookYaw = -0.35
    }
  }

  // Házak az ágak között, a behajtási ág mentén utcasor
  const buildings: Building[] = buildingsAlong(rng, [
    { axis: 'z', from: R + 8, to: L, offset: HALF + SIDEWALK + 2 },
    { axis: 'z', from: R + 8, to: L, offset: -(HALF + SIDEWALK + 2) },
  ])
  // A behajtási ág melletti két szögben már az utcasor áll
  for (let k = 2; k < n; k++) {
    const a = (armAngle(k - 1) + armAngle(k)) / 2
    const [dx, dz] = ringDir(a)
    const size = 10 + rng() * 4
    // Távolabb és alacsonyabban, hogy a körön át látszódjanak a kijáratok
    buildings.push({ x: dx * (R + 30), z: dz * (R + 30), w: size, d: size, h: 6 + rng() * 7, color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)] })
  }

  return {
    kind: 'roundabout',
    asphalt,
    sidewalks: [],
    markings,
    ring: { inner: RING_INNER, outer: R },
    signs: [
      { codes: signs.mine, x: HALF + 1.2, z: R + 2.5, rotY: 0, size: 1.0 },
      ...signs.approach.map((code) => ({ codes: [code], x: HALF + 1.2, z: R + 38, rotY: 0, size: 1.0 })),
    ].filter((s) => s.codes.length),
    lights: [],
    cars,
    peds,
    buildings,
    camera,
    lookYaw,
    turn: scene.turn,
  }
}

/** A mozgó/álló tárgy helyzete: a közeledés állása (0..1), a jelenet kezdete és a kérdés megjelenése óta eltelt idő (s) */
export function propPose(p: Prop3D, progress: number, elapsed: number, sinceStop: number): [number, number] {
  const m = p.move
  if (!m) return p.at
  const total = Math.hypot(m.to[0] - p.at[0], m.to[1] - p.at[1]) || 1
  let f: number
  if (m.when === 'approach') f = easeOut(progress)
  else {
    const t = (m.when === 'after' ? sinceStop : elapsed) - (m.delay ?? 0)
    f = Math.min(1, Math.max(0, (t * (m.speed ?? 1)) / total))
  }
  return [p.at[0] + (m.to[0] - p.at[0]) * f, p.at[1] + (m.to[1] - p.at[1]) * f]
}

/**
 * Utcai jelenetek: váratlan helyzetek (akadály, labda, kinyíló ajtó, kerékpáros, mentőautó),
 * villamos- és autóbuszmegálló. Kétirányú utca, szükség szerint parkolósávval, buszöböllel vagy középen futó villamossal.
 */
function streetLayout(scene: Scene, rng: () => number, signs: SceneSignsFull, carColor: () => string, L: number): Layout3D {
  const own = LANE / 2
  const camX = own - 0.45
  const tramMiddle = scene.transit?.kind === 'tram' && scene.transit.island
  const parking = scene.hazard === 'ball_child' || scene.hazard === 'door_open'
  const bay = scene.transit?.kind === 'bus'
  // A jobb oldali úttest széle (parkolósávval szélesebb) és a bal széle (középen futó villamosnál távolabb)
  const rightEdge = HALF + (parking ? 2.4 : 0)
  const leftEdge = tramMiddle ? -9.7 : -HALF

  const asphalt: Rect[] = [{ x: (rightEdge + leftEdge) / 2, z: 0, w: rightEdge - leftEdge, d: 2 * L }]
  const sidewalks: Rect[] = [{ x: leftEdge - SIDEWALK / 2, z: 0, w: SIDEWALK, d: 2 * L }]
  if (bay) {
    // Buszöböl: z ∈ [−24, −1], a járda mögötte
    asphalt.push({ x: HALF + 1.5, z: -12.5, w: 3, d: 23 })
    sidewalks.push({ x: rightEdge + SIDEWALK / 2, z: (L - 1) / 2, w: SIDEWALK, d: L + 1 })
    sidewalks.push({ x: rightEdge + SIDEWALK / 2, z: -(L + 24) / 2, w: SIDEWALK, d: L - 24 })
    sidewalks.push({ x: HALF + 3 + SIDEWALK / 2, z: -12.5, w: SIDEWALK, d: 23 })
  } else sidewalks.push({ x: rightEdge + SIDEWALK / 2, z: 0, w: SIDEWALK, d: 2 * L })

  const markings: Rect[] = tramMiddle ? [...dashes('z', L, -L, -6.2)] : [...dashes('z', L, -L, 0)]
  const cars: Car3D[] = []
  const peds: Ped3D[] = []
  const props: Prop3D[] = []
  const posts: SignPost3D[] = []
  let stopZ = 12
  let mirror = false
  let siren = false
  const oncoming = (delays: number[], x = -own) =>
    delays.forEach((delay) =>
      props.push({ kind: 'car', at: [x, -75], rotY: Math.PI, color: carColor(), move: { to: [x, 90], when: 'always', speed: 10, delay } }),
    )
  // Parkoló autók eltérő színekkel (egymás után ne legyen két egyforma)
  const first = Math.floor(rng() * CAR_COLORS.length)
  const parkedRow = (zs: number[]) =>
    zs.forEach((z, i) => props.push({ kind: 'car', at: [HALF + 1.2, z], rotY: 0, color: CAR_COLORS[(first + i * 3) % CAR_COLORS.length] }))

  switch (scene.hazard) {
    case 'parked_oncoming':
      props.push({ kind: 'van', at: [own + 0.3, -3], rotY: 0, blink: 'hazard' })
      oncoming([0, 3.5])
      stopZ = 11
      break
    case 'parked_clear':
      props.push({ kind: 'van', at: [own + 0.3, -3], rotY: 0, blink: 'hazard' })
      stopZ = 17
      break
    case 'roadworks': {
      // Terelőkúpok ferdén a sávunkon át, mögöttük a munkaterület korláttal
      for (let i = 0; i < 6; i++) props.push({ kind: 'cone', at: [HALF - 0.3 - (i * (HALF - 0.6)) / 5, 7 - i * 1.3], rotY: 0 })
      props.push({ kind: 'barrier', at: [own + 0.2, 0.4], rotY: 0, size: [HALF - 0.5, 0] })
      // A munkaterület mentén beton útelzáró elemek, egymás mellett
      for (let z = -2.6; z > -28; z -= 1.56) props.push({ kind: 'jersey', at: [0.42, z], rotY: Math.PI / 2 })
      props.push({ kind: 'dirt', at: [own + 0.4, -12], rotY: 0, size: [2.2, 7] })
      // Munkás a munkaterületen, a forgalom felé fordulva
      props.push({ kind: 'worker', at: [own + 0.6, -7.5], rotY: Math.PI })
      posts.push({ codes: signs.mine, x: own + 0.2, z: 1.2, rotY: 0, size: 0.8 })
      stopZ = 16
      break
    }
    case 'ball_child':
      parkedRow([4.5, -6, -13, -20])
      props.push({ kind: 'ball', at: [HALF + 1.4, -0.6], rotY: 0, move: { to: [0.3, -0.6], when: 'always', speed: 2.2, delay: 1 } })
      props.push({ kind: 'child', at: [HALF + 2.9, -1.2], rotY: Math.PI / 2, move: { to: [HALF + 0.2, -1.2], when: 'after', speed: 2.2, delay: 0.5 } })
      stopZ = 12
      break
    case 'door_open':
      parkedRow([-12, -19])
      // Világos autó, hogy a kinyíló sötét ajtókeret és a kiszálló vezető jól látszódjon
      props.push({ kind: 'car', at: [HALF + 1.2, -3], rotY: 0, color: '#e5e7eb', open: true })
      oncoming([0.5])
      stopZ = 9
      break
    case 'cyclist':
      props.push({ kind: 'cyclist', at: [HALF - 0.7, 30], rotY: 0, move: { to: [HALF - 0.7, -90], when: 'always', speed: 4.5 } })
      oncoming([0, 2.2, 5])
      stopZ = 30
      break
    case 'emergency':
      // Hátulról érkezik: a tükörben látszik
      props.push({ kind: 'ambulance', at: [own, 115], rotY: 0, move: { to: [own, 27], when: 'approach' } })
      mirror = true
      siren = true
      stopZ = 16
      break
  }

  const t = scene.transit
  if (t?.kind === 'tram') {
    if (!t.island) {
      // Közös sáv: a villamos a mi sávunkban jár, az utasok a járdáról az úttesten át szállnak
      props.push({ kind: 'tram_track', at: [own, 0], rotY: 0, size: [0, 2 * L] })
      if (t.state === 'doors_open') {
        props.push({ kind: 'tram', at: [own, -20], rotY: 0, open: true, size: [0, 30] })
        for (const [i, z] of [-9, -17.5, -26].entries())
          peds.push({ from: [HALF + 1.4, z - i * 0.3], to: [own + 1.45, z], state: 'crossing', rotY: Math.PI / 2 })
        stopZ = 4
      } else {
        props.push({ kind: 'tram', at: [own, -1], rotY: 0, size: [0, 30], move: { to: [own, -24], when: 'approach' } })
        peds.push({ from: [HALF + 1.3, -38], to: [HALF + 1.3, -38], state: 'waiting', rotY: Math.PI / 2 })
        peds.push({ from: [HALF + 1.6, -42], to: [HALF + 1.6, -42], state: 'waiting', rotY: Math.PI / 2 })
        stopZ = 5
      }
      posts.push({ codes: signs.mine, x: HALF + 1.2, z: t.state === 'doors_open' ? -3 : -34, rotY: 0, size: 0.9 })
    } else {
      // Középen futó villamos, járdasziget a villamos és a mi sávunk között, zebra a szigetről a járdára
      props.push({ kind: 'tram_track', at: [-4, 0], rotY: 0, size: [0, 2 * L] })
      props.push({ kind: 'island', at: [-1.3, -20], rotY: 0, size: [2.2, 32] })
      props.push({ kind: 'tram', at: [-4, -20], rotY: 0, open: true, size: [0, 30] })
      markings.push(...zebra('z', -2.5, [0, HALF]))
      peds.push({ from: [-0.6, -2.5], to: [HALF + 1, -2.5], state: 'crossing', rotY: -Math.PI / 2 })
      peds.push({ from: [-1.2, -9], to: [-1.2, -9], state: 'waiting', rotY: -Math.PI / 2 })
      peds.push({ from: [-1.4, -15], to: [-1.4, -15], state: 'waiting', rotY: -Math.PI / 2 })
      posts.push({ codes: signs.mine, x: -0.5, z: -5.5, rotY: 0, size: 0.9 })
      stopZ = 12
    }
  }
  if (t?.kind === 'bus') {
    const busZ = -12
    if (t.state === 'departing') {
      props.push({ kind: 'bus', at: [HALF + 1.4, busZ], rotY: 0, blink: 'left', move: { to: [own + 0.1, busZ - 26], when: 'after', speed: 2.2, delay: 0.6 } })
      stopZ = 14
    } else {
      props.push({ kind: 'bus', at: [HALF + 1.4, busZ], rotY: 0, open: true })
      // A busz elől kilépő gyalogos (a busz eleje z = −18-nál)
      // A busz bal széle mellett, épp kilép az úttestre: félig takarja a busz
      peds.push({ from: [HALF - 0.05, busZ - 6.6], to: [HALF - 0.05, busZ - 6.6], state: 'waiting', rotY: Math.PI / 2 })
      stopZ = 10
    }
    posts.push({ codes: signs.mine, x: HALF + 3.4, z: -1.8, rotY: 0, size: 0.9 })
  }

  if (scene.roadSign) {
    // Táblagyakorlás: a tábla a jobb oldali járdán áll. A kamera (lassulva) épp elhalad mellette: a kérdésnél a tábla
    // már a vezető mögött van, így széles képernyőn (nagy vízszintes látószögnél) sem látszik
    posts.push({ codes: signs.mine, x: rightEdge + 1.2, z: 0, rotY: 0, size: 1.0 })
    oncoming([0.3 + rng() * 1.5, 3 + rng() * 3])
    stopZ = -2
  }

  for (const code of signs.approach) posts.push({ codes: [code], x: rightEdge + 1.2, z: 38, rotY: 0, size: 1.0 })

  const offset = SIDEWALK + 3.5
  return {
    kind: 'road',
    asphalt,
    sidewalks,
    markings,
    signs: posts.filter((p) => p.codes.length),
    lights: [],
    cars,
    peds,
    props,
    mirror,
    siren,
    buildings: buildingsAlong(rng, [
      { axis: 'z', from: L, to: -L, offset: rightEdge + (bay ? 3 : 0) + offset },
      { axis: 'z', from: L, to: -L, offset: leftEdge - offset },
    ]),
    // Táblagyakorlásnál közelebbről, egyenletes tempóban indul: a tábla kb. 30 m-től az elhaladásig olvasható
    camera: scene.roadSign ? { x: camX, y: 1.25, startZ: 40, stopZ, steady: true } : { x: camX, y: 1.25, startZ: 62, stopZ },
    lookYaw: 0,
    turn: 'straight',
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
  // Az álló, illetve a közeledés végére megálló tárgyak (a hátulról érkező mentőautó nem: azt a tükör mutatja)
  for (const p of l.props ?? []) {
    // A közeledő vonat felé is odanéz (a kérdés tipikusan 2,5 s után jelenik meg)
    if (p.kind === 'train') points.push(propPose(p, 1, 2.5, 0))
    if (p.kind === 'tram_track' || p.kind === 'island' || p.kind === 'ambulance' || p.kind === 'cone' || p.kind === 'train') continue
    if (!p.move || p.move.when === 'approach') {
      const [x, z] = propPose(p, 1, 0, 0)
      if (z < l.camera.stopZ) points.push([x, z])
    }
  }
  const turnYaw = l.turn === 'left' ? 0.2 : l.turn === 'right' ? -0.2 : 0
  if (points.length === 0) return turnYaw
  const angles = points.map(([x, z]) => bearingFromCamera(l, x, z))
  const lo = Math.min(...angles)
  const hi = Math.max(...angles)
  return Math.max(-0.6, Math.min(0.6, (lo + hi) / 2))
}

/** A fák és lámpák legalább ennyire vannak a táblaoszlopoktól és a lámpáktól (m) */
const FURNITURE_CLEAR = 3
/** Ilyen messzire a tábla előtt (a közeledés irányában) nem áll fa a tábla oldalán: a lombja eltakarná (m) */
const TREE_SIGN_SHADOW = 25

/**
 * Lámpák és fák a járdákon, a szegély mellett, `spacing` méterenként, felváltva. Nem kerülnek a táblák és jelzőlámpák
 * közelébe, és a tábla előtti szakaszon (a vezető és a tábla között) nem áll fa, hogy ne takarja el.
 */
function placeFurniture(l: Layout3D, spacing: number, rng: () => number): Furniture3D[] {
  const out: Furniture3D[] = []
  const blockers = [...l.signs.map((s) => ({ x: s.x, z: s.z })), ...l.lights.map((x) => ({ x: x.x, z: x.z }))]
  let n = 0
  for (const r of l.sidewalks) {
    const alongZ = r.d >= r.w
    const len = alongZ ? r.d : r.w
    if (len < spacing) continue
    // A szegélytől kb. 0,6 m-re, a járda úttest felőli oldalán
    const kerb = alongZ ? r.x - Math.sign(r.x || 1) * (r.w / 2) : r.z - Math.sign(r.z || 1) * (r.d / 2)
    const pos = kerb + Math.sign(alongZ ? r.x || 1 : r.z || 1) * 0.6
    const start = (alongZ ? r.z : r.x) - len / 2 + spacing / 2 + rng() * 2
    for (let p = start; p < (alongZ ? r.z : r.x) + len / 2 - 1; p += spacing) {
      const x = alongZ ? pos : p
      const z = alongZ ? p : pos
      n++
      const kind: Furniture3D['kind'] = n % 2 === 0 ? 'tree' : 'lamp'
      if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < FURNITURE_CLEAR)) continue
      if (kind === 'tree' && l.signs.some((s) => s.rotY === 0 && Math.sign(s.x) === Math.sign(x) && z - s.z > 0 && z - s.z < TREE_SIGN_SHADOW)) continue
      // A lámpa karja az úttest felé
      const rotY = alongZ ? (x > 0 ? Math.PI : 0) : z > 0 ? Math.PI / 2 : -Math.PI / 2
      out.push({ kind, x, z, rotY })
    }
  }
  return out
}

export function buildLayout(scene: Scene, furnitureSpacing = 18): Layout3D {
  const raw = buildRaw(scene)
  raw.furniture = placeFurniture(raw, furnitureSpacing, seeded(`f${JSON.stringify(scene)}`))
  // Íven haladva a fejfordítást a körforgalom elrendezése adja meg. Táblagyakorlásnál a vezető nem fordul a tábla felé:
  // a kérdésnél már nem szabad látszania
  return raw.camera.arc || scene.roadSign ? raw : { ...raw, lookYaw: frameYaw(raw) }
}

/** Közeledés: lassuló mozgás (ease-out), 0..1 */
/** A járda és a szegélykő teteje (m) */
export const SIDEWALK_Y = 0.15
export const KERB_Y = 0.17

/** A járdák úttest felőli szegélye (a beton szegélykő a járda és az úttest között) */
export function kerbOf(r: Rect): Rect {
  if (r.w >= r.d) {
    const z = r.z - Math.sign(r.z || 1) * (r.d / 2)
    return { x: r.x, z, w: r.w, d: 0.18 }
  }
  const x = r.x - Math.sign(r.x || 1) * (r.w / 2)
  return { x, z: r.z, w: 0.18, d: r.d }
}

function inRect(r: Rect, x: number, z: number): boolean {
  const dx = x - r.x
  const dz = z - r.z
  const c = Math.cos(r.rotY ?? 0)
  const s = Math.sin(r.rotY ?? 0)
  return Math.abs(dx * c - dz * s) <= r.w / 2 && Math.abs(dx * s + dz * c) <= r.d / 2
}

/** A talaj magassága az (x, z) pontban: a szegélykövön, a járdán vagy az úttesten (0) áll-e a gyalogos */
export function surfaceY(sidewalks: Rect[], x: number, z: number): number {
  let y = 0
  for (const r of sidewalks) {
    if (inRect(kerbOf(r), x, z)) return KERB_Y
    if (inRect(r, x, z)) y = SIDEWALK_Y
  }
  return y
}

/** A gyalogos magassága a talaj felé simítva: a szegélyre fel- és lelépés ne ugrás legyen */
export function stepY(current: number, target: number, dt: number): number {
  return current + (target - current) * Math.min(1, dt * 14)
}

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
