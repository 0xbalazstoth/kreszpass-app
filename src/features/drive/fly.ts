import type { LineString } from 'geojson'
import type { FlyAlong } from '../../components/MapView'
import { RouteGeom, type LngLat } from '../../lib/geo'

/** Első személyű kamera-út a térképen az útvonal fromD–toD szakaszán, 5 méterenként */
export function flyPath(line: LineString, fromD: number, toD: number, durationMs: number, key: string): FlyAlong | null {
  try {
    const geom = new RouteGeom(line)
    const end = Math.min(geom.length, Math.max(0, toD))
    const begin = Math.max(0, Math.min(fromD, end - 10))
    if (end - begin < 10) return null
    const path: LngLat[] = []
    const bearings: number[] = []
    for (let d = begin; d <= end; d += 5) {
      path.push(geom.pointAt(d))
      bearings.push(geom.bearingAt(d, 15))
    }
    return { path, bearings, durationMs, key }
  } catch {
    return null
  }
}
