import type { BBox } from '../lib/geo'

/**
 * Címkeresés az OpenStreetMap ingyenes, kulcs nélküli Nominatim szolgáltatásával.
 * A használati feltételek szerint legfeljebb 1 kérés másodpercenként: a kéréseket ezért sorba állítjuk.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_GAP_MS = 1100
const TIMEOUT_MS = 15_000
const UNAVAILABLE = 'A címkereső (OpenStreetMap Nominatim) most nem érhető el. Próbáld újra kicsit később.'

export interface GeoResult {
  name: string
  lng: number
  lat: number
  /** [nyugat, dél, kelet, észak] */
  bbox: BBox
}

type FetchLike = typeof fetch

let lastRequest = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Tesztekhez: a kérések közti várakozás nullázása */
export function resetGeocodeThrottle(): void {
  lastRequest = 0
}

interface NominatimHit {
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}

export async function geocode(query: string, opts: { signal?: AbortSignal; fetchImpl?: FetchLike; limit?: number } = {}): Promise<GeoResult[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const wait = lastRequest + MIN_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequest = Date.now()
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'hu',
    limit: String(opts.limit ?? 5),
    'accept-language': 'hu',
  })
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(`${ENDPOINT}?${params}`, { signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout })
  } catch (e) {
    if (opts.signal?.aborted) throw e
    throw new Error(UNAVAILABLE)
  }
  if (!res.ok) throw new Error(`${UNAVAILABLE} (${res.status})`)
  const hits = (await res.json()) as NominatimHit[]
  return hits.map((h) => {
    const [s, n, w, e] = h.boundingbox.map(Number)
    return { name: h.display_name, lng: Number(h.lon), lat: Number(h.lat), bbox: [w, s, e, n] }
  })
}
