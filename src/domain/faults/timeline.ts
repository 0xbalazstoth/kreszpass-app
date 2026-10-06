import { endOf, pathLength, poseAlong, steerTurns, type Pose, type Segment } from '../maneuvers/geometry'
import type { Look } from '../maneuvers/types'
import type { LightState } from '../questions'
import type { Blink, ControlState, FaultLesson, FaultStep, Track } from './types'

/**
 * A leckék időzítése: egy lépés adott pillanatában hol vannak a szereplők, mit mutatnak a műszerek és a lámpák.
 * Tiszta logika: a felülnézet, a 3D nézet, a műszerfal és a tesztek is ebből számolnak.
 */

export const DEFAULT_CONTROLS: ControlState = {
  speed: 0,
  rpm: -1,
  gear: 'N',
  clutch: 0,
  brake: 0,
  gas: 0,
  handbrake: false,
  seatbelt: true,
  engine: true,
  lights: 'low',
  indicator: 'off',
  steer: null,
}

/** Egy lépés legrövidebb hossza (ms), hogy a szöveget el lehessen olvasni */
export const MIN_STEP_MS = 2200

/** A kulcskockák értéke t-ben (0..1); számnál lineáris, egyébként az utolsó elért kulcskocka */
export function sample<T>(track: Track<T>, t: number): T {
  if (track.length === 0) throw new Error('Üres sáv')
  if (t <= track[0][0]) return track[0][1]
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i]
    if (t < t1) {
      const [t0, v0] = track[i - 1]
      if (typeof v0 === 'number' && typeof v1 === 'number') {
        const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1
        return (v0 + (v1 - v0) * f) as T
      }
      return v0
    }
  }
  return track[track.length - 1][1]
}

/** Az állapot egy lépés elején (vagy végén) */
export interface StepState {
  poses: Record<string, Pose>
  controls: ControlState
  signals: Record<string, LightState>
  blinks: Record<string, Blink>
  look: Look
}

function last<T>(track: Track<T> | undefined, fallback: T): T {
  return track && track.length ? track[track.length - 1][1] : fallback
}

/** Az állapot a lépés végén */
export function endState(base: StepState, step: FaultStep): StepState {
  const poses = { ...base.poses }
  for (const [id, m] of Object.entries(step.moves ?? {})) poses[id] = endOf(poses[id], m.path)
  const controls = { ...base.controls }
  for (const key of Object.keys(step.controls ?? {}) as (keyof ControlState)[]) {
    ;(controls as Record<string, unknown>)[key] = last(step.controls![key] as Track<unknown>, controls[key])
  }
  const signals = { ...base.signals }
  for (const [id, tr] of Object.entries(step.signals ?? {})) signals[id] = last(tr, signals[id])
  const blinks = { ...base.blinks }
  for (const [id, tr] of Object.entries(step.blinks ?? {})) blinks[id] = last(tr, blinks[id] ?? 'off')
  return { poses, controls, signals, blinks, look: last(step.look, base.look) }
}

export function initialState(lesson: FaultLesson): StepState {
  return {
    poses: Object.fromEntries(lesson.actors.map((a) => [a.id, a.start])),
    controls: { ...DEFAULT_CONTROLS },
    signals: Object.fromEntries((lesson.world.lights ?? []).map((l) => [l.id, 'red' as LightState])),
    blinks: {},
    look: 'ahead',
  }
}

/**
 * Minden lépés kezdőállapota. A helyzet lépései egymás után következnek; a hibás és a helyes ág első lépése
 * egyaránt a helyzet végéről indul (az ágon belül a lépések ismét egymásra épülnek).
 */
export function stepStates(lesson: FaultLesson): StepState[] {
  const out: StepState[] = []
  let cur = initialState(lesson)
  let setupEnd = cur
  lesson.steps.forEach((s, i) => {
    const prev = lesson.steps[i - 1]
    if (s.phase !== 'setup' && (!prev || prev.phase !== s.phase)) cur = setupEnd
    out.push(cur)
    cur = endState(cur, s)
    if (s.phase === 'setup') setupEnd = cur
  })
  return out
}

/** A lépés hossza 1×-es tempónál (ms) */
export function stepMs(step: FaultStep): number {
  if (step.ms) return step.ms
  const longest = Math.max(0, ...Object.values(step.moves ?? {}).map((m) => pathLength(m.path)))
  // Kb. 25 km/h-s lejátszás, ha nincs megadva
  return Math.max(MIN_STEP_MS, (longest / 7) * 1000)
}

export interface ActorFrame {
  pose: Pose
  /** Az épp megtett szakasz (a kerekek elfordulásához) */
  segment: Segment | null
  moving: boolean
  blink: Blink
}

export interface Frame {
  actors: Record<string, ActorFrame>
  controls: ControlState
  signals: Record<string, LightState>
  look: Look
}

/** A jelenet állapota a lépés t (0..1) pillanatában */
export function frameAt(lesson: FaultLesson, base: StepState, step: FaultStep, t: number): Frame {
  const actors: Record<string, ActorFrame> = {}
  for (const a of lesson.actors) {
    const m = step.moves?.[a.id]
    const blinkTrack = a.kind === 'own' ? step.controls?.indicator : step.blinks?.[a.id]
    const blink = blinkTrack ? sample(blinkTrack, t) : a.kind === 'own' ? base.controls.indicator : (base.blinks[a.id] ?? 'off')
    if (!m || !m.path.length) {
      actors[a.id] = { pose: base.poses[a.id], segment: null, moving: false, blink }
      continue
    }
    const len = pathLength(m.path)
    const f = m.profile ? sample(m.profile, t) : t
    const at = poseAlong(base.poses[a.id], m.path, len * Math.min(1, Math.max(0, f)))
    const f2 = m.profile ? sample(m.profile, Math.min(1, t + 0.02)) : Math.min(1, t + 0.02)
    actors[a.id] = { pose: at.pose, segment: at.segment, moving: f2 > f + 1e-4, blink }
  }
  const controls = { ...base.controls }
  for (const key of Object.keys(step.controls ?? {}) as (keyof ControlState)[]) {
    ;(controls as Record<string, unknown>)[key] = sample(step.controls![key] as Track<unknown>, t)
  }
  // A kormány: ha nincs külön megadva, a saját autó útjából (mint a manővereknél)
  const own = lesson.actors.find((a) => a.kind === 'own')
  if (controls.steer === null && own) controls.steer = actors[own.id].moving || actors[own.id].segment ? steerTurns(actors[own.id].segment) : 0
  if (controls.rpm < 0) controls.rpm = autoRpm(controls)
  const signals = { ...base.signals }
  for (const [id, tr] of Object.entries(step.signals ?? {})) signals[id] = sample(tr, t)
  return { actors, controls, signals, look: step.look ? sample(step.look, t) : base.look }
}

/** km/h ezer fordulatonként fokozatonként (egy átlagos kisautó) */
const KMH_PER_1000: Record<string, number> = { '1': 8, '2': 15, '3': 23, '4': 31, '5': 39, R: 8 }

/** Fordulatszám a sebességből és a fokozatból, ha a lecke nem adja meg */
export function autoRpm(c: ControlState): number {
  if (!c.engine) return 0
  const idle = 850 + c.gas * 2600
  if (c.gear === 'N' || c.clutch > 0.6) return Math.round(idle)
  return Math.round(Math.max(idle * (c.gas > 0.05 ? 1 : 0.95), (c.speed / KMH_PER_1000[c.gear]) * 1000))
}
