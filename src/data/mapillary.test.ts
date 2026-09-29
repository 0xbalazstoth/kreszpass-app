import type { LineString } from 'geojson'
import { describe, expect, it } from 'vitest'
import type { Situation } from '../domain/types'
import { RouteGeom } from '../lib/geo'
import { mergeSigns, pickApproachFrames, signToKind, type MlImage, type MlSign } from './mapillary'

// Kelet felé tartó, kb. 300 m-es egyenes (47.5° szélességen 0.001° ≈ 75 m)
const line: LineString = { type: 'LineString', coordinates: [[19.0, 47.5], [19.004, 47.5]] }
const geom = new RouteGeom(line)

const img = (id: string, lng: number, angle: number): MlImage => ({ id, url: `u/${id}`, angle, lngLat: [lng, 47.5], capturedAt: 0 })

describe('pickApproachFrames', () => {
  it('a helyzet előtti, menetirányba néző képeket választja, közeledési sorrendben', () => {
    const d = 250
    const images = [
      img('messze-elotte', 19.0033 - 0.0015, 90), // ~140 m-rel előtte: nem kell
      img('70m', 19.0033 - 0.00093, 92),
      img('50m', 19.0033 - 0.00066, 88),
      img('32m', 19.0033 - 0.00043, 90),
      img('16m', 19.0033 - 0.00021, 90),
      img('rossz-irany', 19.0033 - 0.00021, 270), // szembe néz
    ]
    const frames = pickApproachFrames(geom, d, images)
    expect(frames.map((f) => f.id)).toEqual(['70m', '50m', '32m', '16m'])
  })

  it('ha nincs megfelelő kép, üres listát ad', () => {
    expect(pickApproachFrames(geom, 250, [img('x', 19.0, 270)])).toEqual([])
  })
})

describe('signToKind', () => {
  it('a Mapillary táblakódokat helyzettípusra fordítja', () => {
    expect(signToKind('regulatory--stop--g1')).toEqual({ kind: 'stop' })
    expect(signToKind('regulatory--yield--g1')).toEqual({ kind: 'give_way' })
    expect(signToKind('regulatory--maximum-speed-limit-30--g1')).toEqual({ kind: 'speed_change', speed: 30 })
    expect(signToKind('information--pedestrians-crossing--g1')).toEqual({ kind: 'crossing' })
    expect(signToKind('warning--curve-left--g1')).toBeNull()
  })
})

describe('mergeSigns', () => {
  const existing: Situation[] = [
    { id: 'a', routeId: 'r', d: 100, lng: 19.0013, lat: 47.5, bearing: 90, kind: 'equal', turn: 'straight', needsReview: false, source: 'osm' },
  ]
  const sign = (id: string, value: string, lng: number, lat = 47.50005): MlSign => ({ id, value, lngLat: [lng, lat] })

  it('csak az új, útvonal melletti táblákból készít ellenőrizendő helyzetet', () => {
    const added = mergeSigns(
      line,
      existing,
      [
        sign('1', 'regulatory--yield--g1', 19.0014), // meglévő kereszteződés mellett: kihagyja
        sign('2', 'regulatory--maximum-speed-limit-30--g1', 19.0027), // új sebességkorlát
        sign('3', 'regulatory--stop--g1', 19.0027, 47.502), // messze az úttól
        sign('4', 'warning--children--g1', 19.003), // nem kezelt tábla
      ],
      'r',
      () => 'new',
    )
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ kind: 'speed_change', speedTo: 30, needsReview: true, source: 'mapillary' })
  })
})
