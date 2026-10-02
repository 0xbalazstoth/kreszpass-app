import type { Road } from './types'

/**
 * Sávok és útszélesség. A sávok a felezővonalhoz igazodnak (az út rajzolási irányában jobbra az előre, balra a vele
 * szemben haladó sávok); ahol egy út szélesebb folytatásához csatlakozik, a burkolat fokozatosan (legfeljebb 35 m-en)
 * szélesedik, mint a valóságban a sáv-megszűnésnél, és nem lépcsőzetesen.
 */

const TAPER_M = 35

/** Az út félszélessége az s helyen (a csatlakozások felé kiszélesedve) */
export function halfWidthAt(r: Road, s: number): number {
  const taper = Math.min(TAPER_M, r.length / 2)
  let hw = r.halfWidth
  if (r.hwStart !== undefined && s < taper) hw = Math.max(hw, r.hwStart + ((r.halfWidth - r.hwStart) * s) / taper)
  if (r.hwEnd !== undefined && s > r.length - taper) hw = Math.max(hw, r.hwEnd + ((r.halfWidth - r.hwEnd) * (r.length - s)) / taper)
  return hw
}

/** A két irány határa (a felezővonal) a középvonalhoz képest, az út rajzolási irányában (+ = jobbra) */
export function dividerOf(r: Road): number {
  return ((r.lanesBack - r.lanesFwd) * r.laneWidth) / 2
}

/**
 * Egy irány sávjainak oldalsó tartománya a középvonalhoz képest (az út rajzolási irányában):
 * dir = 1 az előre, −1 a vele szemben haladók sávjai.
 */
export function lanesRange(r: Road, dir: 1 | -1): { lo: number; hi: number } {
  const d = dividerOf(r)
  return dir === 1 ? { lo: d, hi: d + r.lanesFwd * r.laneWidth } : { lo: d - r.lanesBack * r.laneWidth, hi: d }
}

/**
 * A haladási irányunk szerinti jobb szélső sáv közepe, a középvonaltól a haladási irányunkhoz képest jobbra mérve
 * (aligned: az út rajzolási irányában haladunk-e).
 */
export function rightLaneCentre(r: Road, aligned: boolean): number {
  if (aligned) {
    const { hi } = lanesRange(r, 1)
    return hi - r.laneWidth / 2
  }
  const { lo } = lanesRange(r, -1)
  return -(lo + r.laneWidth / 2)
}
