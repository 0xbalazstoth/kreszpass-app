import { pathLength, poseAlong, type Pose, type Segment } from '../domain/maneuvers/geometry'

/** Felülnézeti rajzok segédfüggvényei (méterben, a 3D jelenet koordinátáival) */

export const toDeg = (r: number) => (r * 180) / Math.PI

export function transformOf(p: Pose): string {
  return `translate(${p.x} ${p.z}) rotate(${toDeg(p.heading)})`
}

/** Egy mozgás útja a hátsó tengely közepén, 20 cm-enként */
export function pathPoints(start: Pose, motion: Segment[]): string {
  const len = pathLength(motion)
  const pts: string[] = []
  for (let d = 0; d <= len + 1e-6; d += 0.2) {
    const p = poseAlong(start, motion, d).pose
    pts.push(`${p.x.toFixed(2)},${p.z.toFixed(2)}`)
  }
  const end = poseAlong(start, motion, len).pose
  pts.push(`${end.x.toFixed(2)},${end.z.toFixed(2)}`)
  return pts.join(' ')
}
