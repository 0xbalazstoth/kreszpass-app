import { describe, expect, it } from 'vitest'
import { PROFILES, resolveQuality } from './quality'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

describe('3D minőség', () => {
  it('kézzel választott minőség marad', () => {
    expect(resolveQuality('low', { userAgent: MAC, hardwareConcurrency: 16 })).toBe('low')
    expect(resolveQuality('high', { userAgent: IPHONE, hardwareConcurrency: 4 })).toBe('high')
  })

  it('automatikusan: gyenge eszközön alacsony, telefonon közepes, asztali gépen magas', () => {
    expect(resolveQuality('auto', { userAgent: MAC, hardwareConcurrency: 8, deviceMemory: 4 })).toBe('low')
    expect(resolveQuality('auto', { userAgent: IPHONE, hardwareConcurrency: 4 })).toBe('low')
    expect(resolveQuality('auto', { userAgent: IPHONE, hardwareConcurrency: 6 })).toBe('medium')
    expect(resolveQuality('auto', { userAgent: MAC, hardwareConcurrency: 8, deviceMemory: 8 })).toBe('high')
  })

  it('alacsony minőségen nincs árnyék és HDR égbolt, magason élesebb az árnyék', () => {
    expect(PROFILES.low).toMatchObject({ hdri: false, shadows: 0, normalMaps: false })
    expect(PROFILES.medium.shadows).toBeLessThan(PROFILES.high.shadows)
    expect(PROFILES.low.furnitureSpacing).toBeGreaterThan(PROFILES.high.furnitureSpacing)
  })
})
