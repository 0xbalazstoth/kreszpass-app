import type { LineString } from 'geojson'
import type { MapPin } from '../../components/MapView'
import { signsForScene } from '../../data/signs'
import type { Scene } from '../../domain/questions'
import type { Situation } from '../../domain/types'
import { metersToDegLat, metersToDegLng, RouteGeom, type LngLat } from '../../lib/geo'

/** A térképen a jelzőlámpa jele (nem tábla, a MapView rajzolja meg) */
export const LIGHT_ICON = 'jelzolampa'

/** Az úttengelytől jobbra ennyi méterre áll a tábla */
const SIDE_M = 6

function offsetRight([lng, lat]: LngLat, bearingDeg: number, m: number): LngLat {
  const b = ((bearingDeg + 90) * Math.PI) / 180
  return [lng + metersToDegLng(Math.sin(b) * m, lat), lat + metersToDegLat(Math.cos(b) * m)]
}

/**
 * Az aktuális kérdés tábláit (és lámpáját) ugyanott mutatja a térképen, ahol a 3D jelenetben állnak:
 * az út jobb oldalán, a helyzet előtt. Más helyzetek táblái nem jelennek meg, hogy a kis térkép átlátható maradjon.
 */
export function sceneMapPins(line: LineString, s: Situation, scene: Scene): MapPin[] {
  let geom: RouteGeom
  try {
    geom = new RouteGeom(line)
  } catch {
    return []
  }
  const signs = signsForScene(scene)
  const out: MapPin[] = []
  const place = (id: string, sign: string, before: number) => {
    const d = geom.clampD(s.d - before)
    out.push({ id, sign, label: '', color: '#1d4ed8', lngLat: offsetRight(geom.pointAt(d), geom.bearingAt(d, 15), SIDE_M) })
  }
  const before = scene.layout === 'road' ? (scene.mySign === 'speed' ? 0 : 4) : scene.layout === 'roundabout' ? 16 : 8
  if (scene.light) place(`${s.id}:light`, LIGHT_ICON, before)
  signs.mine.forEach((code, i) => place(`${s.id}:mine:${i}`, code, before))
  signs.approach.forEach((code, i) => place(`${s.id}:approach:${i}`, code, 50))
  return out
}
