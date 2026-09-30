import { beforeEach, describe, expect, it, vi } from 'vitest'
import { geocode, resetGeocodeThrottle } from './geocode'
import { cleanRows, pickNearby } from './streetRouteSource'

const hit = (lat: number, lon: number) => ({
  display_name: `x ${lat},${lon}`,
  lat: String(lat),
  lon: String(lon),
  boundingbox: [String(lat - 0.001), String(lat + 0.001), String(lon - 0.001), String(lon + 0.001)],
})

beforeEach(() => resetGeocodeThrottle())

describe('címkeresés (Nominatim)', () => {
  it('magyarországi találatokat kér, és a befoglaló téglalapot [ny, d, k, é] sorrendre alakítja', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([hit(47.5, 19.05)])))
    const [r] = await geocode('Egér út, Budapest', { fetchImpl })
    const url = new URL(String(fetchImpl.mock.calls[0][0]))
    expect(url.hostname).toBe('nominatim.openstreetmap.org')
    expect(url.searchParams.get('countrycodes')).toBe('hu')
    expect(url.searchParams.get('q')).toBe('Egér út, Budapest')
    expect(r.bbox[0]).toBeCloseTo(19.049)
    expect(r.bbox[1]).toBeCloseTo(47.499)
    expect(r.bbox[2]).toBeCloseTo(19.051)
    expect(r.bbox[3]).toBeCloseTo(47.501)
  })

  it('elérhetetlen szolgáltatásnál érthető hibát ad', async () => {
    await expect(geocode('x', { fetchImpl: vi.fn().mockRejectedValue(new TypeError('network')) })).rejects.toThrow(/nem érhető el/)
    resetGeocodeThrottle()
    await expect(geocode('x', { fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })) })).rejects.toThrow(/503/)
  })
})

describe('azonos nevű utcák közül a közeliek választása', () => {
  const g = (lat: number, lon: number) => ({ name: '', lat, lng: lon, bbox: [lon, lat, lon, lat] as [number, number, number, number] })

  it('a másik utcához közeli találatot választja', () => {
    // Két „Kossuth utca”: az egyik a Petőfi utca mellett, a másik 10 km-re
    const kossuth = [g(47.6, 19.2), g(47.5, 19.05)]
    const petofi = [g(47.501, 19.052)]
    const chosen = pickNearby([kossuth, petofi])
    expect(chosen[0]).toBe(kossuth[1])
    expect(chosen[1]).toBe(petofi[0])
  })
})

describe('utcasorok tisztítása', () => {
  it('az üres település a fölötte lévő soré, az üres utca kimarad, a beillesztett lista külön sorokra bomlik', () => {
    expect(
      cleanRows([
        { town: 'Budaörs', street: 'Szabadság út' },
        { town: '', street: '' },
        { town: 'Budapest XI. kerület', street: 'Budaörsi út – Villányi út' },
        { town: '  ', street: 'Fadrusz u.' },
      ]),
    ).toEqual([
      { town: 'Budaörs', street: 'Szabadság út' },
      { town: 'Budapest XI. kerület', street: 'Budaörsi út' },
      { town: 'Budapest XI. kerület', street: 'Villányi út' },
      { town: 'Budapest XI. kerület', street: 'Fadrusz u.' },
    ])
  })
})
