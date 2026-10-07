import type { Pose } from '../maneuvers/geometry'

/** A helyzet a kör egy pontján: a körpályán az óramutatóval ellentétesen haladó szereplő póza (ψ: a pont szöge) */
export function ringPose(psi: number, r: number): Pose {
  return { x: r * Math.cos(psi), z: -r * Math.sin(psi), heading: -psi }
}
