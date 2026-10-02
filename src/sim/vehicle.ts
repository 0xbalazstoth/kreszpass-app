import { CAR, R_MIN } from '../domain/maneuvers/geometry'

/**
 * A saját autó mozgása: kinematikus „bicikli-modell” (a hátsó tengely közepe körül fordul, mint a valóságban),
 * automata váltóval. Tiszta függvények, hogy a szimuláció böngésző nélkül is tesztelhető legyen.
 */

export interface Controls {
  /** 0..1 */
  throttle: number
  /** 0..1 */
  brake: number
  /** −1 (teljesen balra) .. 1 (teljesen jobbra) */
  steer: number
  handbrake: boolean
}

export const NO_CONTROLS: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false }

export type Gear = 'D' | 'R'

export interface CarState {
  /** A hátsó tengely közepe (m) */
  x: number
  z: number
  /** 0 = észak (−z), π/2 = kelet; jobbra fordulva nő */
  heading: number
  /** m/s; hátramenetben negatív */
  speed: number
  /** A kormányzott kerekek szöge (radián, + = jobbra) */
  wheel: number
  gear: Gear
  handbrake: boolean
  indicator: 'left' | 'right' | null
  hazard: boolean
  /** Az irányjelző automatikus visszakapcsolásához: a kormány már elfordult az index irányába */
  indicatorArmed: boolean
}

/** Teljes kormánykitérésnél a kerekek szöge: tan(δ) = tengelytáv / fordulósugár */
export const MAX_WHEEL = Math.atan(CAR.wheelbase / R_MIN)
/** A kerekek legnagyobb elfordulási sebessége (rad/s) */
const WHEEL_RATE = 1.4
/** Teljes gáznál a gyorsulás álló helyzetben, és ahogy csökken a sebességgel (m/s²) */
const ACCEL_0 = 3.0
const ACCEL_FALL = 0.075
/** Teljes fékezés lassulása (m/s²) */
const BRAKE_MAX = 8.5
/** Motorfék, gördülési ellenállás, légellenállás */
const ENGINE_BRAKE = 0.5
const ROLLING = 0.12
const DRAG = 0.0004
/** Automata váltó: fék és gáz nélkül kúszik (m/s) */
const CREEP = 1.6
const REVERSE_MAX = 3.5
const HANDBRAKE_DECEL = 4

export function initialCar(x: number, z: number, heading: number): CarState {
  return { x, z, heading, speed: 0, wheel: 0, gear: 'D', handbrake: true, indicator: null, hazard: false, indicatorArmed: false }
}

/** Váltás előre/hátra: csak álló helyzetben */
export function toggleGear(c: CarState): CarState {
  if (Math.abs(c.speed) > 0.3) return c
  return { ...c, gear: c.gear === 'D' ? 'R' : 'D' }
}

/** Irányjelző kapcsolása: ugyanarra újra nyomva kikapcsol */
export function toggleIndicator(c: CarState, dir: 'left' | 'right'): CarState {
  return { ...c, indicator: c.indicator === dir ? null : dir, indicatorArmed: false }
}

/**
 * Nagyobb sebességnél a kormány (billentyűzetnél) kevésbé fordul ki teljesen, mint egy valódi autóban
 * a sebességfüggő szervokormány érzete: 50 km/h-nál kb. a fele.
 */
export function steerLimit(speed: number): number {
  return MAX_WHEEL / (1 + (speed * speed) / 190)
}

export function stepCar(c: CarState, ctl: Controls, dt: number): CarState {
  // ---------------------------------------------------------------- kormány
  const target = ctl.steer * steerLimit(Math.abs(c.speed))
  const dw = Math.max(-WHEEL_RATE * dt, Math.min(WHEEL_RATE * dt, target - c.wheel))
  const wheel = c.wheel + dw

  // ---------------------------------------------------------------- hosszirányú mozgás
  const dirSign = c.gear === 'D' ? 1 : -1
  let v = c.speed * dirSign // a választott irányban mért sebesség (normál esetben ≥ 0)
  let a = 0
  if (ctl.throttle > 0 && !c.handbrake) {
    const max = c.gear === 'D' ? ACCEL_0 - ACCEL_FALL * Math.max(0, v) : v < REVERSE_MAX ? 1.8 : 0
    a += ctl.throttle * Math.max(0, max)
  } else if (!c.handbrake && ctl.brake < 0.05 && v < CREEP) {
    // Kúszás (automata váltó)
    a += 0.8
  } else if (v > 0) a -= ENGINE_BRAKE
  if (v > 0) a -= ROLLING + DRAG * v * v
  // Fék és kézifék: csak a mozgás ellen hat
  const decel = ctl.brake * BRAKE_MAX + (c.handbrake || ctl.handbrake ? HANDBRAKE_DECEL : 0)
  v += a * dt
  if (v > 0) v = Math.max(0, v - decel * dt)
  else if (v < 0) v = Math.min(0, v + decel * dt)
  // Behúzott kézifékkel álló helyzetből nem indul el
  if ((c.handbrake || ctl.handbrake) && Math.abs(v) < 0.5) v = 0
  // A kerekek nem forognak a választott iránnyal szemben (nincs visszagurulás sík úton)
  if (v < 0) v = 0
  const speed = v * dirSign

  // ---------------------------------------------------------------- helyzet (a hátsó tengely körül)
  const heading = c.heading + (speed / CAR.wheelbase) * Math.tan(wheel) * dt
  const hm = (c.heading + heading) / 2
  const x = c.x + Math.sin(hm) * speed * dt
  const z = c.z - Math.cos(hm) * speed * dt

  // ---------------------------------------------------------------- irányjelző visszakapcsolása (mint a valódi autóban)
  let indicator = c.indicator
  let armed = c.indicatorArmed
  if (indicator) {
    const toward = indicator === 'right' ? wheel : -wheel
    if (toward > MAX_WHEEL * 0.35) armed = true
    else if (armed && toward < MAX_WHEEL * 0.08) {
      indicator = null
      armed = false
    }
  }

  return { ...c, x, z, heading, speed, wheel, indicator, indicatorArmed: armed }
}

/** A kocsi középpontja (a modell origója) a hátsó tengelytől előre */
export const CENTER_F = 1.35

/** A kocsi négy sarka és a négy kerék helye a világban: [előre, jobbra] a hátsó tengelytől */
export function carPoints(c: Pick<CarState, 'x' | 'z' | 'heading'>): { corners: [number, number][]; wheels: [number, number][] } {
  const fx = Math.sin(c.heading)
  const fz = -Math.cos(c.heading)
  const rx = Math.cos(c.heading)
  const rz = Math.sin(c.heading)
  const at = (f: number, r: number): [number, number] => [c.x + fx * f + rx * r, c.z + fz * f + rz * r]
  const hw = CAR.width / 2
  const track = 0.78
  return {
    corners: [at(CAR.front, -hw), at(CAR.front, hw), at(-CAR.rearOverhang, hw), at(-CAR.rearOverhang, -hw)],
    wheels: [at(CAR.wheelbase, -track), at(CAR.wheelbase, track), at(0, track), at(0, -track)],
  }
}
