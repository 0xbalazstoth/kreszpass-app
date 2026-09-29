import type { LineString } from 'geojson'
import type { Situation, SituationKind } from '../domain/types'
import { angleDiff, bboxOf, metersBetween, RouteGeom, type BBox, type LngLat } from '../lib/geo'

/**
 * Mapillary Graph API v4. Ingyenes, csak egy regisztrált alkalmazás „client token”-je kell
 * (mapillary.com → Dashboard → Developers).
 */
const API = 'https://graph.mapillary.com'

export interface MlImage {
  id: string
  url: string
  angle: number
  lngLat: LngLat
  capturedAt: number
}

interface ImagesResponse {
  data: Array<{
    id: string
    thumb_1024_url?: string
    computed_compass_angle?: number
    compass_angle?: number
    geometry: { coordinates: LngLat }
    captured_at?: number
    is_pano?: boolean
  }>
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (res.status === 401 || res.status === 403) throw new Error('Érvénytelen Mapillary token')
  if (!res.ok) throw new Error(`Mapillary hiba: ${res.status}`)
  return (await res.json()) as T
}

export async function fetchImages(token: string, bbox: BBox, signal?: AbortSignal): Promise<MlImage[]> {
  const url =
    `${API}/images?access_token=${encodeURIComponent(token)}` +
    `&fields=id,thumb_1024_url,computed_compass_angle,compass_angle,geometry,captured_at,is_pano` +
    `&bbox=${bbox.map((v) => v.toFixed(6)).join(',')}&limit=500`
  const json = await getJson<ImagesResponse>(url, signal)
  return json.data
    .filter((i) => i.thumb_1024_url && !i.is_pano)
    .map((i) => ({
      id: i.id,
      url: i.thumb_1024_url!,
      angle: i.computed_compass_angle ?? i.compass_angle ?? 0,
      lngLat: i.geometry.coordinates,
      capturedAt: i.captured_at ?? 0,
    }))
}

/** A helyzet előtti szakaszra néző képek, a közeledés sorrendjében */
export const APPROACH_OFFSETS = [70, 50, 32, 16]

export function pickApproachFrames(geom: RouteGeom, d: number, images: MlImage[]): MlImage[] {
  const frames: MlImage[] = []
  for (const off of APPROACH_OFFSETS) {
    const at = geom.clampD(d - off)
    const p = geom.pointAt(at)
    const heading = geom.bearingAt(at, 12)
    let best: { img: MlImage; score: number } | undefined
    for (const img of images) {
      const dist = metersBetween(p, img.lngLat)
      const turn = angleDiff(heading, img.angle)
      if (dist > 18 || turn > 50) continue
      const score = dist + turn * 0.3
      if (!best || score < best.score) best = { img, score }
    }
    if (best && !frames.some((f) => f.id === best.img.id)) frames.push(best.img)
  }
  return frames
}

export async function approachFrames(token: string, line: LineString, s: Situation, signal?: AbortSignal): Promise<MlImage[]> {
  const geom = new RouteGeom(line)
  const pts = [geom.pointAt(s.d - APPROACH_OFFSETS[0] - 10), geom.pointAt(s.d)]
  const images = await fetchImages(token, bboxOf(pts, 25), signal)
  return pickApproachFrames(geom, s.d, images)
}

// ------------------------------------------------------------ Felismert táblák

interface FeaturesResponse {
  data: Array<{ id: string; object_value: string; geometry: { coordinates: LngLat } }>
}

export interface MlSign {
  id: string
  value: string
  lngLat: LngLat
}

/** Nagy útvonalnál a befoglaló téglalapot darabokra bontjuk (az API kis területet enged) */
function tiles(b: BBox, size = 0.01): BBox[] {
  const out: BBox[] = []
  for (let x = b[0]; x < b[2]; x += size)
    for (let y = b[1]; y < b[3]; y += size) out.push([x, y, Math.min(x + size, b[2]), Math.min(y + size, b[3])])
  return out
}

export async function fetchSigns(token: string, line: LineString, signal?: AbortSignal): Promise<MlSign[]> {
  const all = new Map<string, MlSign>()
  for (const t of tiles(bboxOf(line.coordinates, 30))) {
    const url =
      `${API}/map_features?access_token=${encodeURIComponent(token)}` +
      `&fields=id,object_value,geometry&bbox=${t.map((v) => v.toFixed(6)).join(',')}&limit=2000`
    const json = await getJson<FeaturesResponse>(url, signal)
    for (const f of json.data) all.set(f.id, { id: f.id, value: f.object_value, lngLat: f.geometry.coordinates })
  }
  return [...all.values()]
}

export function signToKind(value: string): { kind: SituationKind; speed?: number } | null {
  if (value.startsWith('regulatory--stop--')) return { kind: 'stop' }
  if (value.startsWith('regulatory--yield--')) return { kind: 'give_way' }
  if (value.startsWith('regulatory--priority-road--')) return { kind: 'priority' }
  if (value.startsWith('regulatory--roundabout--')) return { kind: 'roundabout' }
  if (value.startsWith('information--pedestrians-crossing--')) return { kind: 'crossing' }
  const m = /^regulatory--maximum-speed-limit-(\d+)--/.exec(value)
  if (m) return { kind: 'speed_change', speed: Number(m[1]) }
  return null
}

/**
 * A Mapillary által felismert táblákból azokat adja hozzá, amelyek közelében még nincs
 * hasonló helyzet. A tábla iránya nem ismert, ezért mind kézi ellenőrzést igényel.
 */
export function mergeSigns(
  line: LineString,
  existing: Situation[],
  signs: MlSign[],
  routeId: string,
  newId: () => string = () => crypto.randomUUID(),
): Situation[] {
  const geom = new RouteGeom(line)
  const added: Situation[] = []
  for (const sign of signs) {
    const k = signToKind(sign.value)
    if (!k) continue
    const pr = geom.project(sign.lngLat)
    if (pr.dist > 12 || pr.d < 15) continue
    const related = (s: Situation) =>
      Math.abs(s.d - pr.d) < 50 &&
      (s.kind === k.kind ||
        (k.kind !== 'speed_change' && k.kind !== 'crossing' && ['stop', 'give_way', 'priority', 'equal', 'signals'].includes(s.kind)))
    if ([...existing, ...added].some(related)) continue
    const [lng, lat] = geom.pointAt(pr.d)
    added.push({
      id: newId(),
      routeId,
      d: Math.round(pr.d),
      lng,
      lat,
      bearing: Math.round(geom.bearingBetween(Math.max(0, pr.d - 25), pr.d)),
      kind: k.kind,
      turn: 'straight',
      speedTo: k.speed,
      needsReview: true,
      source: 'mapillary',
      note: `Mapillary: ${sign.value}`,
    })
  }
  return added
}
