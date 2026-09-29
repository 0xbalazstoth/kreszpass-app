import { lineString, simplify } from '@turf/turf'
import type { LineString, Position } from 'geojson'
import { db } from '../db'
import type { OsmData } from './osm'

/** Ingyenes, közösségi Overpass szerverek. Sorban próbáljuk őket. */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

/** A lekérdezésbe kerülő útvonal legfeljebb ennyi pontból állhat */
const MAX_POINTS = 350
const CACHE_TTL_MS = 14 * 24 * 3600 * 1000

/** Az útvonalat úgy egyszerűsíti, hogy az alakja megmaradjon, de a lekérdezés kicsi legyen */
export function simplifyForQuery(line: LineString): Position[] {
  let tolerance = 0.00003
  let coords = line.coordinates
  while (coords.length > MAX_POINTS && tolerance < 0.01) {
    coords = simplify(lineString(line.coordinates), { tolerance, highQuality: true }).geometry.coordinates
    tolerance *= 1.6
  }
  return coords
}

export function buildQuery(line: LineString): string {
  const poly = simplifyForQuery(line)
    .map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join(',')
  const hw =
    '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road)$'
  return `[out:json][timeout:90];
(
  way(around:30,${poly})[highway~"${hw}"];
  node(around:45,${poly})[highway~"^(stop|give_way|traffic_signals|crossing|mini_roundabout)$"];
);
out body geom;`
}

async function cacheKey(query: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fetchOsmForRoute(line: LineString, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<OsmData> {
  const query = buildQuery(line)
  const key = await cacheKey(query)
  if (!opts.force) {
    const hit = await db.osmCache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data
  }
  let lastError: unknown
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: opts.signal,
      })
      if (!res.ok) throw new Error(`Overpass hiba: ${res.status} ${res.statusText}`)
      const data = (await res.json()) as OsmData
      await db.osmCache.put({ key, data, at: Date.now() })
      return data
    } catch (e) {
      if (opts.signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Az Overpass szerverek nem érhetők el')
}
