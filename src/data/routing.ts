import { gpx, kml } from '@tmcw/togeojson'
import type { LineString, Position } from 'geojson'
import type { LngLat } from '../lib/geo'

/**
 * Útpontok útra illesztése az ingyenes OSRM demó szerverrel.
 * A demó szerver csak kis forgalomra való; mi egy útvonalat egyszer illesztünk.
 */
const OSRM = 'https://router.project-osrm.org/route/v1/driving'
const CHUNK = 80
const UNAVAILABLE =
  'Az ingyenes útvonaltervező szerver most nem érhető el. Próbáld újra később, vagy használd az „Egyenes szakaszok” gombot (sűrűbb útpontokkal), illetve a GPX/KML importot.'

export async function snapToRoads(waypoints: LngLat[], signal?: AbortSignal): Promise<LineString> {
  if (waypoints.length < 2) throw new Error('Legalább két útpont kell')
  const coords: Position[] = []
  for (let start = 0; start < waypoints.length - 1; start += CHUNK - 1) {
    const chunk = waypoints.slice(start, start + CHUNK)
    const path = chunk.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
    const timeout = AbortSignal.timeout(20_000)
    let res: Response
    try {
      res = await fetch(`${OSRM}/${path}?overview=full&geometries=geojson&continue_straight=true`, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new Error(UNAVAILABLE)
    }
    if (!res.ok) throw new Error(`${UNAVAILABLE} (${res.status})`)
    const json = (await res.json()) as { code: string; message?: string; routes?: { geometry: LineString }[] }
    if (json.code !== 'Ok' || !json.routes?.length) throw new Error(`Útvonaltervező: ${json.message ?? json.code}`)
    const part = json.routes[0].geometry.coordinates
    coords.push(...(coords.length ? part.slice(1) : part))
  }
  return { type: 'LineString', coordinates: coords }
}

/** GPX vagy KML fájlból az első nyomvonal (a szakaszokat összefűzve) */
export function parseTrackFile(fileName: string, text: string): LineString {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('A fájl nem érvényes XML')
  const fc = fileName.toLowerCase().endsWith('.kml') ? kml(doc) : gpx(doc)
  const coords: Position[] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') coords.push(...g.coordinates)
    else if (g.type === 'MultiLineString') g.coordinates.forEach((c) => coords.push(...c))
  }
  if (coords.length < 2) {
    // Nyomvonal helyett útpontok (wpt) is jók
    for (const f of fc.features) if (f.geometry?.type === 'Point') coords.push(f.geometry.coordinates)
  }
  if (coords.length < 2) throw new Error('Nem találtam nyomvonalat a fájlban')
  return { type: 'LineString', coordinates: coords.map(([x, y]) => [x, y]) }
}
