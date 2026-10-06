import type { Look } from '../../domain/maneuvers/types'

/** Merre fordítja a fejét a vezető (radián, + = jobbra a menetirányhoz képest) */
export const LOOK_YAW: Record<Look, number> = {
  ahead: 0,
  // Le, a váltóra vagy a műszerfalra (nem fordul, csak lenéz)
  down: 0,
  // Kereszteződésben oldalra, a keresztező út felé
  left: -1.05,
  right: 1.05,
  mirror_left: -0.6,
  mirror_right: 0.75,
  mirror_inner: 0,
  shoulder_left: -2.35,
  shoulder_right: 2.45,
  back: 2.85,
}

/** A visszapillantó tükrök: helyük a kocsin [előre, jobbra, magasság], nézési irányuk (a hátrafelé iránytól), és a képernyőn */
export const MIRRORS = [
  { id: 'mirror_left', at: [1.95, -1.02, 1.05], turn: 0.18, rect: { left: 0.02, bottom: 0.05, w: 0.24, h: 0.15 } },
  { id: 'mirror_inner', at: [1.75, 0, 1.32], turn: 0, rect: { left: 0.3, bottom: 0.83, w: 0.26, h: 0.13 } },
  { id: 'mirror_right', at: [1.95, 1.02, 1.05], turn: -0.18, rect: { left: 0.74, bottom: 0.05, w: 0.24, h: 0.15 } },
] as const

/** A saját autó külön rétegen: a vezető szemével nem látszik (különben a teteje kitöltené a képet), a tükrökben igen */
export const OWN_CAR_LAYER = 1

/** A kocsi közepe (a modell origója) a hátsó tengelytől 1,35 m-re előre */
export const CENTER_F = 1.35
