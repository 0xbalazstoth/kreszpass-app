import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(import.meta.dirname, '..', '..', '..', 'public', '3d')
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as {
  id: string
  kind: 'texture' | 'hdri' | 'model'
  source: string
  authors: string[]
  license: string
  file?: string
}[]

describe('3D anyagok (public/3d)', () => {
  it('minden anyag CC0 közkincs, forrással és szerzővel', () => {
    expect(manifest.length).toBeGreaterThan(0)
    for (const a of manifest) {
      expect(a.license, a.id).toBe('CC0')
      expect(a.source, a.id).toMatch(/^https:\/\/(polyhaven\.com\/a|poly\.pizza\/m)\//)
      expect(a.authors.length, a.id).toBeGreaterThan(0)
    }
  })

  it('a felületek, az égbolt és a modellek fájljai megvannak', () => {
    const surfaces = ['asphalt', 'pavement', 'kerb', 'plaster', 'plaster_rough', 'plaster_grey', 'brick', 'grass']
    for (const s of surfaces) for (const map of ['diff', 'nor', 'arm']) expect(existsSync(join(DIR, 'textures', s, `${map}.jpg`)), `${s}/${map}`).toBe(true)
    expect(existsSync(join(DIR, 'hdri', 'sky.hdr'))).toBe(true)
    for (const m of manifest.filter((x) => x.kind === 'model')) expect(existsSync(join(DIR, m.file!)), m.id).toBe(true)
  })
})
