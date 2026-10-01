import type { LineString } from 'geojson'
import { loadOsmForRoute } from '../../data/osmSource'
import { fillFromRoutes, roadSignsAlongRoute, type RoadSign } from '../../data/roadSigns'
import { generateSituations } from '../../data/situations'
import { shuffle } from '../../domain/questions'
import type { Route } from '../../domain/types'
import { db, situationsOf } from '../../db'

/** Egy tábla a gyakorláshoz, a valódi helyével */
export interface RoadPlace {
  routeId: string
  routeName: string
  line: LineString
  sign: RoadSign
}

/** Egy útvonal valódi táblái: a helyi OSM-csempékből és az útvonal (ellenőrzött) helyzeteiből */
export async function routeSigns(route: Route, signal?: AbortSignal): Promise<RoadSign[]> {
  const [stored, osm] = await Promise.all([situationsOf(route.id), loadOsmForRoute(route.line, { signal })])
  // Ha az útvonalon még nem futott a helyzetfelismerés, itt felismerjük (nem tároljuk), hogy legyenek táblák
  const situations = stored.length ? stored : generateSituations(route.line, osm.data, { routeId: route.id })
  return roadSignsAlongRoute(route.line, osm.data, situations)
}

export interface RoadDrill {
  places: RoadPlace[]
  /** Ennyi valódi táblát találtunk összesen (a választott útvonalon, illetve az összes útvonalon) */
  available: number
}

/**
 * A gyakorlás táblái haladási sorrendben. Egy választott útvonalnál annak egy véletlen szakasza; véletlen útvonalnál
 * a mentett útvonalak véletlen sorrendjében útvonalanként egy-egy szakasz, amíg össze nem jön `count` tábla.
 */
export async function pickRoadDrill(routeId: string | 'random', count: number, opts: { signal?: AbortSignal; onStatus?: (s: string) => void } = {}): Promise<RoadDrill> {
  const routes = routeId === 'random' ? shuffle(await db.routes.toArray(), Math.random) : [await db.routes.get(routeId)].filter((r): r is Route => !!r)
  const perRoute: RoadPlace[][] = []
  let available = 0
  for (const route of routes) {
    opts.onStatus?.(`Táblák keresése: ${route.name || 'névtelen útvonal'}…`)
    const signs = await routeSigns(route, opts.signal)
    available += signs.length
    perRoute.push(signs.map((sign) => ({ routeId: route.id, routeName: route.name, line: route.line, sign })))
    // Véletlen útvonalnál elég addig keresni, amíg megvan a kért szám
    if (available >= count) break
  }
  return { places: fillFromRoutes(perRoute, count), available }
}
