import type { Pose, Segment } from './geometry'
import type { ParkedCar, Site, SiteRect } from './types'

/** Parkoló autók színei (a helyszínek ebből válogatnak) */
export const CAR_COLORS = ['#9ca3af', '#dc2626', '#0f766e', '#f8fafc', '#111827', '#65a30d', '#f59e0b', '#7c3aed']

/** Burkolati jel vastagsága (m) */
export const LINE = 0.12

/** Tükrözés az észak–déli tengelyre (x → −x): a jobb oldali manőverből a bal oldali */
export function mirrorPose(p: Pose): Pose {
  return { x: -p.x, z: p.z, heading: -p.heading }
}

export function mirrorRect(r: SiteRect): SiteRect {
  return { ...r, x: -r.x, rotY: r.rotY ? -r.rotY : r.rotY }
}

export function mirrorSegment(s: Segment): Segment {
  return s.kind === 'arc' ? { ...s, dir: s.dir === 'left' ? 'right' : 'left' } : s
}

export function mirrorSite(site: Site): Site {
  const [w, n, e, s] = site.bounds
  return {
    asphalt: site.asphalt.map(mirrorRect),
    kerbs: site.kerbs.map(mirrorRect),
    markings: site.markings.map(mirrorRect),
    cars: site.cars.map((c): ParkedCar => ({ ...c, pose: mirrorPose(c.pose) })),
    target: { ...site.target, pose: mirrorPose(site.target.pose) },
    bounds: [-e, n, -w, s],
  }
}
