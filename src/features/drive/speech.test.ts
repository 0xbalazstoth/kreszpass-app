import { describe, expect, it } from 'vitest'
import { parseSpokenNumber } from './speech'

describe('parseSpokenNumber', () => {
  it('felismeri a magyar számneveket és számjegyeket', () => {
    expect(parseSpokenNumber('egy')).toBe(1)
    expect(parseSpokenNumber('Kettő')).toBe(2)
    expect(parseSpokenNumber('a kettes')).toBe(2)
    expect(parseSpokenNumber('három')).toBe(3)
    expect(parseSpokenNumber('négy')).toBe(4)
    expect(parseSpokenNumber('3')).toBe(3)
  })
  it('nem téveszti össze a hosszabb szavakkal', () => {
    expect(parseSpokenNumber('egyenesen')).toBeNull()
    expect(parseSpokenNumber('kettőszáz')).toBeNull()
    expect(parseSpokenNumber('semmi')).toBeNull()
  })
})
