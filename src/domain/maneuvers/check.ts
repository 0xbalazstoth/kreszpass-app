import { angleDelta, carCorners, endOf, pathLength, poseAlong, pointOnCar, polygonsOverlap, rectCorners, wheelRects, type Pose } from './geometry'
import type { Maneuver, ManeuverStep, Site } from './types'

/**
 * A manőverek ellenőrzése: hol áll meg a kocsi, hozzáér-e valamihez, és a lépések referenciapontjai stimmelnek-e.
 * A tesztek és a fejlesztés közbeni hangolás is ezt használja.
 */

/** A parkoló autók sokszögei: ezekhez a kocsi karosszériája sem érhet hozzá */
export function carObstacles(site: Site): [number, number][][] {
  return site.cars.map((c) => carCorners(c.pose))
}

/**
 * A szegélyek sokszögei: ezekhez a kerék nem érhet (8/19). A kocsi orra vagy fara a kb. 15 cm-es szegély fölé
 * érhet (a lökhárító magasabban van), ezért itt csak a kerekeket ellenőrizzük.
 */
export function kerbObstacles(site: Site): [number, number][][] {
  // A 3D jelenet rotY-ja ellentétes irányú, mint a felülnézeti (x, z) forgatás
  return site.kerbs.map((k) => rectCorners(k.x, k.z, k.w, k.d, -(k.rotY ?? 0)))
}

/** Hozzáér-e a kocsi (karosszéria a parkoló autókhoz, kerék a szegélyhez) ebben a pózban */
export function touches(site: Site, pose: Pose): boolean {
  const body = carCorners(pose)
  if (carObstacles(site).some((o) => polygonsOverlap(body, o))) return true
  const kerbs = kerbObstacles(site)
  return wheelRects(pose).some((w) => kerbs.some((k) => polygonsOverlap(w, k)))
}

/** Az egyes lépések kezdő pózai (az utolsó elem a végpóz) */
export function stepStarts(m: Pick<Maneuver, 'start' | 'steps'>): Pose[] {
  const out: Pose[] = [m.start]
  for (const s of m.steps) out.push(endOf(out[out.length - 1], s.motion))
  return out
}

export function finalPose(m: Pick<Maneuver, 'start' | 'steps'>): Pose {
  return stepStarts(m).at(-1)!
}

/** A végpóz eltérése a céltól: távolság (m) és szög (fok) */
export function targetError(m: Maneuver): { dist: number; angle: number } {
  const p = stepStarts(m)[(m.targetAfter ?? m.steps.length - 1) + 1]
  const t = m.site.target.pose
  return { dist: Math.hypot(p.x - t.x, p.z - t.z), angle: Math.abs((angleDelta(p.heading, t.heading) * 180) / Math.PI) }
}

/** Ütközések a mozgás mentén (lépés sorszáma, megtett út), `step` cm-enként mintavételezve */
export function collisions(m: Maneuver, stepM = 0.05): { step: number; at: number }[] {
  const starts = stepStarts(m)
  const out: { step: number; at: number }[] = []
  m.steps.forEach((s, i) => {
    const len = pathLength(s.motion)
    for (let d = 0; d <= len + 1e-9; d += stepM) {
      if (touches(m.site, poseAlong(starts[i], s.motion, d).pose)) {
        out.push({ step: i, at: d })
        break
      }
    }
  })
  return out
}

/** A lépés referenciapontjának eltérése (m) a lépés kezdetén */
export function refError(step: ManeuverStep, start: Pose): number | null {
  if (!step.ref) return null
  const [x, z] = pointOnCar(start, step.ref.car)
  return step.ref.axis === 'z' ? Math.abs(z - step.ref.at[1]) : Math.abs(x - step.ref.at[0])
}
