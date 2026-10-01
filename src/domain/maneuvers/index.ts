import { M4, M5 } from './parallel'
import { M1, M2 } from './perpendicularForward'
import { M3 } from './perpendicularReverse'
import { M6, M7 } from './turns'
import type { Maneuver } from './types'

export type { Maneuver, ManeuverStep, Look, Site } from './types'

/** A vizsga hét manővere a minősítő lap sorrendjében */
export const MANEUVERS: Maneuver[] = [M1, M2, M3, M4, M5, M6, M7]

export function maneuverById(id: string | undefined): Maneuver | undefined {
  return MANEUVERS.find((m) => m.id === id)
}
