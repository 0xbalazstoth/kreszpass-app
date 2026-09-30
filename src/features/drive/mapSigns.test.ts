import { describe, expect, it } from 'vitest'
import { route } from '../../data/__fixtures__/testMap'
import type { Situation } from '../../domain/types'
import { metersBetween, RouteGeom } from '../../lib/geo'
import { LIGHT_ICON, sceneMapPins } from './mapSigns'

// A tesztútvonal első szakasza keletre halad (Fő utca), 300 m-nél a 4-es csomópont
const geom = new RouteGeom(route)
const at = (d: number): Situation => {
  const [lng, lat] = geom.pointAt(d)
  return { id: 's1', routeId: 'r', d, lng, lat, bearing: 90, kind: 'give_way', turn: 'straight', needsReview: false, source: 'osm' }
}

describe('a térkép táblái', () => {
  it('csak a jelenet tábláját mutatja, az út jobb oldalán, a helyzet előtt', () => {
    const s = at(200)
    const pins = sceneMapPins(route, s, { layout: 'junction', turn: 'straight', mySign: 'give_way', cars: [] })
    expect(pins.map((p) => p.sign)).toEqual(['B-001'])
    const [lng, lat] = pins[0].lngLat
    // Keletre haladva a jobb oldal dél
    expect(lat).toBeLessThan(s.lat)
    expect(lng).toBeLessThan(s.lng)
    expect(metersBetween(pins[0].lngLat, [s.lng, s.lat])).toBeLessThan(15)
  })

  it('lámpás helyzetnél lámpajelet ad, egyenrangúnál semmit', () => {
    expect(sceneMapPins(route, at(200), { layout: 'junction', turn: 'left', light: 'green', cars: [] }).map((p) => p.sign)).toEqual([LIGHT_ICON])
    expect(sceneMapPins(route, at(200), { layout: 'junction', turn: 'straight', cars: [] })).toEqual([])
  })

  it('körforgalomnál az előjelző tábla messzebb áll', () => {
    const pins = sceneMapPins(route, at(250), { layout: 'roundabout', turn: 'straight', mySign: 'roundabout', cars: [] })
    expect(pins.map((p) => p.sign)).toEqual(['B-001', 'A-056'])
    expect(pins[1].lngLat[0]).toBeLessThan(pins[0].lngLat[0])
  })
})
