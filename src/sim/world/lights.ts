import type { LightState } from '../../domain/questions'
import type { LightSite, World } from './types'

/**
 * Jelzőlámpa-programok: két fázis (két tengely), 50 s-os ciklus. A magyar sorrendet követi:
 * zöld → sárga → piros → piros-sárga → zöld; a két fázis zöldje között 3 s minden irányban piros (benne a piros-sárga).
 */
export const CYCLE_S = 50
const GREEN = 19
const YELLOW = 3
const RED_YELLOW = 1.5

/** Egy fázis jelzése a ciklus t pillanatában (a 0. fázis a ciklus elején kap zöldet, az 1. a felénél) */
export function phaseState(phase: 0 | 1, t: number): LightState {
  const half = CYCLE_S / 2
  const local = (((t - phase * half) % CYCLE_S) + CYCLE_S) % CYCLE_S
  if (local < GREEN) return 'green'
  if (local < GREEN + YELLOW) return 'yellow'
  // A ciklus végén, a saját zöldje előtt piros-sárga
  if (local >= CYCLE_S - RED_YELLOW) return 'red_yellow'
  return 'red'
}

export function lightState(world: Pick<World, 'controllers'>, light: Pick<LightSite, 'controller' | 'phase'>, t: number): LightState {
  return phaseState(light.phase, t + (world.controllers[light.controller] ?? 0))
}

