import { length, lineSliceAlong, lineString, simplify } from '@turf/turf'
import type { LineString, Position } from 'geojson'
import { db } from '../db'
import { mergeOsm, type OsmData } from './osm'

export { mergeOsm }

/**
 * Ingyenes, közösségi Overpass szerverek. Az overpass-api.de két háttérszerverét (z, lz4) közvetlenül is
 * megpróbáljuk, mert ha az egyik túlterhelt, a másik gyakran azonnal válaszol. A private.coffee tükör az utolsó.
 */
export const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/** Hosszú útvonalat ekkora szakaszokra bontunk, hogy egy-egy lekérdezés kicsi és gyors legyen (m) */
export const CHUNK_M = 3000
/** A szakaszok átfedése, hogy a határon lévő kereszteződés se vesszen el (m) */
const OVERLAP_M = 80
/** Egy szakasz lekérdezésében legfeljebb ennyi pont lehet */
const MAX_POINTS = 150
/** Szerveroldali időkorlát (s) és a böngésző türelme egy kérésre (ms) */
const SERVER_TIMEOUT_S = 25
const REQUEST_TIMEOUT_MS = 30_000
const CACHE_TTL_MS = 14 * 24 * 3600 * 1000

export class OverpassError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'OverpassError'
    this.status = status
  }
}

/** Az útvonalat úgy egyszerűsíti, hogy az alakja megmaradjon, de a lekérdezés kicsi legyen */
export function simplifyForQuery(line: LineString, maxPoints = MAX_POINTS): Position[] {
  let tolerance = 0.00002
  let coords = line.coordinates
  while (coords.length > maxPoints && tolerance < 0.01) {
    coords = simplify(lineString(line.coordinates), { tolerance, highQuality: true }).geometry.coordinates
    tolerance *= 1.6
  }
  return coords
}

/** Hosszú útvonal szakaszokra bontása, kis átfedéssel */
export function splitRoute(line: LineString, chunkM = CHUNK_M, overlapM = OVERLAP_M): LineString[] {
  const f = lineString(line.coordinates)
  const total = length(f, { units: 'meters' })
  if (total <= chunkM * 1.2) return [line]
  const n = Math.ceil(total / chunkM)
  const size = total / n
  const out: LineString[] = []
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i * size - overlapM)
    const end = Math.min(total, (i + 1) * size + overlapM)
    out.push(lineSliceAlong(f, start, end, { units: 'meters' }).geometry)
  }
  return out
}

export function buildQuery(line: LineString, maxPoints = MAX_POINTS): string {
  const poly = simplifyForQuery(line, maxPoints)
    .map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join(',')
  const hw =
    '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road)$'
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];
(
  way(around:30,${poly})[highway~"${hw}"];
  node(around:45,${poly})[highway~"^(stop|give_way|traffic_signals|crossing|mini_roundabout)$"];
  node(around:45,${poly})[railway=level_crossing];
  node(around:45,${poly})[traffic_sign];
  node(around:25,${poly})[railway=tram_stop];
  node(around:25,${poly})[highway=bus_stop];
  node(around:25,${poly})[public_transport=stop_position];
);
out body geom;`
}

/**
 * Az Overpass túlterhelésnél 200-as válasszal is visszaadhat üres, megszakított eredményt
 * („runtime error: Query timed out…”). Ezt hibának kell venni, különben üres adatot tárolnánk el.
 */
function runtimeError(json: unknown): string | null {
  const remark = (json as { remark?: unknown })?.remark
  return typeof remark === 'string' && /runtime error|timed out|out of memory/i.test(remark) ? remark : null
}

/** Több megszakító jel egyesítése (régebbi iOS Safariban nincs AbortSignal.any) */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals)
  const ctrl = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason)
      break
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true })
  }
  return ctrl.signal
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Megszakítva', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Megszakítva', 'AbortError'))
      },
      { once: true },
    )
  })
}

export interface QueryOptions {
  signal?: AbortSignal
  /** Tájékoztató üzenet (pl. „túlterhelt, újrapróbálás…”) */
  onStatus?: (message: string) => void
  fetchImpl?: typeof fetch
  endpoints?: string[]
  maxAttempts?: number
  baseDelayMs?: number
  timeoutMs?: number
}

/**
 * Egy lekérdezés, türelmesen: időkorláttal, szerverváltással és növekvő várakozással újrapróbál,
 * ha a szerver túlterhelt (429, 5xx), időtúllépés van, vagy a szerver maga szakította meg a futást.
 */
export async function queryOverpass(query: string, opts: QueryOptions = {}): Promise<OsmData> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const endpoints = opts.endpoints ?? ENDPOINTS
  const maxAttempts = opts.maxAttempts ?? 6
  const baseDelay = opts.baseDelayMs ?? 3000
  let lastError: Error = new OverpassError('Az OpenStreetMap-szerverek nem érhetők el')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = endpoints[attempt % endpoints.length]
    const timeoutCtrl = new AbortController()
    const timer = setTimeout(() => timeoutCtrl.abort(new DOMException('Időtúllépés', 'TimeoutError')), opts.timeoutMs ?? REQUEST_TIMEOUT_MS)
    const signal = opts.signal ? anySignal([opts.signal, timeoutCtrl.signal]) : timeoutCtrl.signal
    let status: number | undefined
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal,
      })
      status = res.status
      if (!res.ok) throw new OverpassError(`HTTP ${res.status}`, res.status)
      const json = (await res.json()) as OsmData
      const remark = runtimeError(json)
      if (remark) throw new OverpassError(`A szerver megszakította a lekérdezést: ${remark}`, 504)
      clearTimeout(timer)
      return json
    } catch (e) {
      clearTimeout(timer)
      if (opts.signal?.aborted) throw new DOMException('Megszakítva', 'AbortError')
      const code = e instanceof OverpassError ? e.status : status
      // A hibás lekérdezést (400) nincs értelme megismételni
      if (code !== undefined && code >= 400 && code < 500 && code !== 429) throw e
      lastError = e instanceof Error ? e : new OverpassError(String(e))
      if (attempt < maxAttempts - 1) {
        const wait = Math.min(20_000, baseDelay * (attempt + 1))
        const why = code === 429 ? 'túl sok kérés' : code ? `a szerver túlterhelt (${code})` : 'a szerver nem válaszolt időben'
        opts.onStatus?.(`${why}, újrapróbálás ${Math.round(wait / 1000)} mp múlva, másik szerverrel…`)
        await sleep(wait, opts.signal)
      }
    }
  }
  throw lastError
}

async function cacheKey(query: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Egy útvonalszakasz adatai az Overpass szerverről (csak ha a helyi adatcsomag nem fedi le).
 * A kész szakaszok helyben tárolódnak, így megszakadt letöltés újraindításkor onnan folytatódik.
 */
export async function fetchOverpassChunk(
  chunk: LineString,
  opts: { force?: boolean; signal?: AbortSignal; onStatus?: (status: string) => void } = {},
): Promise<{ data: OsmData; fromCache: boolean }> {
  const query = buildQuery(chunk)
  const key = await cacheKey(query)
  const hit = opts.force ? undefined : await db.osmCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { data: hit.data, fromCache: true }
  const data = await queryOverpass(query, { signal: opts.signal, onStatus: opts.onStatus })
  await db.osmCache.put({ key, data, at: Date.now() })
  return { data, fromCache: false }
}

export { sleep }
