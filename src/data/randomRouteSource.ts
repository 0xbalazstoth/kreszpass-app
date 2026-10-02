import { booleanPointInPolygon, point } from '@turf/turf'
import { bboxContains, metersToDegLat, metersToDegLng, type BBox, type LngLat } from '../lib/geo'
import { geocode } from './geocode'
import { fetchLocalOsmBBox, loadLocalIndex } from './osmLocal'
import { randomRoute, type RandomRoute } from './randomRoute'

/** A terület körüli sáv (m): a határon futó utak és a kanyarodáshoz használt keresztutcák is beleférjenek */
const AREA_PAD_M = 800

function around([lng, lat]: LngLat, m: number): BBox {
  const dLat = metersToDegLat(m)
  const dLng = metersToDegLng(m, lat)
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat]
}

function pad(b: BBox, m: number): BBox {
  const dLat = metersToDegLat(m)
  const dLng = metersToDegLng(m, (b[1] + b[3]) / 2)
  return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat]
}

function intersect(a: BBox, b: BBox): BBox {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
}

export interface RandomRouteResult extends RandomRoute {
  /** A megtalált terület teljes neve (pl. „IV. kerület, Budapest, Magyarország”) */
  placeName: string
}

/**
 * Véletlen útvonal egy település vagy kerület utcáin. A területet a Nominatim adja meg (a határával együtt),
 * a terület egy véletlen pontja körül betöltjük a helyi térképadatokat, és abból állítjuk össze a hurkot.
 * Nagy területen (pl. egész Budapest) így minden kattintás a város más részére visz.
 */
export async function randomRouteIn(
  place: string,
  lengthM: number,
  opts: { signal?: AbortSignal; onStatus?: (text: string) => void; rnd?: () => number } = {},
): Promise<RandomRouteResult> {
  const rnd = opts.rnd ?? Math.random
  const index = await loadLocalIndex()
  if (!index) throw new Error('Nincs helyi térképadat az appban. Futtasd az `npm run osm` parancsot.')
  opts.onStatus?.(`Terület keresése: ${place}…`)
  const hit = (await geocode(place, { signal: opts.signal, limit: 1, area: true }))[0]
  if (!hit) throw new Error(`Nem találom: „${place}”. Adj meg települést vagy kerületet (pl. „Újpest”, „Budapest XI. kerület”, „Szeged”).`)
  const area = hit.area
  const inside = (p: LngLat) => (area ? booleanPointInPolygon(point(p), area) : bboxContains(hit.bbox, p))

  // A terület egy véletlen pontja (a határon belül); ha nem sikerül, a közepe
  let near: LngLat = [hit.lng, hit.lat]
  const [w, s, e, n] = hit.bbox
  for (let i = 0; i < 200; i++) {
    const p: LngLat = [w + rnd() * (e - w), s + rnd() * (n - s)]
    if (inside(p)) {
      near = p
      break
    }
  }
  // A hurok legfeljebb kb. a hossz harmadára távolodik el az indulóponttól
  const bbox = intersect(pad(hit.bbox, AREA_PAD_M), around(near, lengthM / 3 + AREA_PAD_M))

  opts.onStatus?.('Helyi térképadatok betöltése…')
  const osm = await fetchLocalOsmBBox(bbox, index, { signal: opts.signal })
  opts.onStatus?.('Útvonal összeállítása…')
  // A számítás előtt a böngésző kirajzolhatja az állapotot
  await new Promise((r) => setTimeout(r, 0))
  return { ...randomRoute(osm, { lengthM, inside, near, rnd }), placeName: hit.name }
}
