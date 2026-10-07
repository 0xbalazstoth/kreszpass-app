import { deg, pathLength, segmentLength, type Gear, type Segment } from '../maneuvers/geometry'
import type { GearPos, Move, Track } from './types'

/**
 * Mozgássegédek a leckékhez: valós idejű, egyenletesen változó sebességű szakaszokból a megtett út és a
 * sebességmérő sávja. Így a mutató, a kocsi mozgása és a lejátszás ideje összhangban van.
 */

export type KinPart =
  /** Egyenletes gyorsítás/lassítás a megadott sebességre (km/h) d méteren; azonos sebességnél egyenletes haladás */
  | { to: number; d: number }
  /** Állás (ms) */
  | { wait: number }
  /** Hirtelen, blokkolásig menő fékezés: nagyon rövid úton áll meg */
  | { slam: number }

export interface Kin {
  /** Időtartam (ms) */
  ms: number
  /** Megtett út (m) */
  dist: number
  /** Mintavétel: [ms, megtett út m, sebesség km/h] */
  samples: [number, number, number][]
  /** Az egyes részek vége (ms) */
  ends: number[]
}

const KMH = 3.6
const DT = 80

/** Kinematika: v0 km/h-ról indulva a részek egymás után */
export function kin(v0: number, parts: KinPart[]): Kin {
  const samples: [number, number, number][] = [[0, 0, v0]]
  let t = 0
  let s = 0
  let v = v0 / KMH
  const ends: number[] = []
  for (const p of parts) {
    if ('wait' in p) {
      t += p.wait
      samples.push([t, s, v * KMH])
      ends.push(t)
      continue
    }
    const d = 'slam' in p ? p.slam : p.d
    const v1 = 'slam' in p ? 0 : p.to / KMH
    if (v + v1 <= 0) throw new Error('Álló helyzetből csak gyorsítva lehet utat megtenni')
    const T = (2 * d) / (v + v1)
    const a = (v1 - v) / T
    const steps = Math.max(2, Math.ceil((T * 1000) / DT))
    for (let i = 1; i <= steps; i++) {
      const tau = (T * i) / steps
      samples.push([t + tau * 1000, s + v * tau + 0.5 * a * tau * tau, (v + a * tau) * KMH])
    }
    t += T * 1000
    s += d
    v = v1
    ends.push(t)
  }
  return { ms: Math.ceil(t), dist: s, samples, ends }
}

/** Az i. rész végének időpontja a lépésben (0..1); i = −1: a lépés eleje */
export function tEnd(k: Kin, i: number, stepMs = k.ms): number {
  return i < 0 ? 0 : Math.min(1, k.ends[i] / stepMs)
}

/**
 * A kinematika a lépés hosszára igazítva: mozgás (az útra rajzolva) és a sebességmérő sávja. Ha a lépés rövidebb a
 * kinematikánál, a mozgás a lépés végén megszakad (a szereplő a következő lépésben onnan folytatja); ha hosszabb,
 * a szereplő a végén áll (ehhez a kinematika 0 km/h-val végződjön).
 */
export function drive(k: Kin, path: Segment[] = [st(k.dist)], stepMs = k.ms): { move: Move; speed: Track<number>; ms: number } {
  const T = stepMs
  const pts = k.samples.filter(([ms]) => ms <= T)
  const next = k.samples.find(([ms]) => ms > T)
  const lastPt = pts[pts.length - 1]
  if (next && lastPt[0] < T) {
    // A lépés végén megszakadó mozgás: a köztes mintát a két szomszédos közül számoljuk
    const f = (T - lastPt[0]) / (next[0] - lastPt[0])
    pts.push([T, lastPt[1] + (next[1] - lastPt[1]) * f, lastPt[2] + (next[2] - lastPt[2]) * f])
  }
  const total = pathLength(path)
  const profile: Track<number> = pts.map(([ms, d]) => [ms / T, total > 0 ? Math.min(1, d / total) : 0])
  const speed: Track<number> = pts.map(([ms, , v]) => [ms / T, Math.round(v * 10) / 10])
  return { move: { path, profile }, speed, ms: T }
}

/** Egyenletes, a lépés teljes hossza alatti mozgás (gyalogos, partner) a lépés egy részében: [kezdet, vég] 0..1 */
export function during(path: Segment[], from = 0, to = 1): Move {
  return {
    path,
    profile: [
      [0, 0],
      [from, 0],
      [to, 1],
      [1, 1],
    ],
  }
}

// ---------------------------------------------------------------- útszakaszok

export const st = (dist: number, gear: Gear = 'D'): Segment => ({ kind: 'straight', dist, gear })
export const arcL = (radius: number, angleDeg: number, gear: Gear = 'D'): Segment => ({ kind: 'arc', radius, angle: deg(angleDeg), dir: 'left', gear })
export const arcR = (radius: number, angleDeg: number, gear: Gear = 'D'): Segment => ({ kind: 'arc', radius, angle: deg(angleDeg), dir: 'right', gear })

/**
 * Sávváltás oldalirányú `offset` méterrel (+ = jobbra), `len` méter alatt, két ellentétes ívvel. A meredekséget a
 * hossz adja: rövid hosszon hirtelen (4/6), hosszabbon szelíd.
 */
export function laneShift(offset: number, len: number): Segment[] {
  // Két egyforma ív: θ = 2·atan(|off| / len), r = len / (2·sin θ)
  const theta = 2 * Math.atan(Math.abs(offset) / len)
  const r = len / (2 * Math.sin(theta))
  const a = (theta * 180) / Math.PI
  return offset >= 0 ? [arcR(r, a), arcL(r, a)] : [arcL(r, a), arcR(r, a)]
}

/** Egyenletes sávok rövidítése: állandó érték a lépés alatt */
export const hold = <T>(v: T): Track<T> => [[0, v]]
/** Két érték közti átmenet a lépés egy részében */
export const ramp = (a: number, b: number, from = 0, to = 1): Track<number> => [
  [from, a],
  [to, b],
]
/** Lépcsős váltás a megadott időpontokban: [[t, érték], …] */
export const at = <T>(...keys: [number, T][]): Track<T> => keys

/** Számsáv: alapból `base`, a [from, to] szakaszban `v` (rövid, `edge` hosszú átmenettel) */
export function pulse(from: number, to: number, v = 1, base = 0, edge = 0.03): Track<number> {
  const a = Math.max(0, from - edge)
  const b = Math.min(1, to + edge)
  return [
    [0, base],
    [a, base],
    [Math.max(a, from), v],
    [Math.min(b, to), v],
    [b, base],
  ]
}

/** Számsáv: `a`-ról `b`-re a t időpontban (rövid átmenettel) */
export function stepTo(a: number, b: number, t: number, edge = 0.03): Track<number> {
  return [
    [0, a],
    [Math.max(0, t - edge), a],
    [t, b],
  ]
}

/**
 * Sebességváltások: a fokozat és a kuplung sávja együtt. A kuplung a váltás előtt rövid időre lenyomva, a fokozat
 * a lenyomott kuplung alatt vált. `changes`: [időpont 0..1, új fokozat], időrendben.
 */
export function shifts(first: GearPos, ...changes: [number, GearPos][]): { gear: Track<GearPos>; clutch: Track<number> } {
  const gear: Track<GearPos> = [[0, first], ...changes]
  const clutch: Track<number> = [[0, 0]]
  for (const [t] of changes) {
    const a = Math.max(clutch[clutch.length - 1][0], t - 0.04)
    clutch.push([a, 0], [Math.max(a, t - 0.02), 1], [Math.min(1, t + 0.02), 1], [Math.min(1, t + 0.05), 0])
  }
  return { gear, clutch }
}

/** Több rész egymás utáni összege (m) */
export const sum = (...xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Az időpont (0..1 a lépésben), amikor a kinematika szerint a megtett út eléri a d métert */
export function tAtDist(k: Kin, d: number, stepMs = k.ms): number {
  const hit = k.samples.find(([, s]) => s >= d - 1e-9)
  return Math.min(1, (hit ? hit[0] : k.ms) / stepMs)
}

/** Az út a..b méter közötti szelete (az egyenest hosszban, az ívet szögben vágva) */
export function slicePath(path: Segment[], a: number, b: number): Segment[] {
  const out: Segment[] = []
  let pos = 0
  for (const s of path) {
    const len = segmentLength(s)
    const from = Math.max(a, pos)
    const to = Math.min(b, pos + len)
    if (to > from + 1e-9) {
      const part = to - from
      out.push(s.kind === 'straight' ? { ...s, dist: part } : { ...s, angle: part / s.radius })
    }
    pos += len
  }
  return out
}

/** A kinematika szerint a t ms-ig megtett út (m) */
function distAt(k: Kin, t: number): number {
  const s = k.samples
  if (t <= 0) return 0
  for (let i = 1; i < s.length; i++) {
    if (s[i][0] >= t) {
      const f = (t - s[i - 1][0]) / Math.max(1e-9, s[i][0] - s[i - 1][0])
      return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * f
    }
  }
  return k.dist
}

/**
 * Egyetlen, több lépésen át tartó mozgás (pl. a körben haladó partner) lépésekre bontva: lépésenként az út
 * megfelelő szelete, és rajta a mozgás profilja. `stepMs`: az egymást követő lépések hossza.
 */
export function driveSeq(k: Kin, path: Segment[], stepMs: number[]): Move[] {
  const moves: Move[] = []
  let t0 = 0
  for (const ms of stepMs) {
    const t1 = t0 + ms
    const d0 = distAt(k, t0)
    const d1 = distAt(k, t1)
    const sub = slicePath(path, d0, d1)
    const span = d1 - d0
    const pts: [number, number][] = [[0, 0]]
    for (const [t, d] of k.samples) if (t > t0 && t < t1) pts.push([(t - t0) / ms, span > 0 ? (d - d0) / span : 0])
    pts.push([1, span > 0 ? 1 : 0])
    moves.push(sub.length ? { path: sub, profile: pts } : { path: [] })
    t0 = t1
  }
  return moves
}

/** A `driveSeq` párja: lépésenként a sebességmérő sávja (km/h) */
export function speedSeq(k: Kin, stepMs: number[]): Track<number>[] {
  const out: Track<number>[] = []
  let t0 = 0
  const vAt = (t: number) => {
    const s = k.samples
    if (t <= 0) return s[0][2]
    for (let i = 1; i < s.length; i++) {
      if (s[i][0] >= t) {
        const f = (t - s[i - 1][0]) / Math.max(1e-9, s[i][0] - s[i - 1][0])
        return s[i - 1][2] + (s[i][2] - s[i - 1][2]) * f
      }
    }
    return s[s.length - 1][2]
  }
  for (const ms of stepMs) {
    const t1 = t0 + ms
    const tr: Track<number> = [[0, Math.round(vAt(t0) * 10) / 10]]
    for (const [t, , v] of k.samples) if (t > t0 && t < t1) tr.push([(t - t0) / ms, Math.round(v * 10) / 10])
    tr.push([1, Math.round(vAt(t1) * 10) / 10])
    out.push(tr)
    t0 = t1
  }
  return out
}

/**
 * Egy folyamatos mozgás lépésekre bontva a kinematika részeinek határainál: `partEnds` az egyes lépéseket lezáró
 * rész sorszáma (a `kin` részei közül). Visszaadja a lépések hosszát, a mozgásokat és a sebességmérő sávjait.
 */
export function split(k: Kin, path: Segment[], partEnds: number[]): { ms: number[]; moves: Move[]; speeds: Track<number>[] } {
  const ms = partEnds.map((p, j) => k.ends[p] - (j ? k.ends[partEnds[j - 1]] : 0))
  return { ms, moves: driveSeq(k, path, ms), speeds: speedSeq(k, ms) }
}
