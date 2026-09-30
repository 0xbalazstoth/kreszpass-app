import { metersBetween, metersToDegLat, metersToDegLng, type BBox } from '../lib/geo'
import { geocode, type GeoResult } from './geocode'
import { fetchLocalOsmBBox, loadLocalIndex } from './osmLocal'
import type { StreetRow } from '../domain/types'
import { buildStreetRoute, parseStreetList, roadNumber, type StreetRoute } from './streetRoute'

/** Legfeljebb ekkora területet töltünk be (km), hogy a helyi csempék letöltése gyors maradjon */
const MAX_AREA_KM = 20
/** Az utcák környezete: a csatlakozó utcák is beleférjenek (m) */
const AREA_PAD_M = 1000

function pad([w, s, e, n]: BBox, m: number): BBox {
  const dLat = metersToDegLat(m)
  const dLng = metersToDegLng(m, (s + n) / 2)
  return [w - dLng, s - dLat, e + dLng, n + dLat]
}

function union(boxes: BBox[]): BBox {
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))]
}

function intersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

const center = (h: GeoResult): [number, number] => [h.lng, h.lat]

/**
 * Az azonos nevű utcák közül (pl. több „Kossuth utca” egy városban) azokat választja, amelyek egymáshoz közel vannak:
 * az első utcánál a következő utca találataihoz legközelebbit, utána mindig az előzőhöz legközelebbit.
 */
export function pickNearby(hitsPerEntry: GeoResult[][]): GeoResult[] {
  const lists = hitsPerEntry.filter((h) => h.length)
  if (!lists.length) return []
  const nearest = (from: GeoResult, list: GeoResult[]) =>
    list.reduce((best, h) => (metersBetween(center(h), center(from)) < metersBetween(center(best), center(from)) ? h : best))
  let first = lists[0][0]
  if (lists.length > 1) {
    first = lists[0].reduce((best, h) =>
      metersBetween(center(nearest(h, lists[1])), center(h)) < metersBetween(center(nearest(best, lists[1])), center(best)) ? h : best,
    )
  }
  const chosen = [first]
  for (const list of lists.slice(1)) chosen.push(nearest(chosen[chosen.length - 1], list))
  return chosen
}

export interface StreetRouteOptions {
  signal?: AbortSignal
  onStatus?: (text: string) => void
}

/**
 * A sorok tisztítása: üres utcájú sor kimarad, üres település a fölötte lévő soré lesz. Ha egy utcamezőbe
 * több utcát írtak vagy másoltak (új sor, gondolatjel, vessző…), azok külön sorok lesznek ugyanazzal a településsel.
 */
export function cleanRows(rows: StreetRow[]): StreetRow[] {
  const out: StreetRow[] = []
  let town = ''
  for (const r of rows) {
    town = r.town.trim() || town
    for (const street of parseStreetList(r.street)) out.push({ town, street })
  }
  return out
}

/**
 * Útvonal a sorokból (település + utca): a Nominatim megmutatja, hol vannak az utcák (mindegyik a saját
 * településén belül), az útvonalat pedig a helyi (az apphoz csomagolt) OpenStreetMap-adatokból építjük fel.
 */
export async function routeFromStreets(input: StreetRow[], opts: StreetRouteOptions = {}): Promise<StreetRoute> {
  const rows = cleanRows(input)
  if (rows.length < 2) throw new Error('Legalább két utcát adj meg, sorrendben (pl. „Budaörsi út”, majd „Villányi út”).')
  const missing = rows.find((r) => !r.town && !roadNumber(r.street))
  if (missing) throw new Error(`Add meg a települést vagy a kerületet az első sorban (pl. „Budapest XI. kerület”, „Szeged”).`)
  const index = await loadLocalIndex()
  if (!index) throw new Error('Nincs helyi térképadat az appban. Futtasd az `npm run osm` parancsot.')

  // Településenként egy keresés
  const towns = new Map<string, GeoResult>()
  for (const town of new Set(rows.map((r) => r.town).filter(Boolean))) {
    opts.onStatus?.(`Település keresése: ${town}…`)
    const hit = (await geocode(town, { signal: opts.signal, limit: 1 }))[0]
    if (!hit) throw new Error(`Nem találom a települést: „${town}”.`)
    towns.set(town, hit)
  }

  const hits: GeoResult[][] = []
  for (const [i, row] of rows.entries()) {
    if (roadNumber(row.street)) continue
    opts.onStatus?.(`Utcák keresése: ${i + 1}/${rows.length} (${row.street}, ${row.town})…`)
    const townHit = towns.get(row.town)
    const found = await geocode(`${row.street}, ${row.town}`, { signal: opts.signal })
    hits.push(townHit ? found.filter((h) => intersects(h.bbox, pad(townHit.bbox, 2000))) : found)
  }
  const chosen = pickNearby(hits)
  const fallback = [...towns.values()].map((t) => t.bbox)
  const area = pad(chosen.length ? union(chosen.map((h) => h.bbox)) : union(fallback), AREA_PAD_M)
  const widthKm = metersBetween([area[0], (area[1] + area[3]) / 2], [area[2], (area[1] + area[3]) / 2]) / 1000
  const heightKm = metersBetween([area[0], area[1]], [area[0], area[3]]) / 1000
  if (widthKm > MAX_AREA_KM || heightKm > MAX_AREA_KM)
    throw new Error(
      `Az utcák túl nagy területen (${Math.round(widthKm)} × ${Math.round(heightKm)} km) szóródnak. Add meg pontosabban a települést (pl. kerületet), vagy ellenőrizd a neveket.`,
    )

  opts.onStatus?.('Helyi térképadatok betöltése…')
  const osm = await fetchLocalOsmBBox(area, index, { signal: opts.signal })
  opts.onStatus?.('Útvonal összeállítása…')
  return buildStreetRoute(
    rows.map((r) => r.street),
    osm,
  )
}
