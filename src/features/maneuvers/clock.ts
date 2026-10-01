import { stepStarts } from '../../domain/maneuvers/check'
import { pathLength, poseAlong, type Pose, type Segment } from '../../domain/maneuvers/geometry'
import type { Maneuver } from '../../domain/maneuvers'

/** Lépéstempó (m/s) 1×-es sebességnél */
const SPEED = 0.9
/** Egy lépés legalább ennyi ideig tart (ms): az állva végzett teendőknél is legyen idő elolvasni */
const MIN_MS = 1800

/**
 * A manőver lejátszása: melyik lépésnél tart és azon belül hol. A felülnézeti rajz és a 3D nézet minden képkockánál
 * innen kérdezi le a kocsi helyzetét, így a React-állapot csak lépésváltáskor változik.
 */
export class ManeuverClock {
  readonly maneuver: Maneuver
  readonly starts: Pose[]
  step = 0
  /** A lépésen belüli előrehaladás, 0..1 */
  progress = 1
  playing = false
  speed = 1
  private startedAt = 0

  constructor(maneuver: Maneuver) {
    this.maneuver = maneuver
    this.starts = stepStarts(maneuver)
  }

  duration(i = this.step): number {
    const len = pathLength(this.maneuver.steps[i].motion)
    return Math.max(MIN_MS, (len / SPEED) * 1000) / this.speed
  }

  /** A lépés elejére áll, és (ha kell) elindítja; megállítva a lépés végén áll, vagy (atStart) az elején */
  goTo(i: number, play: boolean, atStart = false) {
    this.step = Math.max(0, Math.min(this.maneuver.steps.length - 1, i))
    this.progress = play || atStart ? 0 : 1
    this.playing = play
    this.startedAt = performance.now()
  }

  setSpeed(speed: number) {
    this.speed = speed
  }

  /** Képkockánként: továbbléptet; igazat ad, ha a lépés épp most ért véget */
  tick(now = performance.now()): boolean {
    if (!this.playing) return false
    this.progress = Math.min(1, (now - this.startedAt) / this.duration())
    if (this.progress >= 1) {
      this.playing = false
      return true
    }
    return false
  }

  /** A kocsi helyzete most, és az épp végzett mozgás (a kerék elfordulásához) */
  now(): { pose: Pose; segment: Segment | null } {
    const motion = this.maneuver.steps[this.step].motion
    const len = pathLength(motion)
    // Az elejétől a végéig tartó mozgás; állva végzett lépésnél a kezdő póz
    const at = poseAlong(this.starts[this.step], motion, len * this.progress)
    return { pose: at.pose, segment: motion.length ? at.segment : null }
  }
}
