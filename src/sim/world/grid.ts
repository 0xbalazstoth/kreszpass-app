import type { XZ } from './project'

/**
 * Egyszerű térbeli rács gyors „mi van a közelben” kérdésekhez. Minden elem azokba a cellákba kerül, amelyeket
 * a befoglaló téglalapja (a megadott ráhagyással) érint.
 */
export class Grid<T> {
  private cells = new Map<number, T[]>()
  readonly cell: number

  constructor(cell = 25) {
    this.cell = cell
  }

  private key(cx: number, cz: number): number {
    // Két 16 bites cellaindex egy számban (±800 km-ig elég)
    return (cx + 32768) * 65536 + (cz + 32768)
  }

  add(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const c = this.cell
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++)
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const k = this.key(cx, cz)
        const list = this.cells.get(k)
        if (list) list.push(item)
        else this.cells.set(k, [item])
      }
  }

  addSegment(item: T, a: XZ, b: XZ, pad: number): void {
    this.add(item, Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad)
  }

  /** A pont cellájának elemei (a ráhagyás miatt ebben benne van minden, ami ráhagyáson belül közel van) */
  at([x, z]: XZ): T[] {
    return this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? []
  }

  /** Az r sugarú környezet celláinak elemei (ismétlődés nélkül) */
  near([x, z]: XZ, r: number): T[] {
    const c = this.cell
    const out = new Set<T>()
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++)
      for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) for (const it of this.cells.get(this.key(cx, cz)) ?? []) out.add(it)
    return [...out]
  }
}
